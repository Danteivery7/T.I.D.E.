// Explicitly chosen top-five dates. No inferred or algorithmic rankings.
const DAY=/^\d{4}-\d{2}-\d{2}$/;
export const FAVORITE_DAY_LIMIT=5;
export function favoriteDays(state,year){
  const y=String(year),stored=state?.favoriteDays?.[y];
  return Array.isArray(stored?.dates)?stored.dates.filter(d=>DAY.test(d)&&d.startsWith(y+'-')).filter((d,i,a)=>a.indexOf(d)===i).slice(0,FAVORITE_DAY_LIMIT):[];
}
export function saveFavoriteDays(state,year,dates){
  const y=Number(year);
  if(!Number.isInteger(y)||y<2024||y>2100)throw new Error('Choose a year from 2024 onward.');
  if(!Array.isArray(dates)||dates.length>FAVORITE_DAY_LIMIT)throw new Error('Choose up to five favorite days.');
  const cleaned=dates.map(d=>String(d||'').trim()).filter(Boolean);
  if(cleaned.some(d=>!DAY.test(d)||!d.startsWith(String(y)+'-')||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))throw new Error('All chosen days must be valid dates in the same year.');
  if(new Set(cleaned).size!==cleaned.length)throw new Error('You cannot rank the same day twice.');
  state.favoriteDays||={};
  state.favoriteDays[String(y)]={dates:cleaned,updatedAt:new Date().toISOString()};
  return cleaned;
}
export function yearsWithFavoriteDays(state,through=new Date().getFullYear()){
  const max=Math.min(Math.max(2024,Number(through)||2024),new Date().getFullYear(),2100);
  // Future favorite years may be stored, but must not appear in historical comparisons yet.
  const years=new Set(Object.keys(state?.favoriteDays||{}).map(Number).filter(y=>Number.isInteger(y)&&y>=2024&&y<=max));
  for(let year=2024;year<=max;year++)years.add(year);
  return [...years].sort((a,b)=>b-a);
}
export function favoriteDaysSuggestion(state,year){
  if(Number(year)===2026&&state?.entries?.['2026-06-13']?.text)return{date:'2026-06-13',reason:'Described in your diary as the greatest day of your life. Select it if it is your #1.'};
  return null;
}
