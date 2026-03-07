# breaking-news-reader

A lightweight, static web reader for the [Breaking News](https://www.breakingnewsguys.com) platform. No server, no build step — one HTML file.

Live API docs: https://www.breakingnewsguys.com/api/v1/docs

---

## What it does

- Loads the 10 most recent messages on connect
- Opens a live Server-Sent Events stream for new messages
- Shows a pulsing green dot when connected
- Works on desktop and mobile browsers

---

## Quick start

1. Open `index.html` via a local server (see below)
2. Paste your API key and click **Connect**

**Running locally** — browsers block API requests from `file://` URLs due to
CORS policy. Serve the folder with any static server:

```bash
# Python (no install required)
python3 -m http.server 8080
# then open http://localhost:8080

# Node (if you have npx)
npx serve .
```

VS Code users: the **Live Server** extension works too
(right-click `index.html` → Open with Live Server).

---

## Hosting on Railway (static)

1. Push this repo to GitHub
2. In Railway: **New Project → Deploy from GitHub repo**
3. Select the repo — Railway detects a static site automatically
4. In **Settings → Domains**, add `reader.breakingnewsguys.com`

---

## DNS setup at Squarespace (or your DNS provider)

Add these two records for `reader.breakingnewsguys.com`:

| Type  | Host     | Value                          | TTL  |
|-------|----------|--------------------------------|------|
| CNAME | `reader` | `<your-railway-domain>.up.railway.app` | Auto |
| TXT   | `reader` | Railway will show a verification value in the domain settings | Auto |

Railway shows both the CNAME target and the required TXT verification value in
**Settings → Domains** after you add the custom domain. Copy them from there —
the exact values are unique to your deployment.

After adding the records, click **Verify** in Railway. SSL provisions automatically within a few minutes.

---

## Using the Breaking News API in your own project

All requests go to:

```
https://www.breakingnewsguys.com/api/v1
```

> **Always use `www.`** — the apex domain strips query parameters on redirect,
> which breaks stream authentication.

### Get an API key

A Breaking News administrator creates keys at `/admin/` → **API → API Keys**.
The plaintext key is shown once at creation — copy it immediately.

### Authentication

All endpoints except `/health` require a Bearer token:

```
Authorization: Bearer YOUR_API_KEY
```

The `/stream` endpoint uses a query parameter instead
(browsers cannot set headers on `EventSource`):

```
/api/v1/stream?key=YOUR_API_KEY
```

---

### Endpoints used by this app

**Load recent messages**

```
GET /api/v1/messages?limit=10&offset=0
Authorization: Bearer YOUR_API_KEY
```

Response:
```json
{
  "count": 42,
  "results": [
    {
      "id": 42,
      "headline": "Market opens higher",
      "body": "The S&P 500 gained...",
      "image_url": null,
      "sent": true,
      "created_at": "2026-03-06T14:32:00Z",
      "sender": "David P."
    }
  ]
}
```

Results are newest-first. Use `?since=<iso_timestamp>` to poll for new messages
incrementally.

**Open a live stream**

```javascript
const es = new EventSource(
  'https://www.breakingnewsguys.com/api/v1/stream?key=YOUR_API_KEY'
);

es.addEventListener('connected', e => {
  console.log('Stream ready');
});

es.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  console.log(msg.headline, msg.body);
});

es.addEventListener('heartbeat', () => {
  // fired every 30s — useful for connection health indicators
});

es.onerror = () => {
  // EventSource reconnects automatically
};
```

**Event types**

| Event       | When              | Payload                                      |
|-------------|-------------------|----------------------------------------------|
| `connected` | On open           | `{"message": "Connected to Breaking News stream."}` |
| `message`   | Each new message  | Full message object (same fields as REST)    |
| `heartbeat` | Every 30 seconds  | `{"ts": 1234567890.0}`                       |

---

## Files

```
breaking-news-reader/
  index.html              — markup only
  style.css               — all styles
  app.js                  — all application logic
  breaking-news-dark.png  — logo
  README.md               — this file
```

---

## License

MIT
