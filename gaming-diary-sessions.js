/* Diary-first gaming sessions: diary starts define sessions, account refreshes
   define hours, and historical diary entries are included automatically. */
import {currentSources,displayTitle,keyTitle} from './gaming-data.js';

const START=/\b(?:replayed|played|playing|started\s+(?:to\s+)?play(?:ing)?|began\s+play(?:ing)?)\b/gi;
const BREAK=/[,;.!?\n]|\b(?:and\s+then|afterwards|later\s+on)\b/i;
const CONTINUATION=/(?:\bcontinued|\bcontinuing|\bkept|\bkeep|\bstill|\bstopped|\bstop|\bquit|\bfinished|\bwas\s+still|\bwere\s+still)\s+(?:to\s+)?$/i;
const NEGATED=/(?:\b(?:didn['’]?t|did\s+not|wasn['’]?t|weren['’]?t|never|not|without|couldn['’]?t|don['’]?t|won['’]?t|shouldn['’]?t|wouldn['’]?t|haven['’]?t|hadn['’]?t|want(?:ed)?\s+to|plan(?:ned)?\s+to|going\s+to|will|might)\b)(?:\W+\w+){0,3}\s*$/i;
const OTHER_ACTOR=/(?:\b(?:he|she|they|my\s+(?:friend|brother|sister|mom|dad|cousin)|(?:a|the)\s+(?:friend|player|kid))\s+(?:(?:was|were|had|has)\s+)?)$/i;
const WATCHED=/(?:\b(?:watched|watching|saw|streamed\s+someone)\s+(?:\w+\s+){0,3})$/i;
const NO_TITLE=/^(?:with|for|in|on|at|of|around|outside|basketball|baseball|football|soccer|sports|guitar|piano|music|cards|board\s+games?|chess|nothing|someone|everyone|friends?|somebody|anything)$/i;
const STOP_WORD=/^(?:and|or|then|for|with|while|until|after|before|at|in|on|to|of|by|again|later|another|this|that|the|some|a|an|my|our|his|her|all|day|night|hours?|mins?|minutes?|times?|more|from|but|because|was|were|which|when|where|i|we|me|myself|friends?|working|watching|went|did|ate|got|continued|still)$/i;

const LABELS=[
  ['AdVenture Capitalist',['adventure capitalist','adventure capitalists','adcap','ad cap']],
  ['GeoGuessr',['geoguessr','geo guessr','geo guesser','geoguesser','geoguess','geo dc']],
  ['The Crew Motorfest',['the crew motorfest','crew motorfest','motorfest','the crew']],
  ['The Crew 2',['the crew 2','crew 2']],
  ['Grand Theft Auto VI',['gta vi','gta 6','grand theft auto 6','grand theft auto vi']],
  ['Grand Theft Auto V',['gta online','grand theft auto online','grand theft auto v','grand theft auto 5','gta v','gta 5','gtav','gta']],
  ['Rocket League',['rocket league','rocketleague']],
  ['Roblox',['roblox']],['Minecraft',['minecraft']],
  ['Red Dead Redemption 2',['red dead redemption 2','red dead redemption ii','red dead 2','rdr2','rdr 2']],
  ['Killer Frequency',['killer frequency']],['Fall Guys',['fall guys']],
  ['Fortnite',['fortnite']],['Mario Kart',['mario kart']],
  ['Nintendo Switch Sports',['nintendo switch sports','switch sports']],
  ['Super Smash Bros. Ultimate',['super smash bros ultimate','smash ultimate']],
  ['The Sims 4',['the sims 4','sims 4']],['Stardew Valley',['stardew valley']],
  ['American Truck Simulator',['american truck simulator','ats game']],
  ['Cities: Skylines',['cities skylines']],
  ['World of Warcraft',['world of warcraft','wow game']],
  ['Valorant',['valorant']],['Counter-Strike 2',['counter strike 2','cs2']],
  ['Overwatch 2',['overwatch 2']],
  ['EA Sports FC 26',['fc 26','ea fc 26']],
  ['NBA 2K26',['nba 2k26','2k26']],['NBA 2K25',['nba 2k25','2k25']],
  ['NBA 2K24',['nba 2k24','2k24']],
  ['NASCAR Heat 5',['nascar heat 5']],['NASCAR Heat 4',['nascar heat 4']],
  ['Wreckfest',['wreckfest']],['Wordle',['wordle']],
  ['Balatro',['balatro']],['Clash Royale',['clash royale']],
  ['Clash of Clans',['clash of clans']],['Pokemon GO',['pokemon go','pokémon go']],
  ['Animal Crossing: New Horizons',['animal crossing new horizons','animal crossing']],
  ['Genshin Impact',['genshin impact']],['Geometry Dash',['geometry dash']],
  ['Brawl Stars',['brawl stars']]
];

