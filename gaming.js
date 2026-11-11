import {gaming,pullGaming} from './gaming-data.js';
import {autoRefreshGaming} from './gaming-live.js';
import {decorateGamingReviews,wireGamingView} from './gaming-view.js';
await pullGaming();
wireGamingView();
decorateGamingReviews();
autoRefreshGaming();
window.__tideGaming={get state(){return gaming();}};
