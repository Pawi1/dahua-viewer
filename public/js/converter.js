const CORE_BASE = '/ffmpeg/core';

let ffmpeg   = null;
let file     = null;
let mode     = 'copy'; // 'copy' | 'transcode'
let ffLoaded = false;

const dropzone    = document.getElementById('dropzone');
const fileInput   = document.getElementById('fileInput');
const fileInfo    = document.getElementById('fileInfo');
const progressWrap= document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressLbl = document.getElementById('progressLabel');
const logBox      = document.getElementById('logBox');
const convertBtn  = document.getElementById('convertBtn');
const resultBox   = document.getElementById('resultBox');
const downloadBtn = document.getElementById('downloadBtn');
const resultSize  = document.getElementById('resultSize');
const optCopy       = document.getElementById('optCopy');
const optTranscode  = document.getElementById('optTranscode');

function selectMode(m) {
  mode = m;
  optCopy.classList.toggle('active', m === 'copy');
  optTranscode.classList.toggle('active', m === 'transcode');
}

optCopy.addEventListener('click', () => selectMode('copy'));
optTranscode.addEventListener('click', () => selectMode('transcode'));

function onFile(f) {
  if (!f) return;
  file = f;
  dropzone.classList.add('has-file');
  dropzone.querySelector('.dropzone-icon').textContent = '📄';
  dropzone.querySelector('.dropzone-label').textContent = f.name;
  fileInfo.textContent = `Rozmiar: ${(f.size / 1024 / 1024).toFixed(2)} MB`;
  fileInfo.classList.add('visible');
  convertBtn.disabled = false;
  resultBox.classList.remove('visible');
}

fileInput.addEventListener('change', e => onFile(e.target.files[0]));
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('over');
  onFile(e.dataTransfer.files[0]);
});

function log(msg) {
  logBox.classList.add('visible');
  logBox.textContent += msg + '\n';
  logBox.scrollTop = logBox.scrollHeight;
}

function setProgress(pct, label) {
  progressWrap.classList.add('visible');
  progressBar.style.width = pct + '%';
  if (label) progressLbl.textContent = label;
}

async function loadFFmpeg() {
  if (ffLoaded) return;
  const { FFmpeg } = await import('/ffmpeg/ffmpeg/index.js');
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => log(message));
  ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.round(progress * 100);
    setProgress(pct, `Konwersja… ${pct}%`);
  });
  setProgress(10, 'Pobieranie FFmpeg.wasm (~30 MB)…');
  await ffmpeg.load({
    coreURL: `${CORE_BASE}/ffmpeg-core.js`,
    wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
  });
  ffLoaded = true;
  setProgress(100, 'FFmpeg.wasm gotowy');
}

async function startConvert() {
  if (!file) return;
  convertBtn.disabled = true;
  resultBox.classList.remove('visible');
  logBox.textContent = '';
  logBox.classList.remove('visible');
  setProgress(0, 'Inicjalizacja…');

  try {
    await loadFFmpeg();

    setProgress(0, 'Wczytywanie pliku…');
    const { fetchFile } = await import('/ffmpeg/util/index.js');
    await ffmpeg.writeFile('input.dav', await fetchFile(file));

    const outName   = file.name.replace(/\.dav$/i, '') + '.mp4';
    const videoArgs = mode === 'copy'
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'];

    setProgress(0, 'Konwersja…');
    await ffmpeg.exec([
      '-f', 'dhav',
      '-i', 'input.dav',
      ...videoArgs,
      '-c:a', 'aac',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });
    const url  = URL.createObjectURL(blob);

    downloadBtn.href     = url;
    downloadBtn.download = outName;
    downloadBtn.textContent = `↓ Pobierz ${outName}`;
    resultSize.textContent = `Rozmiar: ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
    resultBox.classList.add('visible');
    setProgress(100, 'Zakończono!');

    await ffmpeg.deleteFile('input.dav');
    await ffmpeg.deleteFile('output.mp4');
  } catch (err) {
    log('BŁĄD: ' + err.message);
    setProgress(0, 'Błąd konwersji — sprawdź log');
  } finally {
    convertBtn.disabled = false;
  }
}

convertBtn.addEventListener('click', startConvert);
