import { state } from './state.js';
import { toast, showLoading, initDefaultTimes } from './ui.js';
import { toDahuaTime, formatTime, formatDuration, formatBytes, translateEvent, escHtml } from './utils.js';
import { showPlayer, stopStream } from './player.js';
import { log, err } from './logger.js';

export async function searchRecordings() {
  const channel  = parseInt(document.getElementById('channelSelect').value);
  const startRaw = document.getElementById('startTime').value;
  const endRaw   = document.getElementById('endTime').value;

  if (!startRaw || !endRaw) return toast('Wypełnij zakres czasu', 'error');
  if (new Date(startRaw) >= new Date(endRaw)) return toast('Czas początku musi być wcześniej niż czas końca', 'error');

  state.currentChannel = channel;
  const startTime = toDahuaTime(startRaw);
  const endTime   = toDahuaTime(endRaw);

  const listEl = document.getElementById('resultsList');
  listEl.innerHTML = `<div class="results-loading"><div class="spinner"></div><span>Wyszukiwanie...</span></div>`;

  try {
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, startTime, endTime })
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Błąd wyszukiwania');
    state.searchResults = data.files || [];
    renderResults(data.found, data.files);
  } catch (e) {
    err('[search] error:', e.message);
    listEl.innerHTML = `
      <div class="results-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.2" style="opacity:.4">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        <div style="color:#ff5555">${escHtml(e.message)}</div>
      </div>`;
  }
}

export function renderResults(found, files) {
  const listEl = document.getElementById('resultsList');

  if (!found || !files.length) {
    listEl.innerHTML = `
      <div class="results-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <div>Brak nagrań w podanym<br>przedziale czasowym</div>
      </div>`;
    return;
  }

  let html = `<div class="results-count">Znaleziono <span>${found}</span> plik(ów)</div>`;

  files.forEach((f, idx) => {
    const dur = f.duration ? ` · ${formatDuration(f.duration)}` : '';
    const size = f.length  ? ` · ${formatBytes(f.length)}` : '';
    const eventsHtml = f.events.slice(0, 2).map(e =>
      `<span class="badge">${translateEvent(e)}</span>`
    ).join('');

    html += `
      <div class="file-card" id="card-${idx}" onclick="selectFile(${idx})">
        <div class="file-card-time">
          <span>${formatTime(f.startTime)}</span> → ${formatTime(f.endTime)}
        </div>
        <div class="file-card-meta">
          <span class="badge">${f.type.toUpperCase()}</span>
          ${eventsHtml}
          <span>${dur}${size}</span>
        </div>
        <div class="file-card-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="playFile(${idx})">▶ Odtwórz</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadFile(${idx})">↓ Pobierz</button>
        </div>
      </div>`;
  });

  listEl.innerHTML = html;
}

export async function selectFile(idx) {
  document.querySelectorAll('.file-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`card-${idx}`)?.classList.add('active');
  await playFile(idx);
}

export async function playFile(idx) {
  const file = state.searchResults[idx];
  if (!file) return;

  if (state.currentToken) await stopStream(true);

  state.currentFile = file;
  log(`[playFile] ch${state.currentChannel} ${file.startTime}→${file.endTime}`);
  showLoading(true, 'Łączenie WebRTC...', 'Nawiązywanie połączenia z kamerą...');

  try {
    const body = { channel: state.currentChannel, startTime: file.startTime, endTime: file.endTime };
    if (file.filePath) body.filePath = file.filePath;

    const r = await fetch('/api/stream/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Nie można uruchomić strumienia');

    state.currentToken = data.token;
    await showPlayer(data.token, file);
  } catch (e) {
    err('[playFile] error:', e.message);
    showLoading(false);
    toast(e.message, 'error');
  }
}

export function downloadFile(idx) {
  const file = state.searchResults[idx];
  if (!file) return;
  const params = new URLSearchParams({ channel: state.currentChannel, startTime: file.startTime, endTime: file.endTime });
  if (file.filePath) params.set('filePath', file.filePath);
  toast('Pobieranie rozpoczęte...', 'info');
  window.open(`/api/download?${params.toString()}`, '_blank');
}

export function downloadCurrent() {
  if (!state.currentFile) return;
  const idx = state.searchResults.indexOf(state.currentFile);
  if (idx >= 0) downloadFile(idx);
}

export function resetSearch() {
  initDefaultTimes();
  state.searchResults = [];
  document.getElementById('resultsList').innerHTML = `
    <div class="results-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="2" width="20" height="20" rx="2"/>
        <path d="M7 9h10M7 12h7"/>
      </svg>
      <div>Wybierz kanał i zakres czasu,<br>następnie kliknij <strong>Szukaj</strong></div>
    </div>`;
}
