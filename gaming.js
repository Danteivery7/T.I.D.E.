import {gaming,pullGaming} from './gaming-data.js';
import {autoRefreshGaming} from './gaming-live.js';
import {decorateGamingReviews,wireGamingView} from './gaming-view.js';
// Register period navigation before account refresh so a quick switch from
// Today/Calendar retains the exact selected T.I.D.E. month.
wireGamingView();
await pullGaming();
decorateGamingReviews();
autoRefreshGaming();
window.__tideGaming={get state(){return gaming();}};
