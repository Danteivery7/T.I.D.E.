import { comparePassword, isAuthenticated, json } from '../../_lib/auth.js';
import { readCloud, mergeAndWrite } from '../../_lib/state.js';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function entryText(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return cleanText(entry.text ?? '', 12000);
}

function splitEvents(text) {
  return String(text || '').split(/\s*,\s*|\n+/).map((s) => s.trim()).filter(Boolean);
}

function wordsToCount(s) {
  const lower = s.toLowerCase();
  const direct = lower.match(/\b(\d{1,3})\s*(?:times|x|calls?|spawns?|casualties|collisions?)\b/);
  if (direct) return Math.max(1, Number(direct[1]));
  if (/\btwice\b/.test(lower)) return 2;
  if (/\bthree times\b/.test(lower)) return 3;
  if (/\bfour times\b/.test(lower)) return 4;
  return 1;
}

function negatedMigraine(s) {
  return /(almost\s+(?:got|had).*migraine.*(?:didn'?t|did not)|before (?:it|the headache) became a migraine|didn'?t (?:get|have) a migraine|not a migraine|avoided (?:a )?migraine|rid of .* before .*migraine)/i.test(s);
}

function trackerDetection(trackerId, date, count, snippet, extra = {}) {
  return { id: `${trackerId}:${date}:${Math.random().toString(36).slice(2, 9)}`, trackerId, date, count, source: 'detected', snippet, ...extra };
}

function dedupeDetections(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.trackerId}|${item.date}|${item.snippet}|${item.result || ''}|${item.value || ''}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

function detectFromEntry(date, text) {
  const events = splitEvents(text);
  const out = [];
  const wholeMigraineNegated = /(?:started|start(?:ed)?|almost).*?migraine[\s\S]{0,500}?(?:before .*?became a migraine|rid of .*?before .*?migraine|didn'?t .*?migraine|did not .*?migraine)/i.test(String(text || ''));
  let sawDailyComplete = false;
  let sawDailyMiss = false;

  for (const segment of events) {
    const s = segment.toLowerCase();
    if (/\b(?:mors|moors) mutual\b/i.test(segment)) out.push(trackerDetection('mors-mutual', date, wordsToCount(segment), segment));
    if (/\bmigraine\b/i.test(segment) && !wholeMigraineNegated && !negatedMigraine(segment)) out.push(trackerDetection('migraines', date, wordsToCount(segment), segment));
    if (/hong kong/i.test(segment) && /(spawn|spawned|spawned in)/i.test(segment)) out.push(trackerDetection('hong-kong', date, wordsToCount(segment), segment));
    if (/google car/i.test(segment) && /(casualt|hit|killed|collision|ran into|destroy)/i.test(segment)) out.push(trackerDetection('google-car', date, wordsToCount(segment), segment));
    if (/walked into/i.test(segment) && /(object|wall|door|counter|something)/i.test(segment)) out.push(trackerDetection('apartment-collisions', date, wordsToCount(segment), segment));
    const streak = segment.match(/(?:geoguessr|10k).*?streak\s+(?:to\s+|of\s+)?(\d{1,5})/i) || segment.match(/extended geoguessr streak to\s+(\d{1,5})/i);
    if (streak) out.push(trackerDetection('geoguessr-10k', date, 1, segment, { value: Number(streak[1]) }));
    if (/daily challenge/i.test(segment)) {
      if (/lost|missed|broke|forgot|didn'?t|did not/.test(s) && /streak|challenge/.test(s)) sawDailyMiss = true;
      if (/did|played|completed|finished|preserved|extended|beat|scored|got \d|daily challenge for/i.test(s) && !/lost daily challenge|missed daily challenge|didn'?t do|did not do/.test(s)) sawDailyComplete = true;
      if (/monty/i.test(segment)) {
        if (/beat|won|destroyed|demolished/i.test(segment)) out.push(trackerDetection('monty-dc', date, 1, segment, { result: 'win' }));
        else if (/lost|lose|lost to/i.test(segment)) out.push(trackerDetection('monty-dc', date, 1, segment, { result: 'loss' }));
      }
    }
  }

  if (sawDailyComplete) out.push(trackerDetection('daily-challenge', date, 1, 'Daily Challenge completed', { result: 'complete' }));
  else if (sawDailyMiss) out.push(trackerDetection('daily-challenge', date, 0, 'Daily Challenge missed', { result: 'miss' }));
  return dedupeDetections(out);
}

function saveEntry(state, date, text) {
  const now = new Date().toISOString();
  state.entries ||= {};
  state.occurrences = Array.isArray(state.occurrences) ? state.occurrences : [];
  const previous = state.entries[date];
  const revisions = [...(previous?.revisions || [])];
  if (previous && previous.text !== text) revisions.unshift({ text: previous.text, savedAt: previous.updatedAt || now });
  state.entries[date] = { text: String(text || '').trim(), updatedAt: now, revisions: revisions.slice(0, 20) };
  state.occurrences = state.occurrences.filter((x) => !(x.date === date && x.source === 'detected'));
  state.occurrences.push(...detectFromEntry(date, text));
  state.updatedAt = now;
}

async function authorize(context) {
  if (await isAuthenticated(context.env, context.request)) return true;
  const code = context.request.headers.get('x-tide-access-code') || '';
  return comparePassword(context.env, code);
}

export async function onRequestGet(context) {
  if (!await authorize(context)) return json({ error: 'Unauthorized.' }, 401);
  const url = new URL(context.request.url);
  const date = cleanText(url.searchParams.get('date'), 10);
  if (!DATE_RE.test(date)) return json({ error: 'Invalid date.' }, 400);

  try {
    const todayPath = `$.entries."${date}".text`;
    const todayRow = await context.env.TIDE_DB
      .prepare('SELECT json_extract(json, ?1) AS text FROM tide_state WHERE id = 1')
      .bind(todayPath)
      .first();

    const recentResult = await context.env.TIDE_DB
      .prepare(`SELECT e.key AS date, json_extract(e.value, '$.text') AS text
                FROM tide_state, json_each(json, '$.entries') AS e
                WHERE tide_state.id = 1 AND e.key < ?1
                ORDER BY e.key DESC
                LIMIT 5`)
      .bind(date)
      .all();

    const recent = (recentResult?.results || [])
      .map((row) => ({ date: cleanText(row?.date, 10), text: cleanText(row?.text, 12000) }))
      .filter((row) => row.date && row.text);

    return json({ date, today: cleanText(todayRow?.text, 12000), recent });
  } catch (error) {
    return json({ error: error?.message || 'Shared storage request failed.' }, 500);
  }
}

export async function onRequestPost(context) {
  if (!await authorize(context)) return json({ error: 'Unauthorized.' }, 401);
  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400); }

  const date = cleanText(body?.date, 10);
  const text = cleanText(body?.text, 4000);
  if (!DATE_RE.test(date)) return json({ error: 'Invalid date.' }, 400);
  if (!text) return json({ error: 'Text is required.' }, 400);

  try {
    const current = await readCloud(context.env);
    if (!current.state) return json({ error: 'T.I.D.E. state has not been initialized yet.' }, 409);
    const state = structuredClone(current.state);
    const previous = entryText(state.entries?.[date]);
    const combined = previous ? `${previous}, ${text}` : text;
    saveEntry(state, date, combined);
    const saved = await mergeAndWrite(context.env, state);
    return json({ ok: true, date, text: entryText(saved.state?.entries?.[date]) });
  } catch (error) {
    return json({ error: error?.message || 'Shared storage request failed.' }, 500);
  }
}
