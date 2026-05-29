// Ustaw DEBUG zanim inne moduły zalogują cokolwiek
window.DEBUG = false;
fetch('/api/config').then(r => r.json()).then(c => { window.DEBUG = c.debug; }).catch(() => {});

import { initClock, initDefaultTimes, toast } from './ui.js';
import { searchRecordings, selectFile, playFile, downloadFile, downloadCurrent, resetSearch } from './search.js';
import { showPlayer, stopStream } from './player.js';
import { openShareModal, closeShareModal, generateShareLink, copyShareUrl } from './share.js';

// Expose do window żeby działały onclick= w HTML
window.searchRecordings  = searchRecordings;
window.resetSearch       = resetSearch;
window.selectFile        = selectFile;
window.playFile          = playFile;
window.downloadFile      = downloadFile;
window.downloadCurrent   = downloadCurrent;
window.stopStream        = stopStream;
window.openShareModal    = openShareModal;
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
      const model = data.info['deviceType'] || data.info['model'] || 'NVR';
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

document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initDefaultTimes();
  checkNvr();
  await populateChannels();
  checkUrlParams();
});
