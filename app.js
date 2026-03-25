const API_BASE  = 'https://www.breakingnewsguys.com/api/v1';
const KEY_STORE = 'bn_api_key';
const HISTORY   = 10;
const MAX_ITEMS = 75;

let es        = null;
let lastId    = 0;
let connected = false;

// ── Persist key in sessionStorage (tab lifetime only) ────────────────────────

const input = document.getElementById('api-key-input');

const saved = sessionStorage.getItem(KEY_STORE);
if (saved) input.value = saved;

input.addEventListener('input', () => {
  sessionStorage.setItem(KEY_STORE, input.value.trim());
});

input.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleConnect();
});

// ── Connect / disconnect ──────────────────────────────────────────────────────

function handleConnect() {
  if (connected) {
    disconnect();
    return;
  }
  const key = input.value.trim();
  if (!key) {
    setStatus('error', 'Paste your API key first');
    return;
  }
  connect(key);
}

function connect(key) {
  clearFeed();
  setStatus('connecting', 'Loading history...');

  fetchHistory(key)
    .then(() => openStream(key))
    .catch(err => setStatus('error', err.message || 'Failed to connect'));
}

function disconnect() {
  if (es) { es.close(); es = null; }
  connected = false;
  setBtn(false);
  setStatus('idle', 'Disconnected');
}

// ── History ───────────────────────────────────────────────────────────────────

