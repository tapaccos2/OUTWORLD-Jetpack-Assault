#!/usr/bin/env node
/**
 * Scout class-specific renderer audit.
 *
 * Called by scout-closeout.mjs. Captures the class dispatcher supplied to the
 * executable's DPC callback interpreter, the class-0x0006 setup path, the
 * called object helper, and the exact owner/mesh/paired DPC records.
 *
 * This is evidence collection, not a guessed transform exporter.
 *
 * Usage:
 *   node tools/scout-class-renderer-audit.mjs <scout_mj.dpc> <outwars.exe> <out-dir> [part-graph.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dpcPath = argv[0] && path.resolve(argv[0]);
const exePath = argv[1] && path.resolve(argv[1]);
const outDir = argv[2] && path.resolve(argv[2]);
const graphPath = argv[3] && path.resolve(argv[3]);
if (!dpcPath || !exePath || !outDir) {
  console.error('Usage: node tools/scout-class-renderer-audit.mjs <scout_mj.dpc> <outwars.exe> <out-dir> [part-graph.json]');
  process.exit(2);
}
for (const file of [dpcPath, exePath]) if (!fs.existsSync(file)) throw new Error('Missing input: ' + file);
fs.mkdirSync(outDir, { recursive: true });

const bytes = fs.readFileSync(dpcPath);
if (bytes.length < 36 || bytes.toString('ascii', 0, 4) !== 'DCPM' || bytes[4] !== 0x43)
  throw new Error('Expected DCPMC v0x43 source DPC.');
const relocationBase = bytes.readUInt32LE(12);
const u16 = o => Number.isInteger(o) && o >= 0 && o + 2 <= bytes.length ? bytes.readUInt16LE(o) : null;
const u32 = o => Number.isInteger(o) && o >= 0 && o + 4 <= bytes.length ? bytes.readUInt32LE(o) : null;
const s32 = o => Number.isInteger(o) && o >= 0 && o + 4 <= bytes.length ? bytes.readInt32LE(o) : null;
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function header(offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > bytes.length) return null;
  return { offset, opcode: bytes[offset], flags: bytes[offset + 1], classWord: u16(offset + 2) };
}
function record(offset) {
  const h = header(offset);
  if (!h) return null;
  const words = [];
  for (let p = 0; p < 0x80 && offset + p + 4 <= bytes.length; p += 4)
    words.push({ fieldOffset: p, u32: u32(offset + p), s32: s32(offset + p), hex: '0x' + u32(offset + p).toString(16).padStart(8, '0') });
  const pointers = [];
  for (let p = 0; p < 0x80 && offset + p + 4 <= bytes.length; p += 4) {
    const value = u32(offset + p);
    const target = value - relocationBase;
    if (value >= relocationBase && target >= 0 && target + 4 <= bytes.length)
      pointers.push({ fieldOffset: p, raw: '0x' + value.toString(16), targetOffset: target, targetHeader: header(target) });
  }
  return {
    ...h,
    rawHex: bytes.subarray(offset, Math.min(offset + 0x80, bytes.length)).toString('hex').match(/.{1,2}/g)?.join(' ') || '',
    signedVectors: {
      plus8: [s32(offset + 8), s32(offset + 12), s32(offset + 16)],
      plus32: [s32(offset + 32), s32(offset + 36), s32(offset + 40)],
      plus56: [s32(offset + 56), s32(offset + 60), s32(offset + 64)]
    },
    words,
    pointers
  };
}

const graph = graphPath && fs.existsSync(graphPath) ? JSON.parse(fs.readFileSync(graphPath, 'utf8')) : null;
const entries = graph?.graph?.entries || [];
const ownerRows = entries.map(entry => {
  const detail = entry.detail || {};
  const ownerOffset = detail.offset;
  const meshOffset = detail.child24?.targetOffset ?? null;
  const pairedOffset = detail.child28?.targetOffset ?? null;
  return {
    index: entry.index,
    ownerOffset,
    owner: record(ownerOffset),
    meshNodeOffset: meshOffset,
    meshNode: record(meshOffset),
    pairedNodeOffset: pairedOffset,
    pairedNode: record(pairedOffset),
    ownerVectorCandidate: detail.ownerVectorCandidate || null,
    pairChecks: detail.pairChecks || null,
    geometry: detail.geometry ? {
      label: detail.geometry.label,
      meshNodeOffset: detail.geometry.meshNodeOffset,
      vertexBaseOffset: detail.geometry.vertexBaseOffset,
      faceOffset: detail.geometry.faceOffset,
      sourceFaceRecords: detail.geometry.sourceFaceRecords,
      uniqueQuads: detail.geometry.uniqueQuads,
      triangles: detail.geometry.triangles,
      referencedVertexCount: detail.geometry.referencedVertexCount,
      bounds: detail.geometry.bounds
    } : null
  };
});

function chooseObjdump() {
  const candidates = [process.env.OBJDUMP, 'i686-w64-mingw32-objdump', 'objdump'].filter(Boolean);
  for (const candidate of candidates) {
    const test = spawnSync(candidate, ['--version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (test.status === 0) return candidate;
  }
  throw new Error('Could not find i686-w64-mingw32-objdump or objdump.');
}
const objdump = chooseObjdump();
function disassemble(label, start, stop) {
  const result = spawnSync(objdump, ['-d', '-Mintel', '--start-address=0x' + start.toString(16), '--stop-address=0x' + stop.toString(16), exePath], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error('objdump failed for ' + label + ': ' + (result.stderr || result.error?.message || ''));
  const file = path.join(outDir, label + '.asm.txt');
  fs.writeFileSync(file, result.stdout);
  return { label, start: '0x' + start.toString(16), stop: '0x' + stop.toString(16), file: path.basename(file), bytes: Buffer.byteLength(result.stdout) };
}

const windows = [
  disassemble('class-dispatch-420b00', 0x420b00, 0x422162),
  disassemble('callback-interpreter-4dfce4', 0x4dfce4, 0x4e0580),
  disassemble('class6-object-setup-4e1ad8', 0x4e1ad8, 0x4e1af8),
  disassemble('class6-current-object-setter-4e3260', 0x4e3260, 0x4e32a2),
  disassemble('class6-object-consumer-4e32a0', 0x4e32a0, 0x4e4100),
  disassemble('eight-slot-update-4e40a0', 0x4e40a0, 0x4e4110),
  disassemble('eight-slot-update-4e4d5c', 0x4e4d5c, 0x4e4e20),
  disassemble('opcode5-matrix-stack-handler', 0x4e0130, 0x4e023a),
  disassemble('shared-callback-tail', 0x4e0592, 0x4e05f0),
  disassemble('callback-queue-pop', 0x4dfd88, 0x4dfe56),
  disassemble('class-high-id-switch', 0x42183c, 0x421baa),
  disassemble('face-slot-render-state-consumer-514c80', 0x514c80, 0x514fc9),
  disassemble('object-allocation-4cc83c', 0x4cc83c, 0x4cca20),
  disassemble('record-class-guard-490388', 0x490388, 0x490500),
  disassemble('record-helper-4e59c8', 0x4e59c8, 0x4e5a80),
  disassemble('fixed-point-matrix-helpers', 0x4c5500, 0x4c6684),
  disassemble('generic-class-handlers-442b00', 0x442b00, 0x443000)
];

const full = spawnSync(objdump, ['-d', '-Mintel', exePath], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
if (full.status !== 0) throw new Error('Full executable disassembly failed: ' + (full.stderr || full.error?.message || ''));
const callTargets = new Set(['4dfce4', '420b00', '4e1ad8', '4e3260', '4e32a0', '4e40a0', '4e4d5c', '4e59c8', '4cc988', '4cc9d0', '490388', '4c6610', '4c5500', '4c5aa0', '4c57dc']);
const globals = ['0x12d7368', '0x12d736c', '0x12d7370', '0x12d7374', '0x12d7378', '0x12d737c', '0x12d7380', '0x12d6cc8', '0x12d6c74', '0x12d6c78', '0x12d6c7c', '0x12d6c80', '0x52d218', '0x52d28c', '0x64752c', '0x647528', '0x647530'];
const xrefLines = [];
const allLines = full.stdout.split(/\r?\n/);
for (let i = 0; i < allLines.length; i++) {
  const line = allLines[i];
  const call = line.match(/\bcall\s+(?:DWORD PTR\s+)?(?:0x)?([0-9a-f]{6,8})\b/i);
  const isCall = call && callTargets.has(call[1].toLowerCase().replace(/^0x/, ''));
  const isGlobal = globals.some(g => line.toLowerCase().includes(g));
  if (isCall || isGlobal) {
    xrefLines.push(allLines.slice(Math.max(0, i - 1), Math.min(allLines.length, i + 2)).join('\n'));
  }
}
const xrefFile = path.join(outDir, 'CLASS-RENDERER-XREFS.txt');
fs.writeFileSync(xrefFile, [...new Set(xrefLines)].join('\n\n') + '\n');

const exeBuffer = fs.readFileSync(exePath);
const pointerValues = [0x004dfce4, 0x00420b00, 0x004e1ad8, 0x004e3260, 0x004e32a0, 0x004e59c8];
const rawPointerHits = [];
for (const value of pointerValues) {
  const needle = Buffer.alloc(4);
  needle.writeUInt32LE(value, 0);
  let from = 0;
  const hits = [];
  while (from <= exeBuffer.length - 4) {
    const at = exeBuffer.indexOf(needle, from);
    if (at < 0) break;
    hits.push('0x' + at.toString(16));
    from = at + 1;
  }
  rawPointerHits.push({ va: '0x' + value.toString(16), fileOffsets: hits.slice(0, 100), total: hits.length });
}

const classCounts = {};
const uniqueClass6 = new Set();
const uniqueClass7 = new Set();
for (const row of ownerRows) {
  const nodes = [row.owner, row.meshNode, row.pairedNode].filter(Boolean);
  for (const node of nodes) {
    const key = 'opcode_' + node.opcode + '_class_0x' + node.classWord.toString(16);
    classCounts[key] = (classCounts[key] || 0) + 1;
    if (node.classWord === 6) uniqueClass6.add(node.offset);
    if (node.classWord === 7) uniqueClass7.add(node.offset);
  }
}
const summary = {
  status: 'CLASS_SPECIFIC_DISPATCH_CAPTURED',
  executableSha256: sha256(exePath),
  dpcSha256: sha256(dpcPath),
  relocationBase: '0x' + relocationBase.toString(16),
  callbackInterpreter: '0x4dfce4',
  callbackClassFunction: '0x420b00',
  class6Path: ['0x420c04', '0x4e1ad8', '0x4e3260'],
  class6ObjectSetupFunction: '0x4e1ad8',
  class6CurrentObjectSetter: '0x4e3260',
  class6ObjectConsumer: '0x4e32a0',
  class6CurrentObjectGlobal: '0x12d7368',
  class6DpcRecordPointerOffset: '0x160',
  slotTagHelper: '0x4e59c8',
  slotTagCounterGlobal: '0x12d7370',
  slotUpdateTableGlobal: '0x12d7374',
  slotUpdateTableEntryCount: 8,
  slotTagBits: '13..15',
  slotTagConsumer: '0x514d15',
  slotTagConsumerBehavior: 'extracts bits 13..15 from faceRecord+0x20 and uses 2*slot to select a two-bit flag from faceRecord+0x24; the selected bit chooses renderer state 0x83/0x84.',
  slotUpdateFunctions: ['0x4e40a0', '0x4e4d5c'],
  ownerRecordCount: ownerRows.length,
  uniqueClass6RecordCount: uniqueClass6.size,
  uniqueClass7RecordCount: uniqueClass7.size,
  classCounts,
  disassemblyWindows: windows,
  xrefCount: xrefLines.length,
  rawPointerHits
};
const report = {
  title: 'Outwars Scout class-specific renderer audit',
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  inputs: { dpc: path.basename(dpcPath), executable: path.basename(exePath), partGraph: graphPath ? path.basename(graphPath) : null },
  summary,
  ownerRows
};
fs.writeFileSync(path.join(outDir, 'CLASS-RENDERER-AUDIT.json'), JSON.stringify(report, null, 2) + '\n');
const lines = [
  '# Scout class-specific renderer audit',
  '',
  '- Status: ' + summary.status,
  '- Callback interpreter: ' + summary.callbackInterpreter,
  '- Class callback function: ' + summary.callbackClassFunction,
  '- Class-0x0006 path: ' + summary.class6Path.join(' -> '),
  '- Class-0x0006 setup function: ' + summary.class6ObjectSetupFunction,
  '- Current-object setter: ' + summary.class6CurrentObjectSetter + ' writes the active object pointer to ' + summary.class6CurrentObjectGlobal,
  '- Class-0x0006 object consumer: ' + summary.class6ObjectConsumer + ' reads the DPC record pointer at object+0x160 and builds spatial/attachment records.',
  '- Face-record helper: ' + summary.slotTagHelper + ' assigns a modulo-8 slot tag in bits ' + summary.slotTagBits + ' using counter ' + summary.slotTagCounterGlobal + '.',
  '- Slot-tag consumer: ' + summary.slotTagConsumer + ' extracts that tag from faceRecord+0x20 and selects a two-bit renderer-state flag from faceRecord+0x24.',
  '- Eight-entry update table: ' + summary.slotUpdateTableGlobal + ' with update functions ' + summary.slotUpdateFunctions.join(', ') + '.',
  '- Owner records: ' + summary.ownerRecordCount,
  '- Unique class-0x0006 records: ' + summary.uniqueClass6RecordCount,
  '- Unique class-0x0007 records: ' + summary.uniqueClass7RecordCount,
  '- Executable call/global xref lines: ' + summary.xrefCount,
  '',
  '## What this establishes',
  '',
  'The executable calls 0x4dfce4 with 0x420b00 as its class callback. The class-0x0006 branch invokes 0x4e1ad8 and then 0x4e3260; 0x4e3260 stores the object pointer in global 0x12d7368. The 0x4e32a0 consumer reads the DPC record pointer at object+0x160 and emits 0x1c-byte spatial/attachment records. Separately, 0x4e59c8 assigns 3-bit modulo-8 tags to descriptor payload records, and two routines update an eight-entry runtime table.',
  '',
  'The face-record slot tag is confirmed to select a renderer-state flag at 0x514d15; its relationship to the separate eight-entry rotation/position update table is not yet proven. The 0x4e32a0 object consumer is not yet proven to be the visual mesh renderer. This audit records executable behavior without assigning unsupported semantics.',
  '',
  '## Files',
  '',
  '- CLASS-RENDERER-AUDIT.json: complete machine-readable report and DPC record windows.',
  '- CLASS-RENDERER-XREFS.txt: call sites and references to the callback, object setup and matrix helpers.',
  '- *.asm.txt: disassembly windows for the class callback, object setup and supporting helpers.'
];
fs.writeFileSync(path.join(outDir, 'CLASS-RENDERER-AUDIT.md'), lines.join('\n') + '\n');
console.log('Class-specific renderer audit complete');
console.log('Class-0x0006 records: ' + summary.uniqueClass6RecordCount + ' | class-0x0007 records: ' + summary.uniqueClass7RecordCount);
console.log('0x4e1ad8 disassembly: ' + path.join(outDir, 'class6-object-setup-4e1ad8.asm.txt'));
console.log('Report: ' + path.join(outDir, 'CLASS-RENDERER-AUDIT.md'));
