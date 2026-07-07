'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKeyValue, parseMediaFiles, toRtspTime } = require('../../src/utils/dahua');

test('parseKeyValue parses key=value lines, trims whitespace, ignores lines without =', () => {
  const text = 'result=08137\nnoEquals\n  padded  =  value  \n';
  const parsed = parseKeyValue(text);
  assert.equal(parsed.result, '08137');
  assert.equal(parsed.padded, 'value');
  assert.equal(Object.keys(parsed).length, 2);
});

test('parseKeyValue returns an empty object for empty input', () => {
  assert.deepEqual(parseKeyValue(''), {});
});

test('parseMediaFiles parses found count, fields, and events per item', () => {
  const text = [
    'found=2',
    'items[0].StartTime=2026-01-01 10:00:00',
    'items[0].EndTime=2026-01-01 11:00:00',
    'items[0].FilePath=/mnt/dvr/sda0/1.dav',
    'items[0].Type=dav',
    'items[0].Duration=3600',
    'items[0].Length=790',
    'items[0].Channel=1',
    'items[0].Events[0]=VideoMotion',
    'items[0].Events[1]=AlarmLocal',
    'items[1].StartTime=2026-01-01 11:00:00',
    'items[1].EndTime=2026-01-01 12:00:00',
    'items[1].FilePath=/mnt/dvr/sda0/2.dav',
    'items[1].Channel=1',
  ].join('\r\n');

  const { found, files } = parseMediaFiles(text);
  assert.equal(found, 2);
  assert.equal(files.length, 2);

  assert.deepEqual(files[0], {
    id: 0,
    startTime: '2026-01-01 10:00:00',
    endTime: '2026-01-01 11:00:00',
    filePath: '/mnt/dvr/sda0/1.dav',
    type: 'dav',
    duration: 3600,
    length: 790,
    channel: 1,
    events: ['VideoMotion', 'AlarmLocal'],
  });

  // Second item has no Events / Type entries -> defaults kick in
  assert.equal(files[1].type, 'dav');
  assert.deepEqual(files[1].events, []);
  assert.equal(files[1].duration, 0);
});

test('parseMediaFiles returns an empty file list when found=0', () => {
  assert.deepEqual(parseMediaFiles('found=0'), { found: 0, files: [] });
});

test('parseMediaFiles defaults found to 0 when missing entirely', () => {
  assert.deepEqual(parseMediaFiles('no matching data here'), { found: 0, files: [] });
});

test('toRtspTime replaces dashes, spaces, and colons with underscores', () => {
  assert.equal(toRtspTime('2026-01-01 10:20:30'), '2026_01_01_10_20_30');
});
