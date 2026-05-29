export function toDatetimeLocal(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function toDahuaTime(localString) {
  return localString.replace('T', ' ');
}

export function formatTime(str) {
  if (!str) return '—';
  return str.replace(/(\d{4})-(\d{2})-(\d{2}) /, '$3.$2.$1 ');
}

export function formatDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export function translateEvent(ev) {
  const map = { VideoMotion: 'Ruch', AlarmLocal: 'Alarm', VideoLoss: 'Utrata', VideoBlind: 'Blind', Timing: 'Ciągłe' };
  return map[ev] || ev;
}

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
