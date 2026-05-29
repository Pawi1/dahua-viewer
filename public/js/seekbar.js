import { toDahuaTime, toDatetimeLocal } from './utils.js';

let _tickInterval = null;
let _recStart     = null;  // Date — początek nagrania (file.startTime)
let _recEnd       = null;  // Date — koniec nagrania   (file.endTime)
let _playStart    = null;  // Date — moment nagrania od którego startujemy (może być po seek)
let _wallStart    = null;  // ms   — Date.now() gdy wystartował strumień
let _onSeek       = null;  // callback(dahuaTimeString)
let _dragging     = false;

function parseDahua(str) {
  return new Date(str.replace(' ', 'T'));
}

function pad(n) {
  return String(Math.floor(n)).padStart(2, '0');
}

function fmtDuration(secs) {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function currentPosSecs() {
  const elapsed = (Date.now() - _wallStart) / 1000;
  return (_playStart - _recStart) / 1000 + elapsed;
}

function setFill(ratio) {
  ratio = Math.max(0, Math.min(1, ratio));
  document.getElementById('seekbarFill').style.width  = `${ratio * 100}%`;
  document.getElementById('seekbarThumb').style.left  = `${ratio * 100}%`;
}

function tick() {
  if (_dragging) return;
  const duration = (_recEnd - _recStart) / 1000;
  if (!duration) return;

  const pos = currentPosSecs();
  document.getElementById('seekbarPos').textContent = fmtDuration(pos);
  setFill(pos / duration);
}

function ratioFromEvent(e, track) {
  const rect = track.getBoundingClientRect();
  const x    = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
}

function seekToRatio(ratio) {
  const duration = (_recEnd - _recStart) / 1000;
  const seekSecs = ratio * duration;
  const seekDate = new Date(_recStart.getTime() + seekSecs * 1000);
  const dahuaStr = toDahuaTime(toDatetimeLocal(seekDate));
  if (_onSeek) _onSeek(dahuaStr);
}

export function initSeekbar(file, onSeek) {
  _recStart  = parseDahua(file.startTime);
  _recEnd    = parseDahua(file.endTime);
  _playStart = parseDahua(file.startTime);
  _wallStart = Date.now();
  _onSeek    = onSeek;
  _dragging  = false;

  const duration = (_recEnd - _recStart) / 1000;
  document.getElementById('seekbarDur').textContent = fmtDuration(duration);
  document.getElementById('seekbarPos').textContent = fmtDuration(0);
  setFill(0);

  const track = document.getElementById('seekbarTrack');

  // Click
  track.onclick = (e) => {
    if (_dragging) return;
    seekToRatio(ratioFromEvent(e, track));
  };

  // Drag
  track.onmousedown = track.ontouchstart = (e) => {
    _dragging = true;
    const move = (ev) => {
      const r = ratioFromEvent(ev, track);
      setFill(r);
      document.getElementById('seekbarPos').textContent =
        fmtDuration(r * (_recEnd - _recStart) / 1000);
    };
    const up = (ev) => {
      _dragging = false;
      seekToRatio(ratioFromEvent(ev, track));
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup',   up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend',  up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend',  up);
    e.preventDefault();
  };

  document.getElementById('seekbar').classList.remove('hidden');

  if (_tickInterval) clearInterval(_tickInterval);
  _tickInterval = setInterval(tick, 1000);
  tick();
}

// Aktualizuj punkt startowy po seek — nowy strumień startuje od seekedTime
export function updateSeekbarOrigin(dahuaStartTime) {
  _playStart = parseDahua(dahuaStartTime);
  _wallStart = Date.now();
}

export function destroySeekbar() {
  if (_tickInterval) clearInterval(_tickInterval);
  _tickInterval = null;
  document.getElementById('seekbar').classList.add('hidden');
  const track = document.getElementById('seekbarTrack');
  track.onclick = null;
  track.onmousedown = null;
  track.ontouchstart = null;
}
