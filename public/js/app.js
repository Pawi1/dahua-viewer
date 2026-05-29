window.DEBUG = false;
fetch('/api/config').then(r => r.json()).then(c => { window.DEBUG = c.debug; }).catch(() => {});

import { initClock, initDefaultTimes, toast } from './ui.js';
import { searchRecordings, selectFile, playFile, downloadFile, downloadCurrent, resetSearch, playAtTime, playLive } from './search.js';
import { showPlayer, stopStream, changeResolution } from './player.js';
import { openShareModal, closeShareModal, generateShareLink, copyShareUrl } from './share.js';
import { openFragmentPanel, closeFragmentPanel, downloadFragment } from './fragment.js';

window.searchRecordings  = searchRecordings;
window.resetSearch       = resetSearch;
window.selectFile        = selectFile;
window.playFile          = playFile;
window.downloadFile      = downloadFile;
window.downloadCurrent   = downloadCurrent;
window.stopStream        = stopStream;
window.changeResolution  = changeResolution;
window.playAtTime        = playAtTime;
window.playLive          = playLive;
window.logout             = logout;
window.openFragmentPanel  = openFragmentPanel;
window.closeFragmentPanel = closeFragmentPanel;
window.downloadFragment   = downloadFragment;
window.openShareModal     = openShareModal;
window.closeShareModal   = closeShareModal;
window.generateShareLink = generateShareLink;
window.copyShareUrl      = copyShareUrl;

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
    setTimeout(() => searchRecordings(), 500);
  }
}

import { state } from './state.js';

window.addEventListener('beforeunload', () => {
  if (state.currentToken) {
    navigator.sendBeacon('/api/stream/stop', JSON.stringify({ token: state.currentToken }));
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
  const r    = await fetch('/api/auth/check');
  const data = await r.json();

  if (!data.authenticated) {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    return;
  }

  if (data.type === 'share' || new URLSearchParams(location.search).get('mode') === 'share') {
    document.body.classList.add('share-mode');
  }

  await initApp();
});
