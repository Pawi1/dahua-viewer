import { toDahuaTime, toDatetimeLocal } from './utils.js';

let _tickInterval = null;
let _recStart     = null;
let _recEnd       = null;
let _playStart    = null;
let _wallStart    = null;
let _onSeek       = null;
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

function fmtClock(date) {
  return date.toLocaleTimeString('pl-PL', { hour12: false });
}

function currentPosSecs() {
  const elapsed = (Date.now() - _wallStart) / 1000;
  return (_playStart - _recStart) / 1000 + elapsed;
}

function setFill(ratio) {
  ratio = Math.max(0, Math.min(1, ratio));
  document.getElementById('seekbarFill').style.width = `${ratio * 100}%`;
  document.getElementById('seekbarThumb').style.left = `${ratio * 100}%`;
}

function updatePosLabel(secs) {
  const clockDate = new Date(_recStart.getTime() + secs * 1000);
  document.getElementById('seekbarPosDur').textContent   = fmtDuration(secs);
  document.getElementById('seekbarPosClock').textContent = fmtClock(clockDate);
}

function tick() {
  if (_dragging) return;
  const duration = (_recEnd - _recStart) / 1000;
  if (!duration) return;
  const pos = Math.min(currentPosSecs(), duration);
  updatePosLabel(pos);
  setFill(pos / duration);
}

function ratioFromEvent(e, track) {
  const rect = track.getBoundingClientRect();
  const x    = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
}

function showTooltip(ratio, trackEl) {
  const duration = (_recEnd - _recStart) / 1000;
  const secs     = ratio * duration;
  const clock    = new Date(_recStart.getTime() + secs * 1000);
  const tooltip  = document.getElementById('seekbarTooltip');
  document.getElementById('tooltipDur').textContent   = fmtDuration(secs);
  document.getElementById('tooltipClock').textContent = fmtClock(clock);
  tooltip.style.left = `${ratio * 100}%`;
  tooltip.classList.remove('hidden');
}

function hideTooltip() {
  document.getElementById('seekbarTooltip').classList.add('hidden');
}

function seekToRatio(ratio) {
  const duration = (_recEnd - _recStart) / 1000;
  const seekSecs = ratio * duration;
  const seekDate = new Date(_recStart.getTime() + seekSecs * 1000);
  if (_onSeek) _onSeek(toDahuaTime(toDatetimeLocal(seekDate)));
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
  updatePosLabel(0);
  setFill(0);
  hideTooltip();

  const track = document.getElementById('seekbarTrack');

  track.onmousemove = (e) => {
    showTooltip(ratioFromEvent(e, track), track);
  };
  track.onmouseleave = () => hideTooltip();

  track.onclick = (e) => {
    if (_dragging) return;
    seekToRatio(ratioFromEvent(e, track));
  };

  track.onmousedown = track.ontouchstart = (e) => {
    _dragging = true;
    hideTooltip();
    const move = (ev) => {
      const r = ratioFromEvent(ev, track);
      setFill(r);
      updatePosLabel(r * duration);
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

export function getCurrentPosSecs() {
  if (!_recStart || !_wallStart) return 0;
  return Math.max(0, (_playStart - _recStart) / 1000 + (Date.now() - _wallStart) / 1000);
}

export function getRecStart() { return _recStart; }
export function getRecEnd()   { return _recEnd; }

let _fragStartR    = 0;
let _fragEndR      = 1;
let _fragOnChange  = null;
let _fragMode      = false;

function updateFragMarkers() {
  const start = document.getElementById('seekbarFragStart');
  const end   = document.getElementById('seekbarFragEnd');
  const reg   = document.getElementById('seekbarFragRegion');
  start.style.left = `${_fragStartR * 100}%`;
  end.style.left   = `${_fragEndR   * 100}%`;
  reg.style.left   = `${_fragStartR * 100}%`;
  reg.style.width  = `${(_fragEndR - _fragStartR) * 100}%`;
}

export function enterFragmentMode(startRatio, endRatio, onChange) {
  _fragStartR   = Math.max(0, Math.min(startRatio, 1));
  _fragEndR     = Math.max(0, Math.min(endRatio,   1));
  _fragOnChange = onChange;
  _fragMode     = true;

  ['seekbarFragStart', 'seekbarFragEnd', 'seekbarFragRegion'].forEach(id =>
    document.getElementById(id).classList.remove('hidden')
  );
  updateFragMarkers();

  const makeHandlerDrag = (which) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    const track = document.getElementById('seekbarTrack');
    const move = (ev) => {
      const r = ratioFromEvent(ev, track);
      if (which === 'start') _fragStartR = Math.min(r, _fragEndR - 0.001);
      else                   _fragEndR   = Math.max(r, _fragStartR + 0.001);
      _fragStartR = Math.max(0, _fragStartR);
      _fragEndR   = Math.min(1, _fragEndR);
      updateFragMarkers();
      if (_fragOnChange) _fragOnChange(_fragStartR, _fragEndR);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup',   up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend',  up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
    document.addEventListener('touchmove', move);
    document.addEventListener('touchend',  up);
  };

  document.getElementById('seekbarFragStart').onmousedown = makeHandlerDrag('start');
  document.getElementById('seekbarFragEnd'  ).onmousedown = makeHandlerDrag('end');
  document.getElementById('seekbarFragStart').ontouchstart = makeHandlerDrag('start');
  document.getElementById('seekbarFragEnd'  ).ontouchstart = makeHandlerDrag('end');
}

export function exitFragmentMode() {
  _fragMode = false;
  ['seekbarFragStart', 'seekbarFragEnd', 'seekbarFragRegion'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );
}

export function updateSeekbarOrigin(dahuaStartTime) {
  _playStart = parseDahua(dahuaStartTime);
  _wallStart = Date.now();
}

export function destroySeekbar() {
  if (_tickInterval) clearInterval(_tickInterval);
  _tickInterval = null;
  hideTooltip();
  document.getElementById('seekbar').classList.add('hidden');
  const track = document.getElementById('seekbarTrack');
  track.onclick = null;
  track.onmousedown  = null;
  track.ontouchstart = null;
  track.onmousemove  = null;
  track.onmouseleave = null;
}
