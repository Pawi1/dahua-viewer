import './csrf.js';

window.DEBUG = false;
fetch('/api/config').then(r => r.json()).then(c => { window.DEBUG = c.debug; }).catch(() => {});

import { initClock, initDefaultTimes, toast } from './ui.js';
import { searchRecordings, downloadCurrent, resetSearch, playAtTime, playLive, playShareDirect, initResultsListEvents } from './search.js';
import { showPlayer, stopStream, changeResolution } from './player.js';
import { openShareModal, closeShareModal, generateShareLink, copyShareUrl } from './share.js';
import { openFragmentPanel, closeFragmentPanel, downloadFragment } from './fragment.js';

function bindUiEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('searchBtn').addEventListener('click', searchRecordings);
  document.getElementById('resetSearchBtn').addEventListener('click', resetSearch);
  document.getElementById('playAtTimeBtn').addEventListener('click', playAtTime);
  document.getElementById('playLiveBtn').addEventListener('click', playLive);
  document.getElementById('downloadFragmentBtn').addEventListener('click', downloadFragment);
  document.getElementById('cancelFragmentBtn').addEventListener('click', closeFragmentPanel);
  document.getElementById('downloadCurrentBtn').addEventListener('click', downloadCurrent);
  document.getElementById('openFragmentBtn').addEventListener('click', openFragmentPanel);
  document.getElementById('openShareBtn').addEventListener('click', openShareModal);
  document.getElementById('stopStreamBtn').addEventListener('click', () => stopStream());
  document.getElementById('shareModalCloseBtn').addEventListener('click', closeShareModal);
  document.getElementById('copyShareUrlBtn').addEventListener('click', copyShareUrl);
  document.getElementById('shareModalCancelBtn').addEventListener('click', closeShareModal);
  document.getElementById('generateShareLinkBtn').addEventListener('click', generateShareLink);
  document.getElementById('resolutionSelect').addEventListener('change', (e) => changeResolution(e.target.value));
}

async function checkNvr() {
  try {
    const r = await fetch('/api/nvr/info');
    const data = await r.json();
    const el  = document.getElementById('nvrStatus');
    const txt = document.getElementById('nvrStatusText');
    if (data.success) {
      el.className = 'nvr-status online';
      const model = data.info['updateSerial'] || data.info['deviceType'] || 'NVR';
      txt.textContent = `Online · ${model}`;
    } else throw new Error();
  } catch (_) {
    document.getElementById('nvrStatus').className = 'nvr-status';
    document.getElementById('nvrStatusText').textContent = 'Brak połączenia z NVR';
  }
}

async function populateChannels() {
  try {
    const r = await fetch('/api/nvr/channels');
    const data = await r.json();
    const count = data.count || 16;
    const sel = document.getElementById('channelSelect');
    sel.innerHTML = Array.from({length: count}, (_, i) =>
      `<option value="${i+1}">Kanał ${i+1}</option>`
    ).join('');
  } catch (_) {
    const sel = document.getElementById('channelSelect');
    sel.innerHTML = Array.from({length: 16}, (_, i) =>
      `<option value="${i+1}">Kanał ${i+1}</option>`
    ).join('');
  }
}

function checkUrlParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('ch'))    document.getElementById('channelSelect').value = p.get('ch');
  if (p.get('start')) document.getElementById('startTime').value     = p.get('start').replace(' ', 'T');
  if (p.get('end'))   document.getElementById('endTime').value       = p.get('end').replace(' ', 'T');
  if (p.get('autoplay') === '1' && p.get('start') && p.get('end')) {
    if (p.get('mode') === 'share') {
      setTimeout(() => playShareDirect(p), 500);
    } else {
      setTimeout(() => searchRecordings(), 500);
    }
  }
}

import { state } from './state.js';

window.addEventListener('beforeunload', () => {
  if (state.currentToken) {
    // sendBeacon can't carry custom headers, so it can't include the CSRF
    // token; fetch(..., { keepalive: true }) is the modern equivalent that
    // still survives page unload while going through the same fetch wrapper.
    fetch('/api/stream/stop', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.currentToken }),
    });
  }
});

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  err.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Logowanie...';

  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    if (r.ok) {
      document.getElementById('loginOverlay').classList.add('hidden');
      await initApp();
    } else {
      err.classList.remove('hidden');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Zaloguj się';
  }
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
}

async function initApp() {
  initClock();
  initDefaultTimes();
  checkNvr();
  await populateChannels();
  checkUrlParams();
}

document.addEventListener('DOMContentLoaded', async () => {
  bindUiEvents();
  initResultsListEvents();

  const p = new URLSearchParams(location.search);

  // Auto-authenticate from share token in URL (works for bookmarks / direct access)
  if (p.get('mode') === 'share' && p.get('token')) {
    const r = await fetch(`/api/auth/share?token=${encodeURIComponent(p.get('token'))}`, { method: 'POST' });
    if (r.ok) {
      document.body.classList.add('share-mode');
      await initApp();
      return;
    }
    // Token expired — fall through to normal auth check
  }

  const r    = await fetch('/api/auth/check');
  const data = await r.json();

  if (!data.authenticated) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    return;
  }

  if (data.type === 'share' || p.get('mode') === 'share') {
    document.body.classList.add('share-mode');
  }

  await initApp();
});
