# T.I.D.E. on Vercel

T.I.D.E. keeps the public app code in GitHub and the private diary database in a **Private Vercel Blob** store.

## Before the production deployment

1. Import `Danteivery7/T.I.D.E.` into Vercel.
2. Add the environment variable `TIDE_ACCESS_CODE` with the private code you want to use on your devices.
3. In the Vercel project, open **Storage**, create/connect a **Blob** store, and choose **Private** access.
4. Deploy the current `main` branch after both the access code and private Blob store are connected.

## Move the exact existing MacBook database

Browser localStorage is tied to the site/domain. A new Vercel URL cannot directly read the old Netlify site's localStorage, even on the same MacBook.

Before leaving the old MacBook site:

1. Open **Settings → Backup & Restore**.
2. Click **Download JSON Backup**. This exports the exact current T.I.D.E. database, including diary entries, revisions, monthly/yearly reviews, tracker state, GeoGuessr/Monty counters, imports, and other saved state.

On the new Vercel T.I.D.E. site:

1. Open **Settings → Backup & Restore**.
2. Use **Restore JSON** and select the backup from the old MacBook site.
3. Go to **Settings → Cloud Sync**.
4. Enter the `TIDE_ACCESS_CODE` and press **Connect**.
5. Connect immediately merges and uploads that restored full database into the private Vercel store.

Then open the same Vercel site on the PC and phone, enter the same access code once, and each device will pull/merge the same shared database.

Draft typing remains device-local until it is explicitly saved. Explicit T.I.D.E. saves update local storage and the shared private state. The service worker never caches `/api/*` responses, and simultaneous device saves use merge + ETag protection to avoid overwriting each other.
