# T.I.D.E.

**Things I Did Everyday** — a local-first personal diary, tracker, research engine, and year-in-review site.

The application is designed to run as a static Netlify site. Typing, calendar navigation, tracker calculations, records, On This Day, and Ask T.I.D.E. all run in the browser. Netlify functions are used only for explicit cross-device synchronization.

## Privacy

The repository contains application code only. Diary data is stored in the browser and, when cloud sync is enabled, in a private Netlify Blobs store protected by an access code.

## Netlify

Set `TIDE_ACCESS_CODE` in the Netlify environment to enable private cloud sync. Without it, the app remains fully usable in local-only mode.
