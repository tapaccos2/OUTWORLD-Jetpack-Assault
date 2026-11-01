#!/usr/bin/env node
/**
 * Scout one-shot transform + geometry evidence test.
 *
 * Runs the existing integrated reconstruction/finalization pipeline, then
 * preserves the exact extracted DPC and executable callback/matrix disassembly
 * in the same ZIP. This is designed to eliminate repeated diagnostic uploads.
 *
 * Usage:
 *   node tools/scout-one-shot-decode-test.mjs original-data/units.ff scout-one-shot --exe /path/to/outwars.exe
 *
 * Output:
 *   scout-one-shot/       reports, five geometry variants, raw Scout DPC,
 *                         executable disassembly and checksums
 *   scout-one-shot.zip    single uploadable evidence bundle
 *
 * Important: this is a comprehensive evidence/test run, not a promise that
 * unknown runtime semantics can be inferred automatically. It never promotes
 * an unverified GLB to a finished Scout model.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const args = process.argv.slice(2);
let source = null, outArg = null, exe = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--exe') {
    if (!args[i + 1]) throw new Error('--exe requires the path to outwars.exe');
    exe = path.resolve(args[++i]);
  } else if (a.startsWith('--')) throw new Error('Unknown option: ' + a);
  else if (source === null) source = a;
  else if (outArg === null) outArg = a;
  else throw new Error('Unexpected argument: ' + a);
}
if (!source) {
  console.error('Usage: node tools/scout-one-shot-decode-test.mjs <units.ff|scout_mj.dpc> [out-dir] --exe <outwars.exe>');
  process.exit(2);
}
source = path.resolve(source);
if (!fs.existsSync(source)) throw new Error('Source not found: ' + source);
if (!exe) throw new Error('Pass --exe with the original outwars.exe; transform callback semantics must be tied to this executable.');
if (!fs.existsSync(exe)) throw new Error('Executable not found: ' + exe);

const out = path.resolve(outArg || 'scout-one-shot');
const rel = path.relative(repo, out);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
  throw new Error('Output must be a dedicated folder inside the repository.');
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function run(label, command, argv, options = {}) {
  console.log('\n[' + label + ']');
  const r = spawnSync(command, argv, {
    cwd: options.cwd || repo,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(label + ' failed (exit ' + r.status + '): ' + (r.error?.message || r.stderr || ''));
  return r.stdout || '';
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

// 1) Run the existing integrated callback, opcode-4/opcode-5, executable,
//    geometry-export and GLB structural-validation pipeline.
const finalizer = path.join(here, 'scout-finalize.mjs');
if (!fs.existsSync(finalizer)) throw new Error('Missing tools/scout-finalize.mjs');
run('integrated Scout transform and geometry pipeline', process.execPath,
  [finalizer, source, out, '--exe', exe]);

// 2) Preserve the exact extracted DPC used by the reports. This is essential:
//    a report without its source bytes forces another upload and can hide
//    parser/version mismatches.
const finalReportPath = path.join(out, 'FINAL-REPORT.json');
const finalReport = JSON.parse(fs.readFileSync(finalReportPath, 'utf8'));
const dpc = finalReport.extractedDpc;
if (!dpc || !fs.existsSync(dpc)) throw new Error('Finalizer did not retain a readable extracted DPC path.');
const rawDir = path.join(out, 'source-binaries');
fs.mkdirSync(rawDir, { recursive: true });
const dpcCopy = path.join(rawDir, 'scout_mj.dpc');
fs.copyFileSync(dpc, dpcCopy);

// 3) Capture the exact executable's callback dispatcher, opcode-4/opcode-5
//    handlers, and fixed-point matrix helpers. These ranges are deliberately
//    separate so the disassembly remains easy to inspect.
const disDir = path.join(out, 'executable-disassembly');
fs.mkdirSync(disDir, { recursive: true });
const objdump = spawnSync('objdump', ['--version'], { encoding: 'utf8' });
if (objdump.status !== 0) throw new Error('GNU objdump is required (install binutils).');
const sections = [
  { name: 'callback-dispatch-and-transform-handlers.txt', start: '0x4DFCE4', stop: '0x4E05B0' },
  { name: 'fixed-point-matrix-helpers.txt', start: '0x4C5AA0', stop: '0x4C6750' }
];
for (const s of sections) {
  const text = run('disassemble ' + s.name, 'objdump',
    ['-d', '--start-address=' + s.start, '--stop-address=' + s.stop, exe]);
  fs.writeFileSync(path.join(disDir, s.name), text);
}

// 4) Store exact hashes and concise machine-readable test outcome.
const report = {
  title: 'OUTWARS SCOUT ONE-SHOT TRANSFORM + GEOMETRY TEST',
  version: '1.0.0',
  sourceArchiveOrDpc: source,
  executable: path.basename(exe),
  binaries: {
    scoutDpc: { file: 'source-binaries/scout_mj.dpc', bytes: fs.statSync(dpcCopy).size, sha256: sha256(dpcCopy) },
    executable: { file: path.basename(exe), bytes: fs.statSync(exe).size, sha256: sha256(exe) }
  },
  includedDisassembly: sections.map(s => ({ file: 'executable-disassembly/' + s.name, start: s.start, stop: s.stop })),
  integratedReport: 'FINAL-REPORT.json',
  reconstructionManifest: 'analysis/reconstruction-manifest.json',
  geometryVariants: [
    'geometry/scout-mj-raw-shared.glb',
    'geometry/scout-mj-owner-translated.glb',
    'geometry/scout-mj-reference-point-mapped.glb',
    'geometry/scout-mj-mesh-reference-base.glb',
    'geometry/scout-mj-mesh-reference-owner-translated.glb'
  ],
  interpretation: 'This bundle contains all source bytes and executable code ranges needed for a single forensic pass. Structural GLB validation is not proof of correct topology, transform ownership, or visual assembly.'
};
writeJson(path.join(out, 'ONE-SHOT-TEST-REPORT.json'), report);
fs.writeFileSync(path.join(out, 'UPLOAD-INSTRUCTIONS.txt'),
  'Upload the single file ' + path.basename(out) + '.zip.\n' +
  'It contains the exact scout_mj.dpc used, five geometry variants, all callback/transform reports, the executable SHA-256, and disassembly for the callback and matrix helper ranges.\n' +
  'Do not upload the executable itself. Keep it unchanged until analysis is complete.\n');

// 5) Rebuild one ZIP after adding raw DPC and disassembly.
const zipProbe = spawnSync('zip', ['-v'], { encoding: 'utf8' });
if (zipProbe.status !== 0) throw new Error('Install the zip utility.');
const archive = out + '.zip';
fs.rmSync(archive, { force: true });
run('package one-shot evidence bundle', 'zip', ['-qr', archive, '.'], { cwd: out });
console.log('\nONE-SHOT TEST READY');
console.log('DPC SHA-256: ' + report.binaries.scoutDpc.sha256);
console.log('EXE SHA-256: ' + report.binaries.executable.sha256);
console.log('Bundle: ' + archive);
console.log('Upload only this ZIP. Final model correctness will be judged separately from structural validation.');
