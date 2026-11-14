# T.I.D.E. Health Auto Export — automatic Apple Watch uploads

The Cloudflare Pages site has a server endpoint that writes to the existing
private D1 database. No Apple Health data or secret belongs in public GitHub.

## 1. Set up the Cloudflare secret

1. Cloudflare Dashboard → Workers & Pages → T.I.D.E. → Settings → Variables and Secrets.
2. Add a PRODUCTION encrypted secret named TIDE_HEALTH_INGEST_TOKEN.
3. Generate and privately retain a unique, long random secret of at least 32 characters.
4. Redeploy production so the Cloudflare Pages Function receives the secret.
5. Keep the existing TIDE_DB database binding and TIDE_ACCESS_CODE unchanged.

**Endpoint (copy exactly):**
https://t-i-d-e.pages.dev/api/health/ingest

Do not put the secret in GitHub, ChatGPT messages, or the URL. This endpoint only
accepts authorized HTTP POST requests, not browser GET visits.

## 2. Configure Health Auto Export on the iPhone

Open Health Auto Export → Export → Automated → New Automation.

| Option | Use |
|---|---|
| Automation type | REST API |
| Name | T.I.D.E. Daily Health |
| URL | https://t-i-d-e.pages.dev/api/health/ingest |
| Header key | Authorization |
| Header value | Bearer YOUR_PRIVATE_TOKEN |
| Data Type | Health Metrics |
| Metrics | Step Count, Walking + Running Distance, Apple Exercise Time, Active Energy, Apple Stand Time, Sleep Analysis |
| Export format | JSON |
| Export version | Version 2 |
| Summarize Data | On |
| Time Grouping | Day / Daily |
| Date Range | Previous 7 Days |
| Sync frequency | Every 1 day |
| Enabled | On |

The Authorization value must start with Bearer followed by a space and then the
exact private Cloudflare token. Set source preferences to use de-duplicated
Watch/Health totals where different devices overlap.

For workouts, set up a SECOND REST API automation using the same URL and bearer
token, with Data Type Workouts, JSON Version 2, Previous 7 Days. The app supports
only one data type in a given automation. Avoid route uploads, which are not
used by T.I.D.E.

Summarized sleep includes totalSleep, sleepStart, and sleepEnd for each day.
Do not switch to raw unsummarized sleep segments for this endpoint.

## 3. Verify

1. Use Manual Upload within the automation for Previous 7 Days.
2. Open View Activity Logs. Confirm a successful upload (HTTP 200).
3. Reload T.I.D.E. → Health.
4. The header should say AUTO-EXPORT RECEIVING and show Last Upload plus latest Health day.
5. Compare the completed previous day's steps/sleep with Apple Health.
6. Run the same upload again: the counts should NOT double.

Common HTTP errors:
- 401: Invalid Authorization Bearer token.
- 503: Missing Cloudflare token secret or D1 binding.
- 409: Initial private T.I.D.E. data has not been activated.
- 413: Upload too large, reduce date range or enable JSON batching.
- 415: Send JSON, not CSV or Markdown.
- 422: Unsupported metrics or schema; use JSON Version 2 with Summarize Data on.

## Ongoing behavior

Each accepted export upserts the private day rows. Existing imported history,
diary content, finances and other site records are preserved. Repeated exports
replace the same daily fields rather than adding the totals again.

iOS does not guarantee Health Auto Export runs at the selected time. Health
access can require an unlocked device; Background App Refresh and Low Power Mode
also affect timing. Previous 7 Days lets a later run catch up on missed days.
Treat the last upload timestamp as source freshness, not the cloud-sync pill.

Bank auto-sync is separate and NOT provided by this Health endpoint. Chase
requires a separately configured Plaid developer connection and user
authorization before Finances can receive live source updates.

Official app references:
https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/
https://help.healthyapps.dev/en/health-auto-export/export-format/health-metrics/
