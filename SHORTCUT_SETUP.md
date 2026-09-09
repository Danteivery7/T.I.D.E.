# T.I.D.E. iPhone Shortcut

The shortcut endpoint is available at:

- `GET /api/tide/shortcut?date=YYYY-MM-DD`
- `POST /api/tide/shortcut`

Both routes require the same authenticated T.I.D.E. session as the existing cloud state API.

GET returns:

```json
{
  "date": "2026-09-09",
  "today": "Existing entry text",
  "recent": [
    { "date": "2026-09-08", "text": "Recent T.I.D.E. entry" }
  ]
}
```

POST body:

```json
{
  "date": "2026-09-09",
  "text": "New formatted T.I.D.E. activity"
}
```

The POST appends to that date's entry and persists it into the shared Cloudflare D1-backed T.I.D.E. state.
