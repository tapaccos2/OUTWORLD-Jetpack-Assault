#!/usr/bin/env node
/**
 * Exact-build audit of Scout opcode-5 transform slot IDs and consumers.
 * Read-only. All outputs are written under repoRoot/scout-logs/.
 *
 * Usage:
 *   node tools/scout-transform-slot-audit.mjs --exe /path/to/outwars.exe
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const logRoot = path.join(repoRoot, 'scout-logs');
const outDir = path.join(logRoot, 'scout-transform-slot-audit');
const zipPath = path.join(logRoot, 'scout-transform-slot-audit.zip');
const expectedExeSha = '722d06042ec0d432fa76f2bc29b693eac613f82546d0278f7332fcf0fc4352e2';
const expectedDpcSha = '05887eae665ec9eb7da64420d549e239d23c0a81e3b27eae4f77ac655df58758';

let exe = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--exe') exe = process.argv[++i];
  else throw new Error('Usage: node tools/scout-transform-slot-audit.mjs [--exe /path/to/outwars.exe]');
}
if (!exe) {
  const home = process.env.HOME || '';
  exe = [
    path.join(repoRoot, 'outwars.exe'),
    path.join(repoRoot, '..', 'Outwars-extracted', 'outwars.exe'),
    path.join(home, 'Outwars-extracted', 'outwars.exe'),
    path.join(home, 'Documents', 'Outwars-extracted', 'outwars.exe'),
    path.join(home, 'Downloads', 'outwars.exe')
  ].find(p => fs.existsSync(p));
}
if (!exe || !fs.existsSync(exe)) throw new Error('Could not find outwars.exe. Pass --exe with its full path.');
exe = path.resolve(exe);

const unitsFf = path.join(repoRoot, 'original-data', 'units.ff');
const extractor = path.join(scriptDir, 'extract-ff-resources.mjs');
if (!fs.existsSync(unitsFf)) throw new Error('Missing original-data/units.ff.');
if (!fs.existsSync(extractor)) throw new Error('Missing tools/extract-ff-resources.mjs.');

const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const exeSha = sha256(exe);
if (exeSha !== expectedExeSha) {
  throw new Error('Executable build mismatch. Expected SHA-256 ' + expectedExeSha + ' but found ' + exeSha + '. Address reports from different builds must not be mixed.');
}

fs.mkdirSync(logRoot, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(outDir, { recursive: true });
const analysisDir = path.join(outDir, 'analysis');
const workDir = path.join(outDir, 'work');
const extractDir = path.join(workDir, 'extracted');
fs.mkdirSync(analysisDir, { recursive: true });

function runChecked(label, command, args, logFile) {
  const r = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const log = '$ ' + command + ' ' + args.join(' ') + '\nexitCode=' + r.status + '\n' + (r.stdout || '') + '\n' + (r.stderr || '');
  if (logFile) fs.writeFileSync(logFile, log);
  if (r.error || r.status !== 0) throw new Error(label + ' failed: ' + (r.error?.message || r.stderr || r.status));
  return r.stdout || '';
}

runChecked('FF extraction', process.execPath, [extractor, unitsFf, '--out', extractDir], path.join(analysisDir, '00-extraction.log'));
const dpc = path.join(extractDir, 'units', 'scout_mj.dpc');
if (!fs.existsSync(dpc)) throw new Error('Expected extracted file units/scout_mj.dpc is missing.');
const dpcSha = sha256(dpc);
if (dpcSha !== expectedDpcSha) {
  throw new Error('Scout DPC build mismatch. Expected SHA-256 ' + expectedDpcSha + ' but found ' + dpcSha + '.');
}

let objdump = null;
for (const candidate of ['i686-w64-mingw32-objdump', 'x86_64-w64-mingw32-objdump', 'objdump']) {
  const t = spawnSync(candidate, ['-f', exe], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (t.status === 0) { objdump = candidate; break; }
}
if (!objdump) throw new Error('No PE-capable objdump found. Install binutils-mingw-w64-i686.');

const fullDisassembly = path.join(logRoot, 'renderer-backend-probe', '01-full-disassembly.txt');
if (!fs.existsSync(fullDisassembly)) {
  throw new Error('Missing scout-logs/renderer-backend-probe/01-full-disassembly.txt. Run the renderer backend probe first.');
}

const b = fs.readFileSync(dpc);
const base = b.readUInt32LE(12);
const u16 = o => b.readUInt16LE(o);
const u32 = o => b.readUInt32LE(o);
const s32 = o => b.readInt32LE(o);
function relPtr(o) {
  if (o < 0 || o + 4 > b.length) return null;
  const v = u32(o), rel = v - base;
  return v >= base && rel >= 0 && rel + 4 <= b.length ? rel : null;
}

const records = [];
const byClass = new Map();
const bySlot = new Map();
let rawOpcode5Count = 0;
for (let o = 0; o + 0x3c <= b.length; o++) {
  if (b[o] !== 5) continue;
  rawOpcode5Count++;
  const childCount = b[o + 0x36];
  if (childCount > 32) continue;
  const children = [];
  let valid = childCount > 0;
  for (let j = 0; j < childCount; j++) {
    const field = o + 0x38 + j * 4;
    const target = relPtr(field);
    if (target === null || target + 4 > b.length) { valid = false; break; }
    children.push({
      pointerFieldOffset: '0x' + field.toString(16),
      targetOffset: '0x' + target.toString(16),
      targetOpcode: b[target],
      targetClassWord: u16(target + 2)
    });
  }
  if (!valid) continue;
  const classWord = u16(o + 2);
  const slotWord = u16(o + 0x34);
  const row = {
    dpcOffset: '0x' + o.toString(16),
    flagsByte1: b[o + 1],
    classWord,
    slotWordAtPlus34: slotWord,
    slotTableByteOffset: slotWord >= 1 && slotWord <= 18 ? '0x' + ((slotWord - 1) * 4).toString(16) : null,
    validClass100TableIndex: classWord === 100 && slotWord >= 1 && slotWord <= 18,
    matrixWordsPlus04To24: Array.from({ length: 9 }, (_, k) => s32(o + 4 + k * 4)),
    positionWordsPlus28To30: [s32(o + 0x28), s32(o + 0x2c), s32(o + 0x30)],
    childCount,
    children
  };
  records.push(row);
  if (!byClass.has(classWord)) byClass.set(classWord, []);
  byClass.get(classWord).push(row);
  if (classWord === 100) {
    if (!bySlot.has(slotWord)) bySlot.set(slotWord, []);
    bySlot.get(slotWord).push(row);
  }
}

const slotRows = [...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([slot, rows]) => ({
  slotWord: slot,
  tableByteOffset: slot >= 1 && slot <= 18 ? '0x' + ((slot - 1) * 4).toString(16) : null,
  recordCount: rows.length,
  records: rows.map(r => ({ dpcOffset: r.dpcOffset, childCount: r.childCount, position: r.positionWordsPlus28To30 }))
}));
const missingSlots = Array.from({ length: 18 }, (_, i) => i + 1).filter(slot => !bySlot.has(slot));
const duplicateSlots = slotRows.filter(row => row.recordCount > 1);
const invalidSlots = slotRows.filter(row => row.slotWord < 1 || row.slotWord > 18);

const report = {
  title: 'OUTWARS SCOUT TRANSFORM SLOT AUDIT',
  version: '1.0.0',
  executable: { path: exe, sha256: exeSha, expectedBuildMatched: true, disassembler: objdump },
  source: { unitsArchiveSha256: sha256(unitsFf), scoutDpcSha256: dpcSha, scoutDpcBytes: b.length, relocationBase: '0x' + base.toString(16) },
  handlerEvidence: {
    opcode5Handler: '0x4e0130',
    callbackClassDispatcher: '0x420b00',
    class100DispatcherRoute: '0x420c29 -> 0x414c20 -> 0x415540',
    class100SlotTableBase: '0x5395fc',
    slotIndexField: 'WORD [record+0x34]',
    tableWrite: 'tableBase + slotIndex*4 - 4',
    tableEntryCapacity: 18,
    tableRegistrationFlag: 'BYTE [0x5395fc+0x48]',
    retrievalHelper: '0x414d68',
    perObjectTableInitializer: '0x4157a4',
    laterRecordConsumer: '0x415810',
    caution: 'A matching class-100 slot is not, by itself, proof that it belongs to one of the eight exported Scout mesh sections.'
  },
  summary: {
    rawOpcode5ByteOccurrences: rawOpcode5Count,
    structurallyPlausibleOpcode5Records: records.length,
    classCounts: Object.fromEntries([...byClass.entries()].map(([k, v]) => [String(k), v.length])),
    class100RecordCount: (byClass.get(100) || []).length,
    class100DistinctSlotCount: bySlot.size,
    class100ValidSlotCount: slotRows.filter(r => r.slotWord >= 1 && r.slotWord <= 18).length,
    class100InvalidSlotCount: invalidSlots.length,
    duplicateSlotCount: duplicateSlots.length,
    missingClass100SlotsWithinTable: missingSlots
  },
  slotRows, duplicateSlots, invalidSlots, records
};
fs.writeFileSync(path.join(outDir, 'SCOUT-TRANSFORM-SLOT-AUDIT.json'), JSON.stringify(report, null, 2) + '\n');

const disLines = fs.readFileSync(fullDisassembly, 'utf8').split(/\r?\n/);
function addressWindow(address, before = 4, after = 24) {
  const i = disLines.findIndex(line => line.trimStart().toLowerCase().startsWith(address + ':'));
  if (i < 0) return ['<address not present: ' + address + '>'];
  return disLines.slice(Math.max(0, i - before), Math.min(disLines.length, i + after));
}
const windows = [
  ['class-dispatch-420b00', '420b00', 4, 200],
  ['class100-handler-420c29', '420c29', 4, 24],
  ['class-table-selector-414c20', '414c20', 4, 105],
  ['class-table-reset-414d68', '414d68', 4, 65],
  ['class100-slot-registration-415540', '415540', 4, 24],
  ['object-slot-table-initializer-4157a4', '4157a4', 4, 28],
  ['object-slot-table-consumer-415810', '415810', 4, 150]
];
for (const [name, address, before, after] of windows) {
  fs.writeFileSync(path.join(analysisDir, name + '.asm.txt'), addressWindow(address, before, after).join('\n') + '\n');
}

const targetRefs = ['414c20', '414d68', '415540', '4157a4', '415810'];
const xrefs = [];
for (let i = 0; i < disLines.length; i++) {
  const line = disLines[i];
  if (targetRefs.some(t => new RegExp('\\b(?:call|jmp)\\s+(?:DWORD PTR\\s+)?0x?' + t + '\\b', 'i').test(line))) {
    xrefs.push(disLines.slice(Math.max(0, i - 3), Math.min(disLines.length, i + 5)).join('\n'));
  }
}
fs.writeFileSync(path.join(analysisDir, '02-slot-handler-call-xrefs.txt'), xrefs.join('\n\n') + '\n');

const md = [
  '# Scout transform slot audit',
  '',
  '- Executable SHA-256: ' + exeSha,
  '- Scout DPC SHA-256: ' + dpcSha,
  '- Structurally plausible opcode-5 records: **' + records.length + '**',
  '- Class-100 records: **' + (byClass.get(100) || []).length + '**',
  '- Distinct class-100 slot values: **' + bySlot.size + '**',
  '- Valid table slots (1–18): **' + slotRows.filter(r => r.slotWord >= 1 && r.slotWord <= 18).length + '**',
  '- Duplicate slot IDs: **' + duplicateSlots.length + '**',
  '',
  '## Class-100 slot registration',
  '',
  'The executable routes class 100 records through 0x420c29 -> 0x414c20 -> 0x415540. The registration helper writes each opcode-5 record pointer to 0x5395fc + (WORD[record+0x34] * 4) - 4. The table has 18 DWORD entries.',
  '',
  '| Slot WORD (+0x34) | Table byte offset | Records | DPC record offsets |',
  '|---:|---:|---:|---|',
  ...slotRows.map(r => '| ' + r.slotWord + ' | ' + (r.tableByteOffset ?? 'out of range') + ' | ' + r.recordCount + ' | ' + r.records.map(x => x.dpcOffset).join(', ') + ' |'),
  '',
  '## Gaps and collisions',
  '',
  '- Missing slot numbers in 1–18: ' + (missingSlots.join(', ') || 'none'),
  '- Duplicate slot numbers: ' + (duplicateSlots.map(r => r.slotWord).join(', ') || 'none'),
  '- Out-of-range slot numbers: ' + (invalidSlots.map(r => r.slotWord).join(', ') || 'none'),
  '',
  '## Interpretation and next gate',
  '',
  'This identifies a concrete class-indexed registration and retrieval path for opcode-5 records. It is consistent with a transform or animation-track table. It does not yet prove that any slot belongs to one of the eight Scout geometry owners. That requires an exact cross-reference from these slot IDs to DPC owner/mesh descriptors or to indexed vertex/face data.',
  '',
  'The ZIP includes exact executable disassembly windows, call xrefs, all candidate slot IDs, positions, matrices and child references. No GLB is exported or modified.'
];
fs.writeFileSync(path.join(outDir, 'SCOUT-TRANSFORM-SLOT-AUDIT.md'), md.join('\n') + '\n');

// Remove extracted proprietary game resources before packaging; only derived reports remain.
fs.rmSync(workDir, { recursive: true, force: true });

const zipped = spawnSync('zip', ['-qr', zipPath, path.basename(outDir)], { cwd: logRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (zipped.error || zipped.status !== 0) throw new Error('ZIP packaging failed: ' + (zipped.error?.message || zipped.stderr || zipped.status));

console.log('SCOUT TRANSFORM SLOT AUDIT COMPLETE');
console.log('Executable SHA-256: ' + exeSha);
console.log('Scout DPC SHA-256: ' + dpcSha);
console.log('Class-100 transform records: ' + (byClass.get(100) || []).length);
console.log('Distinct class-100 slots: ' + bySlot.size);
console.log('Logs: ' + outDir + '/');
console.log('Archive: ' + zipPath);
