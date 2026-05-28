'use strict';

function parseKeyValue(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > -1) result[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
  return result;
}

function parseMediaFiles(text) {
  const found = parseInt(text.match(/found=(\d+)/)?.[1] || '0');
  const files = [];
  for (let i = 0; i < found; i++) {
    const get = (key) => text.match(new RegExp(`items\\[${i}\\]\\.${key}=([^\r\n]+)`))?.[1]?.trim() || '';
    const events = [];
    let ei = 0;
    while (true) {
      const ev = text.match(new RegExp(`items\\[${i}\\]\\.Events\\[${ei}\\]=([^\r\n]+)`))?.[1]?.trim();
      if (!ev) break;
      events.push(ev); ei++;
    }
    files.push({
      id:        i,
      startTime: get('StartTime'),
      endTime:   get('EndTime'),
      filePath:  get('FilePath'),
      type:      get('Type') || 'dav',
      duration:  parseInt(get('Duration') || '0'),
      length:    parseInt(get('Length')   || '0'),
      channel:   parseInt(get('Channel')  || '0'),
      events,
    });
  }
  return { found, files };
}

function toRtspTime(str) {
  return str.replace(/-/g, '_').replace(/ /g, '_').replace(/:/g, '_');
}

module.exports = { parseKeyValue, parseMediaFiles, toRtspTime };