const regexEscape=text=>[...text].map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
let cachedSignature='',cachedNames=[];
function gameNames(){
  const live=currentSources().map(x=>String(x.title||'').trim()).filter(Boolean);
  const signature=live.join('\u001f');
  if(signature===cachedSignature&&cachedNames.length)return cachedNames;
  const map=new Map();
  function add(alias,title){
    const n=String(alias||'').trim().toLowerCase();if(n.length<3)return;
    if(!map.has(n))map.set(n,{alias:n,title:displayTitle(title),gameKey:keyTitle(title)});
  }
  for(const [title,names] of LABELS)for(const alias of names)add(alias,title);
  for(const title of live)add(title,title);
  cachedNames=[...map.values()].map(x=>({
    ...x,test:new RegExp('(?<![a-z0-9])'+regexEscape(x.alias).replace(/\s+/g,'\\s+')+'(?![a-z0-9])','gi')
  })).sort((a,b)=>b.alias.length-a.alias.length);
  cachedSignature=signature;
  return cachedNames;
}

function mentionedGames(phrase,vocab){
  const matches=[];
  for(const name of vocab){
    name.test.lastIndex=0;
    for(let m;(m=name.test.exec(phrase));){
      const start=m.index,end=start+m[0].length;
      if(matches.some(x=>start<x.end&&end>x.start))continue;
      matches.push({...name,start,end});
    }
  }
  matches.sort((a,b)=>a.start-b.start||b.end-a.end);
  const seen=new Set(),out=[];
  for(const m of matches){
    if(seen.has(m.gameKey))continue;
    seen.add(m.gameKey);
    out.push({title:m.title,gameKey:m.gameKey});
  }
  return out;
}
function unnamedGame(phrase){
  const clean=phrase.trim().replace(/^(?:a\s+game\s+(?:called|named)\s+|the\s+game\s+|some\s+|a\s+bit\s+of\s+)/i,'');
  const quoted=clean.match(/^["“'‘]([^"”'’]{3,65})["”'’]/);
  if(quoted)return quoted[1].trim();
  if(/^a(?:nother)?\s+(?:video\s+)?game\b/i.test(clean))return'Unspecified video game';
  const words=clean.match(/^[\wÀ-ÿ][\wÀ-ÿ'’&:.-]*(?:\s+[\wÀ-ÿ][\wÀ-ÿ'’&:.-]*){0,5}/)?.[0]?.split(/\s+/)||[];
  const title=[];
  for(const word of words){
    if(STOP_WORD.test(word))break;
    title.push(word);
  }
  if(!title.length||NO_TITLE.test(title[0])||NO_TITLE.test(title.join(' ')))return null;
  if(title.length===1&&/^(?:it|them|one|game|games|stuff|something|anything)$/i.test(title[0]))return null;
  return title.join(' ');
}
function previousClause(text,start){
  const prefix=text.slice(Math.max(0,start-110),start).split(/[,;.!?\n]|\b(?:but|however|then|later|afterwards)\b/i).at(-1)||'';
  return prefix; // Retain trailing spaces for continuation/negation detection.
}
function actionContext(text,match,nextStart){
  const after=text.slice(match.index+match[0].length,Math.min(text.length,nextStart,match.index+180));
  const b=after.search(BREAK);
  return (b<0?after:after.slice(0,b)).trim();
}
export function gamingSessionsFromEntry(date,text,vocab=gameNames()){
  const source=String(text||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return[];
  const actions=[...source.matchAll(START)],sessions=[],seenOnDay=new Set();
  let lastGame=null;
  for(let i=0;i<actions.length;i++){
    const match=actions[i],prefix=previousClause(source,match.index);
    if(CONTINUATION.test(prefix)||NEGATED.test(prefix)||OTHER_ACTOR.test(prefix)||WATCHED.test(prefix))continue;
    const clause=actionContext(source,match,actions[i+1]?.index??source.length);
    let games=mentionedGames(clause,vocab);
    if(!games.length&&/^(?:again|some\s+more|more|it\s+again|that\s+again)\b/i.test(clause)&&lastGame)games=[lastGame];
    if(!games.length){
      const fallback=unnamedGame(clause);
      if(fallback)games=[{title:displayTitle(fallback),gameKey:keyTitle(fallback)}];
    }
    if(!games.length)continue;
    const ongoingOnly=match[0].toLowerCase()==='playing';
    for(const game of games){
      if(ongoingOnly&&seenOnDay.has(game.gameKey))continue;
      const id='diary-game:'+date+':'+String(match.index)+':'+game.gameKey;
      sessions.push({id,date,title:game.title,gameKey:game.gameKey,count:1,source:'diary-derived',
        snippet:source.slice(Math.max(0,match.index-24),Math.min(source.length,match.index+match[0].length+clause.length+6)).trim().slice(0,180),
        evidence:'explicit-play-mention'});
      seenOnDay.add(game.gameKey);
      lastGame=game;
    }
  }
  return sessions;
}
export function diaryGamingSessions(state,scope={}){
  const rows=[];
  for(const [date,entry] of Object.entries(state?.entries||{})){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    if(scope.month&&!date.startsWith(scope.month+'-'))continue;
    if(scope.year&&!date.startsWith(String(scope.year)+'-'))continue;
    if(scope.start&&date<scope.start||scope.end&&date>scope.end)continue;
    const text=typeof entry==='string'?entry:entry?.text;
    if(typeof text!=='string'||!/\bplay(?:ed|ing)\b|\breplayed\b/i.test(text))continue;
    rows.push(...gamingSessionsFromEntry(date,text));
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
