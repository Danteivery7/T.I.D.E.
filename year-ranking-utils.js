// Presentation-only helpers for user-curated year rankings.
// They never infer scores or rewrite saved rankings.
export function yearRankStatus(year,nowYear){
  const y=Number(year),current=Number(nowYear);
  if(!Number.isInteger(y)||!Number.isInteger(current))return 'unknown';
  if(y>current)return 'projected';
  if(y===current)return 'in-progress';
  return 'completed';
}
export function yearRankSummary(list,nowYear){
  const years=Array.isArray(list)?list.map(Number).filter(Number.isInteger):[];
  return {
    total:years.length,
    completed:years.filter(y=>yearRankStatus(y,nowYear)==='completed').length,
    inProgress:years.filter(y=>yearRankStatus(y,nowYear)==='in-progress').length,
    projected:years.filter(y=>yearRankStatus(y,nowYear)==='projected').length,
    leader:years.length?years[0]:null
  };
}
export function repositionYear(list,from,to){
  if(!Array.isArray(list))return null;
  const source=Number(from),target=Number(to);
  if(!Number.isInteger(source)||!Number.isInteger(target)||source<0||target<0||source>=list.length||target>=list.length||source===target)return null;
  const reordered=list.slice(),[year]=reordered.splice(source,1);
  reordered.splice(target,0,year);
  return reordered;
}
export const YEAR_RANKING_STATUS_LABELS={
  'completed':'Completed year',
  'in-progress':'Year in progress',
  'projected':'Future year',
  'unknown':'Year'
};
