# T.I.D.E. — Cloudflare Setup

T.I.D.E. is configured for Cloudflare Pages + Pages Functions + D1.

## 1. Create the D1 database
1. Open the Cloudflare dashboard.
2. Go to **D1 SQL Database**.
3. Click **Create database**.
4. Name it `tide-data`.
5. Location: **Eastern North America** is a good fit for a US East Coast primary user, or leave automatic.
6. Create the database. You do **not** need to create tables manually; T.I.D.E. creates its table on first sync.

## 2. Create the Pages project from GitHub
1. Go to **Workers & Pages**.
2. Click **Create application**.
3. Choose **Pages** → **Connect to Git** / **Import an existing Git repository**.
4. Authorize GitHub if prompted.
5. Choose `Danteivery7/T.I.D.E.`.
6. Production branch: `main`.
7. Framework preset: **None**.
8. Build command: `npm run build`.
9. Build output directory: `dist`.
10. Root directory: leave blank.
11. Click **Save and Deploy**.

The first deploy can finish before the database binding is added. Cloud sync will show as local-only until the next steps are complete.

## 3. Bind D1 to the Pages project
1. Open the new T.I.D.E. Pages project.
2. Go to **Settings** → **Bindings**.
3. Click **Add** → **D1 database bindings**.
4. Variable name: `TIDE_DB` (must be exact).
5. Database: choose `tide-data`.
6. Save.

## 4. Add the private access code
1. In the same Pages project, go to **Settings** → **Variables and Secrets**.
2. Add a secret/variable named `TIDE_ACCESS_CODE` (must be exact).
3. Set its value to a private password you will remember.
4. Save.

## 5. Redeploy
Bindings and runtime variables require a new deployment.
1. Open **Deployments** for the Pages project.
2. Redeploy the latest `main` commit, or push any new commit to `main`.

## 6. Migrate the MacBook database into D1
Do this on the MacBook first because it has the authoritative T.I.D.E. local database.
1. Open the Cloudflare `*.pages.dev` T.I.D.E. URL on the MacBook.
2. Open **Settings** in T.I.D.E.
3. Under **Cloud Sync**, enter the same `TIDE_ACCESS_CODE` and click **Connect**.
4. Connecting performs the initial migration: it pulls any existing D1 state, merges it with the MacBook state, and uploads the merged database.
5. After it says connected, click **Sync Now** once as an extra verification.

Then open the same Cloudflare URL on the PC or phone, go to Settings, enter the same access code, and click Connect. Those devices will pull the shared D1 state.

## Expected GeoGuessr baseline
The existing T.I.D.E. repair layer remains in the app. On the MacBook state it should retain the authoritative Daily Challenge and Monty values already stored there.

## Privacy
The diary database is not committed to the public GitHub repository. Cloudflare D1 stores the shared state privately behind the access-code session.
