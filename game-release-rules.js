// T.I.D.E. game-specific tracking policy: GTA VI gameplay begins on Nov 19, 2026.
// Earlier references (preorders, trailers, anticipation, launch plans) stay in
// the diary, but cannot count as play sessions or first/last-played evidence.
export const GTA_VI_FIRST_PLAY_DATE='2026-11-19';
const gameName=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function isGtaViGame(name){
 return /^(?:gta ?(?:vi|6)|grand theft auto ?(?:vi|6))(?: online)?$/.test(gameName(name));
}
export function mentionsGtaVi(text){
 return /(?:^|[^a-z0-9])(?:gta[ -]?(?:vi|6)|grand theft auto[ -]?(?:vi|6))(?=$|[^a-z0-9])/i.test(String(text||''));
}
export function permitsDatedGamePlay(date,title){
 return !isGtaViGame(title)||/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))&&String(date)>=GTA_VI_FIRST_PLAY_DATE;
}
