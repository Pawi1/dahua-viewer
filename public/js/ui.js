import { escHtml, toDatetimeLocal } from './utils.js';

export function initClock() {
  const el = document.getElementById('clockDisplay');
  const tick = () => { el.textContent = new Date().toLocaleTimeString('pl-PL', { hour12: false }); };
  tick();
  setInterval(tick, 1000);
}

export function initDefaultTimes() {
  const now   = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  document.getElementById('endTime').value   = toDatetimeLocal(now);
  document.getElementById('startTime').value = toDatetimeLocal(start);
}

export function showLoading(show, text = '', sub = '') {
  const el = document.getElementById('loadingOverlay');
  if (show) {
    el.classList.remove('hidden');
    document.getElementById('loadingText').textContent = text || 'Ładowanie...';
    document.getElementById('loadingSub').textContent  = sub || '';
  } else {
    el.classList.add('hidden');
  }
}

export function showBuffering(show) {
  document.getElementById('bufferingOverlay').classList.toggle('hidden', !show);
}

export function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { ok: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}
