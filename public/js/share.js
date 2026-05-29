import { state } from './state.js';
import { toast } from './ui.js';

export function openShareModal() {
  if (!state.currentFile) return toast('Najpierw wybierz nagranie', 'error');
  document.getElementById('shareModal').classList.remove('hidden');
  document.getElementById('shareUrlBox').style.display = 'none';
  document.getElementById('shareInfo').innerHTML =
    'Wygeneruj link, który klient może otworzyć w przeglądarce.<br>Link będzie aktywny przez wybrany czas.';
}

export function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

export async function generateShareLink() {
  if (!state.currentFile) return;
  const ttlHours = parseInt(document.getElementById('shareTtl').value);
  try {
    const r = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel:   state.currentChannel,
        startTime: state.currentFile.startTime,
        endTime:   state.currentFile.endTime,
        filePath:  state.currentFile.filePath || null,
        ttlHours
      })
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('shareUrlInput').value = data.url;
    document.getElementById('shareUrlBox').style.display = 'flex';
    const exp = new Date(data.expiresAt).toLocaleString('pl-PL');
    document.getElementById('shareInfo').innerHTML =
      `<strong>Link ważny do:</strong> ${exp}<br>Klient może otworzyć link bez logowania się do systemu.`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function copyShareUrl() {
  const val = document.getElementById('shareUrlInput').value;
  navigator.clipboard.writeText(val).then(() => {
    toast('Link skopiowany do schowka', 'ok');
    closeShareModal();
  }).catch(() => { document.getElementById('shareUrlInput').select(); });
}
