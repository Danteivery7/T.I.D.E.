import { isAuthenticated, json } from '../../_lib/auth.js';
import { readCloud, mergeAndWrite } from '../../_lib/state.js';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function entryText(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return cleanText(entry.text ?? entry.content ?? entry.body ?? entry.note ?? '', 12000);
}

function recentExamples(entries = {}, date, limit = 5) {
  return Object.keys(entries)
    .filter((key) => DATE_RE.test(key) && key < date)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((key) => ({ date: key, text: entryText(entries[key]) }))
    .filter((item) => item.text);
}

async function authorize(context) {
  return isAuthenticated(context.env, context.request);
}

export async function onRequestGet(context) {
  if (!await authorize(context)) return json({ error: 'Unauthorized.' }, 401);
  const url = new URL(context.request.url);
  const date = cleanText(url.searchParams.get('date'), 10);
  if (!DATE_RE.test(date)) return json({ error: 'Invalid date.' }, 400);
  try {
    const current = await readCloud(context.env);
    const entries = current.state?.entries || {};
    return json({
      date,
      today: entryText(entries[date]),
      recent: recentExamples(entries, date),
    });
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
    state.entries ||= {};
    const existing = state.entries[date];
    const previous = entryText(existing);
    const combined = previous ? `${previous}, ${text}` : text;
    const now = new Date().toISOString();

    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      if ('text' in existing) state.entries[date] = { ...existing, text: combined, updatedAt: now };
      else if ('content' in existing) state.entries[date] = { ...existing, content: combined, updatedAt: now };
      else if ('body' in existing) state.entries[date] = { ...existing, body: combined, updatedAt: now };
      else if ('note' in existing) state.entries[date] = { ...existing, note: combined, updatedAt: now };
      else state.entries[date] = { ...existing, text: combined, updatedAt: now };
    } else {
      state.entries[date] = { text: combined, createdAt: now, updatedAt: now };
    }

    const saved = await mergeAndWrite(context.env, state);
    return json({ ok: true, date, text: entryText(saved.state?.entries?.[date]) });
  } catch (error) {
    return json({ error: error?.message || 'Shared storage request failed.' }, 500);
  }
}
