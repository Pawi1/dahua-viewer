import { state } from './state.js';
import { toDatetimeLocal, toDahuaTime } from './utils.js';
import { toast } from './ui.js';
import { enterFragmentMode, exitFragmentMode, getCurrentPosSecs, getRecStart, getRecEnd } from './seekbar.js';

function parseDahua(str) {
  return new Date(str.replace(' ', 'T'));
}

function setInputs(startDate, endDate) {
  document.getElementById('fragStart').value = toDatetimeLocal(startDate);
  document.getElementById('fragEnd').value   = toDatetimeLocal(endDate);
}

export function openFragmentPanel() {
  const file = state.currentFile;
  if (!file?.endTime || file.startTime === file.endTime) return;

  const recStart = getRecStart() || parseDahua(file.startTime);
  const recEnd   = getRecEnd()   || parseDahua(file.endTime);
  const duration = recEnd - recStart;

  const posSecs    = getCurrentPosSecs();
  const fragStart  = new Date(recStart.getTime() + posSecs * 1000);
  const fragEnd    = new Date(Math.min(fragStart.getTime() + 5 * 60 * 1000, recEnd.getTime()));

  setInputs(fragStart, fragEnd);

  // Synchronizuj seekbar → inputy
  enterFragmentMode(
    (fragStart - recStart) / duration,
    (fragEnd   - recStart) / duration,
    (startR, endR) => {
      setInputs(
        new Date(recStart.getTime() + startR * duration),
        new Date(recStart.getTime() + endR   * duration)
      );
    }
  );

  // Synchronizuj inputy → seekbar
  const onInput = () => {
    const sv = document.getElementById('fragStart').value;
    const ev = document.getElementById('fragEnd').value;
    if (!sv || !ev) return;
    const sd = new Date(sv), ed = new Date(ev);
    if (isNaN(sd) || isNaN(ed) || sd >= ed) return;
    const startR = Math.max(0, Math.min(1, (sd - recStart) / duration));
    const endR   = Math.max(0, Math.min(1, (ed - recStart) / duration));
    enterFragmentMode(startR, endR, (sr, er) => {
      setInputs(new Date(recStart.getTime() + sr * duration), new Date(recStart.getTime() + er * duration));
    });
  };
  document.getElementById('fragStart').addEventListener('input', onInput);
  document.getElementById('fragEnd').addEventListener('input', onInput);

  document.getElementById('fragmentBar').classList.remove('hidden');
}

export function closeFragmentPanel() {
  document.getElementById('fragmentBar').classList.add('hidden');
  exitFragmentMode();
}

export function downloadFragment() {
  const startVal = document.getElementById('fragStart').value;
  const endVal   = document.getElementById('fragEnd').value;
  if (!startVal || !endVal) return toast('Wypełnij zakres', 'error');
  if (new Date(startVal) >= new Date(endVal)) return toast('Czas końca musi być późniejszy niż początku', 'error');

  const startTime = toDahuaTime(startVal);
  const endTime   = toDahuaTime(endVal);
  const channel   = state.currentChannel;

  const params = new URLSearchParams({ channel, startTime, endTime });
  toast('Pobieranie fragmentu...', 'info');
  window.open(`/api/download?${params.toString()}`, '_blank');
  closeFragmentPanel();
}
