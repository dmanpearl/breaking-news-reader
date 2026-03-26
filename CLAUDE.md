# Breaking News Reader — Claude Context

## What this is
Lightweight static web reader for consuming live Breaking News messages via SSE. Zero dependencies, no build step, no framework. Users enter an API key and get a real-time feed.

Production: https://reader.breakingnewsguys.com
Sister repo: `../breaking-news/` (private Django backend — source of all data)

## Stack
Vanilla JS + HTML5 + CSS3. Three files:
- `index.html` — markup, inline SVG icons
- `app.js` — all app logic (~344 lines)
- `style.css` — dark theme, CSS variables (~424 lines)

## Dev
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```
No build, no install, no transpile.

## Deployment (Railway static site)
Push to GitHub → Railway auto-deploys. Custom domain: `reader.breakingnewsguys.com` via Squarespace DNS (CNAME).

No environment variables — the API key is entered by the user in the UI and stored in `sessionStorage` only (cleared on tab close, never in localStorage).

## How it connects to breaking-news

1. User enters API key → stored in sessionStorage
2. Fetches history: `GET https://www.breakingnewsguys.com/api/v1/messages?limit=10`
   - Header: `Authorization: Bearer <key>`
3. Opens SSE stream: `GET https://www.breakingnewsguys.com/api/v1/stream?key=<key>`
   - Query param because EventSource can't set custom headers
   - Events: `connected`, `message`, `heartbeat` (every 30s)

**Always use `www.breakingnewsguys.com`** — apex domain goes through Squarespace and strips query params, breaking stream auth.

## Feed behavior
- Shows 10 most recent messages on connect, then live updates via SSE
- Max 75 messages in feed (oldest trimmed)
- New messages flagged `fresh` for 4 seconds (CSS fade)
- XSS protection via `esc()` function in `app.js`

## Key state (app.js globals)
- `es` — the active EventSource instance
- `lastId` — deduplication for history vs. stream overlap
- `connected` — UI state flag
