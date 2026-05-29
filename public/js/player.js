import { state, videoEl } from './state.js';
import { toast, showLoading, showBuffering } from './ui.js';
import { formatTime, toDahuaTime, toDatetimeLocal } from './utils.js';
import { log, err } from './logger.js';
import { initSeekbar, destroySeekbar, updateSeekbarOrigin, getCurrentPosSecs, getRecStart } from './seekbar.js';

export async function changeResolution(resolution) {
  if (!state.currentToken || !state.currentFile) return;
  state.currentResolution = resolution;

  const file     = state.currentFile;
  const recStart = getRecStart();
  const posSecs  = getCurrentPosSecs();
  const startTime = recStart
    ? toDahuaTime(toDatetimeLocal(new Date(recStart.getTime() + posSecs * 1000)))
    : file.startTime;

  showLoading(true, 'Zmiana rozdzielczości...', resolution);

  try {
    await fetch('/api/stream/stop', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.currentToken })
    });
    if (state.currentRTCPeer) { state.currentRTCPeer.close(); state.currentRTCPeer = null; }

    const r = await fetch('/api/stream/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: state.currentChannel, startTime, endTime: file.endTime, resolution })
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error);
    state.currentToken = data.token;
    startHeartbeat(data.token);
    updateSeekbarOrigin(startTime);
    await showPlayer(data.token, { ...file, startTime }, { keepSeekbar: true });
  } catch (e) {
    err('[changeResolution] error:', e.message);
    showLoading(false);
  }
}

export function startHeartbeat(token) {
  stopHeartbeat();
  state.heartbeatInterval = setInterval(() => {
    fetch('/api/stream/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }, 10000);
}

export function stopHeartbeat() {
  if (state.heartbeatInterval) { clearInterval(state.heartbeatInterval); state.heartbeatInterval = null; }
}

export async function showPlayer(token, file, { keepSeekbar = false } = {}) {
  log(`[showPlayer] WebRTC token=${token}`);
  document.getElementById('playerIdle').style.display = 'none';

  const v = videoEl();
  v.style.display = 'block';
  v.oncanplay = null; v.onplaying = null; v.onwaiting = null; v.onstalled = null; v.onerror = null;

  if (state.currentMSEController) { state.currentMSEController.abort(); state.currentMSEController = null; }
  if (state.currentRTCPeer) { state.currentRTCPeer.close(); state.currentRTCPeer = null; }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  state.currentRTCPeer = pc;

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (e) => {
    log('[WebRTC] track:', e.track.kind);
    if (e.track.kind === 'video') v.srcObject = e.streams[0];
  };

  pc.oniceconnectionstatechange = () => {
    log('[WebRTC] ICE:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') toast('Błąd połączenia WebRTC', 'error');
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 3000);
  });

  const resp = await fetch(`/api/stream/offer?token=${token}`, {
    method: 'POST',
    body: pc.localDescription.sdp,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!resp.ok) throw new Error(`WebRTC offer failed: ${resp.status}`);

  const sdpAnswer = await resp.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  log('[WebRTC] SDP exchange done');

  // Seekbar (tylko dla nagrań, nie live)
  const isLive = !file.endTime || file.startTime === file.endTime;
  if (!isLive && !keepSeekbar) {
    let seeking = false;
    initSeekbar(file, async (seekTime) => {
      if (!state.currentToken || seeking) return;
      seeking = true;
      showLoading(true, 'Przewijanie...', 'Ładowanie momentu nagrania...');
      try {
        await fetch('/api/stream/stop', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: state.currentToken })
        });
        if (state.currentRTCPeer) { state.currentRTCPeer.close(); state.currentRTCPeer = null; }

        const r = await fetch('/api/stream/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: state.currentChannel, startTime: seekTime, endTime: file.endTime, resolution: state.currentResolution })
        });
        const data = await r.json();
        if (!data.success) throw new Error(data.error);
        state.currentToken = data.token;
        startHeartbeat(data.token);
        updateSeekbarOrigin(seekTime);
        await showPlayer(data.token, { ...file, startTime: seekTime }, { keepSeekbar: true });
      } catch (e) {
        err('[seek] error:', e.message);
        showLoading(false);
        toast('Błąd seek', 'error');
      } finally {
        seeking = false;
      }
    });
  }


  v.oncanplay = () => {
    log('[video] canplay');
    v.play().catch(e => err('[video] play() failed:', e.message));
  };
  v.onplaying  = () => { showLoading(false); showBuffering(false); };
  v.onwaiting  = () => showBuffering(true);
  v.onstalled  = () => showBuffering(true);
  v.onloadedmetadata = () => log(`[video] ${v.videoWidth}x${v.videoHeight}`);
  v.onerror = () => {
    err('[video] error:', v.error?.message);
    showLoading(false); showBuffering(false);
    toast('Błąd odtwarzania wideo', 'error');
  };

  const channel = state.currentChannel;
  document.getElementById('playerToolbar').style.display = 'flex';
  document.getElementById('playerTitle').textContent =
    `Kanał ${channel}  ·  ${formatTime(file.startTime)} → ${formatTime(file.endTime)}`;
  document.getElementById('playerSub').textContent =
    `${file.filePath ? file.filePath.split('/').pop() : file.type?.toUpperCase()} · WebRTC`;

  setTimeout(() => showLoading(false), 30000);
}

export async function stopStream(silent = false) {
  if (!state.currentToken) return;

  destroySeekbar();
  stopHeartbeat();
  if (state.currentMSEController) { state.currentMSEController.abort(); state.currentMSEController = null; }
  if (state.currentRTCPeer) { state.currentRTCPeer.close(); state.currentRTCPeer = null; }

  const v = videoEl();
  v.oncanplay = null; v.onplaying = null; v.onwaiting = null; v.onstalled = null; v.onerror = null;
  v.pause();
  v.srcObject = null;
  v.src = '';

  try {
    await fetch('/api/stream/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.currentToken })
    });
  } catch (_) {}

  state.currentToken = null;
  state.currentFile  = null;
  v.style.display = 'none';
  document.getElementById('playerIdle').style.display    = 'flex';
  document.getElementById('playerToolbar').style.display = 'none';
  showLoading(false);
  document.querySelectorAll('.file-card').forEach(c => c.classList.remove('active'));
  if (!silent) toast('Strumień zatrzymany', 'info');
}
