#!/usr/bin/env node
/**
 * Inventory all Outwars .MC motion resources.
 * Validates the 152-byte frame stride and emits per-file and per-channel ranges.
 *
 * Usage: node tools/inspect-motion-catalog.mjs <motion-directory> [output.json]
 */
import fs from 'node:fs';
import path from 'node:path';
const [directory, output] = process.argv.slice(2);
if (!directory) throw new Error('Usage: node tools/inspect-motion-catalog.mjs <motion-directory> [output.json]');
const files = fs.readdirSync(directory).filter(x => x.toLowerCase().endsWith('.mc')).sort();
const motions = [];
const samplesBySlot = Array.from({ length: 19 }, () => [[], [], []]);
let totalFrames = 0;
for (const file of files) {
  const full = path.join(directory, file), bytes = fs.readFileSync(full);
  if (bytes.length < 4) throw new Error(file + ': truncated header');
  const declaredFrames = bytes.readUInt32LE(0), payloadBytes = bytes.length - 4;
  if (payloadBytes % 152 !== 0) throw new Error(file + ': payload is not divisible by 152');
  const decodedFrames = payloadBytes / 152;
  const words = new Int16Array(payloadBytes / 2);
  for (let i = 0; i < words.length; i++) words[i] = bytes.readInt16LE(4 + i * 2);
  const range = Array.from({ length: 19 }, (_, slot) => {
    const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
    for (let frame = 0; frame < decodedFrames; frame++) {
      for (let field = 0; field < 3; field++) {
        const v = words[frame * 76 + slot * 4 + field];
        mins[field] = Math.min(mins[field], v);
        maxs[field] = Math.max(maxs[field], v);
        samplesBySlot[slot][field].push(v);
      }
    }
    return { slot, fieldRanges: mins.map((min, i) => [min, maxs[i]]) };
  });
  const fourthValues = new Set();
  for (let i = 0; i < words.length; i += 4) fourthValues.add(words[i + 3]);
  motions.push({ file, declaredFrames, decodedFrames, frameStrideBytes: 152, entryCount: 19, entryStrideBytes: 8,
    fourthWordValues: [...fourthValues], declaredCountMatches: declaredFrames === decodedFrames, channelRanges: range });
  totalFrames += decodedFrames;
}
const slotStatistics = samplesBySlot.map((fields, slot) => ({
  slot, fieldRanges: fields.map(values => [Math.min(...values), Math.max(...values)]),
  fourthWordValues: [...new Set(motions.flatMap(m => m.channelRanges[slot] ? m.fourthWordValues : []))],
}));
const result = {
  sourceDirectory: path.resolve(directory),
  summary: { fileCount: files.length, decodedFrames: totalFrames, frameStrideBytes: 152, entriesPerFrame: 19,
    entryStrideBytes: 8, signed16BitWordsPerEntry: 4, fourthWordObserved: -16393, fourthWordHex: '0xBFF7',
    countMismatches: motions.filter(x => !x.declaredCountMatches).map(x => ({ file: x.file, declaredFrames: x.declaredFrames, decodedFrames: x.decodedFrames })) },
  slotStatistics, motions,
  interpretation: 'The executable confirms 19 runtime animation entries per frame. This inventory does not identify named bones or prove a one-to-one mapping to a skeleton hierarchy.'
};
const json = JSON.stringify(result, null, 2) + '\n';
if (output) fs.writeFileSync(output, json);
else process.stdout.write(json);
