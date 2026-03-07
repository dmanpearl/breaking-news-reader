const API_BASE  = 'https://www.breakingnewsguys.com/api/v1';
const KEY_STORE = 'bn_api_key';
const HISTORY   = 10;

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
  setStatus('connecting', 'Loading history…');

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
    addDivider('Recent history');
    msgs.forEach(m => addMessage(m, false));
    lastId = msgs[msgs.length - 1].id;
    // Wait for all images to finish loading so scrollHeight is accurate,
    // then animate from the top down to the bottom.
    scrollAfterImages(document.getElementById('feed'), 1200);
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
    addDivider('Live');
  });

  es.addEventListener('message', e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.id > lastId) {
        lastId = msg.id;
        addMessage(msg, true);
        // Scroll after the new message's image (if any) has loaded.
        const lastMsg = document.getElementById('feed').lastElementChild;
        scrollAfterImages(lastMsg, 400);
      }
    } catch (_) {}
  });

  es.addEventListener('heartbeat', () => {
    tickHeartbeat();
  });

  es.onerror = () => {
    connected = false;
    setBtn(false);
    setStatus('error', 'Connection lost — reconnecting…');
    es.addEventListener('connected', () => {
      connected = true;
      setBtn(true);
      setStatus('connected', 'Live — reconnected');
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

function addDivider(label) {
  const feed = document.getElementById('feed');
  const div  = document.createElement('div');
  div.className   = 'feed-divider';
  div.textContent = label;
  feed.appendChild(div);
}

function clearFeed() {
  const feed  = document.getElementById('feed');
  feed.innerHTML = '<div class="feed-empty" id="feed-empty">&mdash; no messages &mdash;</div>';
  lastId = 0;
}

// Wait for every <img> inside `container` to finish loading,
// then animate scroll to the bottom of the page.
function scrollAfterImages(container, duration) {
  const imgs = container ? Array.from(container.querySelectorAll('img')) : [];
  const pending = imgs.filter(img => !img.complete);

  if (pending.length === 0) {
    // No images, or all already cached — scroll immediately next paint.
    requestAnimationFrame(() => smoothScrollToBottom(duration));
    return;
  }

  let settled = 0;

  function onSettle() {
    settled += 1;
    if (settled >= pending.length) {
      // All images resolved (loaded or errored). Now scrollHeight is final.
      requestAnimationFrame(() => smoothScrollToBottom(duration));
    }
  }

  pending.forEach(img => {
    img.addEventListener('load',  onSettle, { once: true });
    img.addEventListener('error', onSettle, { once: true });
  });
}

// Animated scroll to bottom over `duration` ms using easeInOutCubic.
function smoothScrollToBottom(duration) {
  const start    = window.scrollY;
  const end      = document.body.scrollHeight - window.innerHeight;
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
    window.scrollTo(0, start + distance * easeInOutCubic(progress));
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
  } else {
    btn.textContent  = 'Connect';
    btn.className    = '';
    input.disabled   = false;
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