async function fetchHistory(key) {
  const url = `${API_BASE}/messages?limit=${HISTORY}&offset=0`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` }
  });

  if (res.status === 401) throw new Error('Invalid API key');
  if (!res.ok)            throw new Error(`Server error ${res.status}`);

  const data = await res.json();
  const msgs = (data.results || []).slice().reverse(); // oldest first

  if (msgs.length) {
    showFeedHeader('Recent history');
    msgs.forEach(m => addMessage(m, false));
    lastId = msgs[msgs.length - 1].id;
    scrollFeedToBottom(1200);
  }
}

// ── Stream ────────────────────────────────────────────────────────────────────

function openStream(key) {
  const url = `${API_BASE}/stream?key=${encodeURIComponent(key)}`;
  es = new EventSource(url);

  es.addEventListener('connected', () => {
    connected = true;
    setBtn(true);
    setStatus('connected', 'Live');
    // No "Live" divider -- they accumulate over long sessions
  });

  es.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.id > lastId) {
        lastId = msg.id;
        addMessage(msg, true);
        trimFeed();
        scrollFeedToBottom(400);
      }
    } catch (_) {}
  });

  es.addEventListener('heartbeat', () => {
    tickHeartbeat();
  });

  es.onerror = () => {
    connected = false;
    setBtn(false);
    setStatus('error', 'Connection lost — reconnecting...');
    es.addEventListener('connected', () => {
      connected = true;
      setBtn(true);
      setStatus('connected', 'Live');
      // No divider on reconnect either
    }, { once: true });
  };
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function addMessage(msg, isFresh) {
  const empty = document.getElementById('feed-empty');
  if (empty) empty.remove();

  const feed = document.getElementById('feed');
  const el   = document.createElement('div');

  el.className  = 'msg' + (isFresh ? ' fresh' : '');
  el.dataset.id = msg.id;

  const time   = formatTime(msg.created_at);
  const sender = msg.sender
    ? `<span class="msg-sender">${esc(msg.sender)}</span>`
    : '';
  const badge  = isFresh
    ? '<span class="msg-new-badge">NEW</span>'
    : '';
  const img    = msg.image_url
    ? `<img class="msg-image" src="${esc(msg.image_url)}" alt="" loading="lazy" />`
    : '';

  el.innerHTML = `
    <div class="msg-meta">
      <span class="msg-time">${time}</span>
      ${sender}
      ${badge}
    </div>
    <div class="msg-headline">${esc(msg.headline)}</div>
    <div class="msg-body">${esc(msg.body)}</div>
    ${img}
  `;

  feed.appendChild(el);
  if (isFresh) {
    setTimeout(() => el.classList.remove('fresh'), 4000);
  }
}

function showFeedHeader(label) {
  const el = document.getElementById('feed-header');
  if (!el) return;
  el.textContent = label;
  el.classList.add('visible');
}

function hideFeedHeader() {
  const el = document.getElementById('feed-header');
  if (el) el.classList.remove('visible');
}

function addDivider(label) {
  const feed = document.getElementById('feed');
  const div  = document.createElement('div');
  div.className   = 'feed-divider';
  div.textContent = label;
  feed.appendChild(div);
}

// Remove oldest messages when feed exceeds MAX_ITEMS.
function trimFeed() {
  const feed = document.getElementById('feed');
  const msgs = feed.querySelectorAll('.msg');
  const excess = msgs.length - MAX_ITEMS;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) {
    msgs[i].remove();
  }
  // Also remove any orphaned divider that ends up at the very top.
  const first = feed.firstElementChild;
  if (first && first.classList.contains('feed-divider')) {
    first.remove();
  }
}

function clearFeed() {
  const feed  = document.getElementById('feed');
  feed.innerHTML = '<div class="feed-empty" id="feed-empty">&mdash; no messages &mdash;</div>';
  lastId = 0;
  hideFeedHeader();
}

// Scroll the feed container to the bottom.
function scrollFeedToBottom(duration) {
  const feed = document.getElementById('feed');
  if (!feed) return;

  // Wait for any pending images to load so scrollHeight is accurate.
  const imgs = Array.from(feed.querySelectorAll('img')).filter(img => !img.complete);

  if (imgs.length === 0) {
    requestAnimationFrame(() => animateFeedScroll(feed, duration));
    return;
  }

  let settled = 0;
  function onSettle() {
    settled++;
    if (settled >= imgs.length) {
      requestAnimationFrame(() => animateFeedScroll(feed, duration));
    }
  }
  imgs.forEach(img => {
    img.addEventListener('load',  onSettle, { once: true });
    img.addEventListener('error', onSettle, { once: true });
  });
}

function animateFeedScroll(feed, duration) {
  const start    = feed.scrollTop;
  const end      = feed.scrollHeight - feed.clientHeight;
  const distance = end - start;
  if (distance <= 0) return;

  const startTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    feed.scrollTop = start + distance * easeInOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ── Status / button ───────────────────────────────────────────────────────────

function setStatus(state, text) {
  const dot = document.getElementById('dot');
  const txt = document.getElementById('status-text');

  dot.className = 'dot';
  if (state === 'connected') dot.classList.add('connected');
  if (state === 'error')     dot.classList.add('error');

  txt.textContent = text;
}

function setBtn(isConnected) {
  const btn = document.getElementById('connect-btn');
  if (isConnected) {
    btn.textContent  = 'Disconnect';
    btn.className    = 'disconnect';
    input.disabled   = true;
    closeSettings();
  } else {
    btn.textContent  = 'Connect';
    btn.className    = '';
    input.disabled   = false;
    openSettings();
  }
}

function openSettings() {
  const panel = document.getElementById('settings-panel');
  const gear  = document.getElementById('gear-btn');
  const arrow = document.getElementById('gear-arrow');
  if (panel) panel.classList.remove('closed');
  if (gear)  gear.classList.remove('panel-closed');
  if (arrow) arrow.textContent = '▼'; // down -- open
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  const gear  = document.getElementById('gear-btn');
  const arrow = document.getElementById('gear-arrow');
  if (panel) panel.classList.add('closed');
  if (gear)  gear.classList.add('panel-closed');
  if (arrow) arrow.textContent = '▶'; // right -- closed
}

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  if (panel && panel.classList.contains('closed')) {
    openSettings();
  } else {
    closeSettings();
  }
}

function tickHeartbeat() {
  const el = document.getElementById('heartbeat-tick');
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 600);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// ── Eye toggle ────────────────────────────────────────────────────────────────

function toggleKeyVisibility() {
  const inp     = document.getElementById('api-key-input');
  const iconOn  = document.getElementById('eye-icon');
  const iconOff = document.getElementById('eye-off-icon');
  const showing = inp.type === 'text';
  inp.type          = showing ? 'password' : 'text';
  iconOn.style.display  = showing ? ''     : 'none';
  iconOff.style.display = showing ? 'none' : '';
}
