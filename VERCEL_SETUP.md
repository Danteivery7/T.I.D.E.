# T.I.D.E. on Vercel

T.I.D.E. keeps the public app code in GitHub and the private diary database in a **Private Vercel Blob** store.

## Before the production deployment

1. Import `Danteivery7/T.I.D.E.` into Vercel.
2. Add the environment variable `TIDE_ACCESS_CODE` with the private code you want to use on your devices.
3. In the Vercel project, open **Storage**, create/connect a **Blob** store, and choose **Private** access.
4. Deploy the current `main` branch after both the access code and private Blob store are connected.

## First sync

Use the MacBook first because it contains the existing browser database:

1. Open the Vercel T.I.D.E. site on the MacBook.
2. Go to **Settings → Cloud Sync**.
3. Enter the `TIDE_ACCESS_CODE` and press **Connect**.
4. Connect performs a merge and uploads the MacBook's full current T.I.D.E. state to the private shared store.

Then open the same Vercel site on the PC and phone, enter the same access code once, and each device will pull/merge the same shared database.

Draft typing remains device-local. Explicit T.I.D.E. saves update local storage and the shared private state. The service worker never caches `/api/*` responses.
