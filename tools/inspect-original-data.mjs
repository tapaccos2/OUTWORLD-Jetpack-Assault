#!/usr/bin/env node
/**
 * First-pass inventory tool for original Outwars mission files and GRY sound-effect audio containers.
 *
 * Usage:
 *   node tools/inspect-original-data.mjs [original-data]
 *
 * This intentionally does NOT pretend to fully decode the proprietary binary
 * structures. It inventories readable strings, referenced resources, and
 * GRY audio-container headers so observations can be compared across files.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'original-data');
const missionDir = path.join(root, 'misn');
const gryDir = path.join(root, 'gry');

function printableStrings(buffer, minimum = 4) {
  const found = [];
  let start = -1;
  for (let i = 0; i <= buffer.length; i++) {
    const b = i < buffer.length ? buffer[i] : 0;
    const printable = b >= 32 && b <= 126;
    if (printable && start < 0) start = i;
    if (!printable && start >= 0) {
      if (i - start >= minimum) {
        found.push({ offset: start, text: buffer.toString('latin1', start, i) });
      }
      start = -1;
    }
  }
  return found;
}

function listFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
    .map(entry => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

const missionFiles = listFiles(missionDir, new Set(['.mis']));
const gryFiles = listFiles(gryDir, new Set(['.gry']));

const missions = missionFiles.map(file => {
  const data = fs.readFileSync(file);
  const strings = printableStrings(data);
  const resources = [...new Set(strings
    .flatMap(item => item.text.match(/[A-Za-z0-9_-]+\.(?:dpc|pcx|gry|wav|avi|ff|tpc|gpc|rpc)/gi) ?? [])
    .map(s => s.trim()))];
  return {
    file: path.basename(file),
    bytes: data.length,
    firstBytesHex: data.subarray(0, 32).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
    readableStrings: strings.map(item => ({ offset: item.offset, text: item.text })),
    referencedResources: resources,
  };
});

const gryAudio = gryFiles.map(file => {
  const data = fs.readFileSync(file);
  return {
    file: path.basename(file),
    bytes: data.length,
    firstBytesHex: data.subarray(0, 64).toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
    printableStrings: printableStrings(data).map(item => item.text),
  };
});

const result = {
  generatedAt: new Date().toISOString(),
  root,
  counts: { missions: missions.length, gryAudioFiles: gryAudio.length },
  missions,
  gryAudio,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
