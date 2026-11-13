// Date-based presentation. No persistence or diary edits.
import { holidaysOnDate } from './calendar-data.js';

export const ERA_THEMES={
  2024:{name:'Forest Night',main:'#3b976f',secondary:'#b4d6b9',dark:'#091811'},
  2025:{name:'Amber Era',main:'#ed8e47',secondary:'#f6d3a4',dark:'#18100c'},
  2026:{name:'Midnight Blue',main:'#7c9cff',secondary:'#5ee0cc',dark:'#080c17'},
  2027:{name:'Golden Hour',main:'#e8bb57',secondary:'#ffdc86',dark:'#0c0c0c'}
};
export const THEME_PRIORITY=['personal-override','holiday','birthday','vice-city','year'];
const YEAR_RE=/^\d{4}-\d{2}-\d{2}$/;
export function themeYear(date){
  const n=Number(String(date||'').slice(0,4));
  return n===2024||n===2025||n===2026?n:2027<=n?2027:2026;
}
const holidays={
  "New Year's Day":'new-year',
  "New Year's Eve":'new-year',
  Thanksgiving:'thanksgiving',
  "St. Patrick's Day":'st-patrick',
  "Christmas Eve":'christmas',
  "Christmas Day":'christmas',
  Halloween:'halloween',
  "Valentine's Day":'valentine',
  "Independence Day":'independence',
  "Easter Sunday":'easter',
  'Memorial Day':'patriotic',
  "Veterans Day":'patriotic',
  'Juneteenth':'patriotic',
  "Mother's Day":'family',
  "Father's Day":'family',
  'Labor Day':'patriotic'
};
export function themeForDate(date,events=[]){
  const d=String(date||'');
  const era=themeYear(d);
  if(!YEAR_RE.test(d))return{era,occasion:'',viceCity:false,name:ERA_THEMES[era].name};
  const themed=events.find(e=>e&&e.theme&&e.theme!=='none'&&e.kind!=='birthday');
  if(themed)return{era,occasion:themed.theme,viceCity:false,name:themed.name||themed.title};
  const h=holidaysOnDate(d).find(e=>holidays[e.name]);
  if(h)return{era,occasion:holidays[h.name],viceCity:false,name:h.name};
  if(d.slice(5)==='07-31')return{era,occasion:'my-birthday',viceCity:false,name:'My Birthday'};
  if(d>='2026-11-19'&&d<='2026-12-31')return{era,occasion:'',viceCity:true,name:'GTA VI'};
  return{era,occasion:'',viceCity:false,name:ERA_THEMES[era].name};
}
export function setThemeForDate(root,date,events=[]){
  const theme=themeForDate(date,events),body=document.body;
  body.dataset.tideEra=String(theme.era);
  if(theme.occasion)body.dataset.tideOccasion=theme.occasion;else delete body.dataset.tideOccasion;
  body.classList.toggle('vice-city-season',theme.viceCity);
  root?.classList.toggle('vice-city-nov19',theme.viceCity);
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.content=theme.viceCity?'#251735':theme.occasion==='thanksgiving'?'#24190f':ERA_THEMES[theme.era].dark;
  return theme;
}
