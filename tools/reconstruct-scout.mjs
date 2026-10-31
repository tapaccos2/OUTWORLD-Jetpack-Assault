#!/usr/bin/env node
/**
 * One-command Scout reconstruction pipeline.
 *
 * Usage:
 *   node tools/reconstruct-scout.mjs <scout.dpc> [out-dir] [--exe outwars.exe]
 *
 * Produces:
 *   scout-raw.glb + scout-raw.json
 *   scout-owner-translation-test.glb + .json
 *   scout-transform-report/REPORT.txt (when --exe is supplied)
 *   reconstruction-manifest.json
 *
 * Important: this pipeline does not invent attachment transforms. The current
 * reverse-engineering evidence proves geometry extraction, but not the
 * Scout-specific runtime record-to-object transform mapping. The manifest
 * marks assembly as incomplete until verified runtime transforms are supplied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const input = args.find(x => !x.startsWith('--'));
if (!input) {
  console.error('Usage: node tools/reconstruct-scout.mjs <scout.dpc> [out-dir] [--exe outwars.exe]');
  process.exit(2);
}
const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) throw new Error('DPC file not found: ' + inputPath);
const exeFlag = args.indexOf('--exe');
const exePath = exeFlag >= 0 ? path.resolve(args[exeFlag + 1] || '') : null;
const outArg = args.slice(args.indexOf(input) + 1).find((x, i, a) => !x.startsWith('--') && (i === 0 || a[i - 1] !== '--exe'));
const outDir = path.resolve(outArg || 'scout-reconstruction');
fs.mkdirSync(outDir, { recursive: true });
const stem = path.basename(inputPath).replace(/\.dpc$/i, '');
const exporter = path.join(here, 'export-dpc-armour-geometry.mjs');
const bridge = path.join(here, 'scout-exe-transform-bridge.sh');

function run(label, command, commandArgs) {
  console.log('[' + label + '] ' + command + ' ' + commandArgs.join(' '));
  const r = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(label + ' failed with exit code ' + r.status);
}
const rawGlb = path.join(outDir, stem + '-raw.glb');
const candidateGlb = path.join(outDir, stem + '-owner-translation-test.glb');
run('source-faithful geometry', process.execPath, [exporter, inputPath, rawGlb]);
run('translation diagnostic (not accepted as final)', process.execPath, [exporter, inputPath, candidateGlb, '--apply-owner-translations']);

let exeReport = null;
if (exePath) {
  if (!fs.existsSync(exePath)) throw new Error('Executable not found: ' + exePath);
  const bridgeOut = path.join(outDir, 'scout-transform-report');
  run('executable transform analysis', 'bash', [bridge, exePath, bridgeOut]);
  exeReport = path.join(bridgeOut, 'REPORT.txt');
}
const rawReport = JSON.parse(fs.readFileSync(rawGlb.replace(/\.glb$/i, '.json'), 'utf8'));
const candidateReport = JSON.parse(fs.readFileSync(candidateGlb.replace(/\.glb$/i, '.json'), 'utf8'));
const manifest = {
  pipeline: 'Outwars Scout reconstruction pipeline',
  version: '1.0.0',
  source: inputPath,
  executable: exePath,
  outputs: {
    sourceFaithfulGeometry: rawGlb,
    ownerTranslationDiagnostic: candidateGlb,
    sourceReport: rawGlb.replace(/\.glb$/i, '.json'),
    diagnosticReport: candidateGlb.replace(/\.glb$/i, '.json'),
    executableAnalysis: exeReport
  },
  validation: {
    sourceMeshCount: rawReport.meshCount,
    sourceVertices: rawReport.totalVertices,
    sourceTriangles: rawReport.totalTriangles,
    diagnosticMeshCount: candidateReport.meshCount,
    diagnosticVertices: candidateReport.totalVertices,
    diagnosticTriangles: candidateReport.totalTriangles,
    geometryExtraction: rawReport.meshCount === 9 && rawReport.totalTriangles === 230 ? 'PASS' : 'CHECK'
  },
  reconstruction: {
    status: 'BLOCKED_ON_VERIFIED_RUNTIME_TRANSFORMS',
    assembledScout: false,
    reason: 'The available executable analysis has not yet connected the eight Scout part records to their runtime transform objects. Applying owner vectors as translations is an explicitly unverified diagnostic and is not accepted as a completed assembly.',
    requiredEvidence: [
      'Scout-specific mapping from each of the eight part records to its runtime object/record identifier',
      'The runtime position and Q20.12 orientation matrix consumed for each mapped part',
      'A verified root/parent relationship and coordinate-space convention'
    ]
  }
};
fs.writeFileSync(path.join(outDir, 'reconstruction-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('\nPipeline outputs: ' + outDir);
console.log('Geometry extraction: ' + manifest.validation.geometryExtraction);
console.log('Final Scout assembly: NOT CLAIMED — verified runtime part transforms are still missing.');
