'use strict';
const axios = require('axios');

const BASE = 'http://127.0.0.1:1984';

async function createStream(name, rtspUrl) {
  try {
    await axios.put(
      `${BASE}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtspUrl)}`,
      null,
      { timeout: 5000 }
    );
  } catch (e) {
    const body = e.response?.data;
    throw new Error(`go2rtc PUT /api/streams → ${e.response?.status}: ${JSON.stringify(body)}`);
  }
}

async function deleteStream(name) {
  try {
    await axios.delete(`${BASE}/api/streams?name=${encodeURIComponent(name)}`, { timeout: 3000 });
  } catch(_) {}
}

async function webrtcOffer(streamName, sdpOffer) {
  const resp = await axios.post(
    `${BASE}/api/webrtc?src=${encodeURIComponent(streamName)}`,
    sdpOffer,
    {
      headers: { 'Content-Type': 'text/plain' },
      responseType: 'text',
      timeout: 60000,
    }
  );
  return resp.data;
}

module.exports = { createStream, deleteStream, webrtcOffer };
