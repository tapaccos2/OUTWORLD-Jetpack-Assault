import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#view');
const status = document.querySelector('#status');
const mapSelect = document.querySelector('#map');
const anchorSelect = document.querySelector('#anchor');
const diagonalSelect = document.querySelector('#diagonal');
const groupColorsCheck = document.querySelector('#groupColors');
const wireframeCheck = document.querySelector('#wireframe');
const normalsCheck = document.querySelector('#normals');
const referencePanel = document.querySelector('#referencePanel');
const referenceCanvas = document.querySelector('#referenceCanvas');
const referenceTitle = document.querySelector('#referenceTitle');
const referenceNote = document.querySelector('#referenceNote');
const referenceToggle = document.querySelector('#referenceToggle');
const overlayCanvas = document.querySelector('#overlayCanvas');
const overlayEnabledCheck = document.querySelector('#overlayEnabled');
const overlayScaleInput = document.querySelector('#overlayScale');
const overlayRotationInput = document.querySelector('#overlayRotation');
const overlayOffsetXInput = document.querySelector('#overlayOffsetX');
const overlayOffsetYInput = document.querySelector('#overlayOffsetY');
const overlayOpacityInput = document.querySelector('#overlayOpacity');
const overlayScaleValue = document.querySelector('#overlayScaleValue');
const overlayRotationValue = document.querySelector('#overlayRotationValue');
const overlayOffsetXValue = document.querySelector('#overlayOffsetXValue');
const overlayOffsetYValue = document.querySelector('#overlayOffsetYValue');
const overlayOpacityValue = document.querySelector('#overlayOpacityValue');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11191d);
scene.fog = new THREE.Fog(0x11191d, 120, 450);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xcce3e9, 0x514a3e, 1.8));
const sun = new THREE.DirectionalLight(0xffe3bd, 3.1);
sun.position.set(30, -45, 85);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8fc7e0, 0.8);
fill.position.set(-50, 35, 25);
scene.add(fill);

const grid = new THREE.GridHelper(120, 24, 0x496168, 0x2b3b40);
grid.rotation.x = Math.PI / 2;
grid.position.z = -0.02;
scene.add(grid);
const axes = new THREE.AxesHelper(12);
scene.add(axes);

let terrainMesh = null;
let normalLines = null;
let currentData = null;
let currentBounds = null;
let currentScale = 1;
let referenceRequestId = 0;
let referenceAvailable = false;

// Mission-map images available in original-data/misn. The mapping is explicit
// because original filenames/capitalisation do not follow one uniform pattern.
const mapReferences = {
  rag01: 'rag01m1.PCX', rag02: 'rag02m1.PCX', rag03: 'rag03m1.PCX',
  rag04: 'rag04m1.PCX', rag05: 'rag05.PCX', rag2m: 'r02mm1.PCX',
  rag3m: 'r04mm1.PCX',
  anub01: 'anub01m1.PCX', anub02: 'anub02m1.PCX', anub03: 'anub03m1.PCX',
  anub04: 'anub04m1.PCX', anub05: 'anub05m1.PCX',
  anub1m: 'a01mm1.PCX', anub2m: 'a02mm1.PCX', anub3m: 'a03mm1.PCX',
  oasis01: 'oasis1m1.PCX', oasis02: 'oasis2m1.PCX', oasis03: 'oasis3m1.PCX',
  oasis04: 'oasis4m1.PCX', oasis05: 'oasis5.PCX', oasis06: 'oasis6m1.PCX',
  oasis1m: 'o01mm1.PCX',
  dead01: 'dead01m1.PCX', dead02: 'dead02m1.PCX', dead03: 'dead03m1.PCX',
  dead04: 'dead04m1.PCX', dead1m: 'd01mm4.PCX',
  jug01: 'jug01m1.PCX', jug02: 'jug02m1.PCX',
  mik01: 'mik01m1.PCX', mik1m: 'm01mm1.PCX'
};

function decodeIndexedPcx(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const u16 = offset => view.getUint16(offset, true);
  const width = u16(8) - u16(4) + 1;
  const height = u16(10) - u16(6) + 1;
  const bits = bytes[3], planes = bytes[65], bytesPerLine = u16(66);
  if (bytes[0] !== 10 || bytes[1] !== 5 || bytes[2] !== 1 || bits !== 8 || planes !== 1 ||
      width < 1 || height < 1 || bytesPerLine < width) {
    throw new Error('Unsupported PCX format; expected version 5, RLE, 8-bit indexed image.');
  }
  const paletteStart = bytes.length - 769;
  if (paletteStart < 128 || bytes[paletteStart] !== 12) throw new Error('PCX palette marker not found.');
  const expected = height * bytesPerLine;
  const decoded = new Uint8Array(expected);
  let input = 128, output = 0;
  while (output < expected && input < paletteStart) {
    const value = bytes[input++];
    if ((value & 0xc0) === 0xc0) {
      const count = value & 0x3f;
      if (!count || input >= paletteStart) throw new Error('Invalid PCX RLE run.');
      const pixel = bytes[input++];
      decoded.fill(pixel, output, Math.min(output + count, expected));
      output += count;
    } else {
      decoded[output++] = value;
    }
  }
  if (output < expected) throw new Error(`PCX pixel data truncated (${output}/${expected}).`);
  const canvas = referenceCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  const image = context.createImageData(width, height);
  const palette = bytes.subarray(paletteStart + 1, paletteStart + 769);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = decoded[y * bytesPerLine + x] * 3;
      const out = (y * width + x) * 4;
      image.data[out] = palette[index];
      image.data[out + 1] = palette[index + 1];
      image.data[out + 2] = palette[index + 2];
      image.data[out + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return { width, height };
}

async function loadMapReference(mapName) {
  const requestId = ++referenceRequestId;
  const filename = mapReferences[mapName];
  referenceAvailable = false;
  referenceCanvas.hidden = true;
  renderOverlay();
  if (!filename) {
    referenceTitle.textContent = `${mapName.toUpperCase()} / NO MAPPED REFERENCE`;
    referenceNote.textContent = 'No matching original mission-map filename is mapped for this resource. The mesh can still be inspected in top-down view.';
    referenceCanvas.width = 1;
    referenceCanvas.height = 1;
    renderOverlay();
    return;
  }
  referenceTitle.textContent = `${mapName.toUpperCase()} / ${filename}`;
  referenceNote.textContent = 'Original mission/briefing map image. Compare the overall arrangement visually; this image is not a terrain texture and is not yet coordinate-aligned to the mesh.';
  try {
    const response = await fetch(`./original-data/misn/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (requestId !== referenceRequestId) return;
    const size = decodeIndexedPcx(buffer);
    referenceCanvas.hidden = false;
    referenceAvailable = true;
    renderOverlay();
    referenceNote.textContent = `Original mission/briefing image, ${size.width} × ${size.height}. The candidate RPC surfaces are overlaid for manual alignment; use the sliders to test scale, rotation and offsets. This is a visual calibration aid, not proof of original world coordinates.`;
  } catch (error) {
    if (requestId !== referenceRequestId) return;
    referenceTitle.textContent = `${mapName.toUpperCase()} / REFERENCE UNAVAILABLE`;
    referenceNote.textContent = `Could not load ${filename}: ${error.message}. The 3D mesh remains available for inspection.`;
    referenceAvailable = false;
    referenceCanvas.width = 1;
    referenceCanvas.height = 1;
    renderOverlay();
    console.warn('Mission reference image could not be loaded', filename, error);
  }
}

function setTopDownView() {
  if (!currentData || !currentBounds) return;
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, currentBounds.targetZ);
  const distance = Math.max(currentBounds.spanX, currentBounds.spanY) * currentScale * 1.45;
  camera.position.set(0, 0, Math.max(10, distance));
  camera.lookAt(0, 0, currentBounds.targetZ);
  controls.update();
}


function setStatus(message) {
  status.textContent = message;
}

function magic(view, expected) {
  return String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) === expected;
}

function parsePair(gpcBuffer, rpcBuffer, mapName) {
  const gpc = new DataView(gpcBuffer);
  const rpc = new DataView(rpcBuffer);
  if (gpc.byteLength < 20 || !magic(gpc, 'CPMG')) throw new Error('GPC magic/header is invalid');
  if (rpc.byteLength < 20 || !magic(rpc, 'CPMR')) throw new Error('RPC magic/header is invalid');
  if (gpc.getUint32(4, true) !== 0x43 || rpc.getUint32(4, true) !== 0x43) throw new Error('Unexpected resource version');

  const groupCount = gpc.getUint32(16, true);
  const surfaceCount = rpc.getUint32(16, true);
  if (gpc.byteLength !== 20 + groupCount * 32) throw new Error('GPC count does not match file length');
  if (rpc.byteLength !== 20 + surfaceCount * 40) throw new Error('RPC count does not match file length');
  if (groupCount > 200 || surfaceCount > 1000) throw new Error('Resource exceeds original parser limits');

  const groups = [];
  const groupForSurface = new Int32Array(surfaceCount);
  let nextExpected = 0;
  for (let i = 0; i < groupCount; i++) {
    const o = 20 + i * 32;
    const start = gpc.getUint16(o + 24, true);
    const end = gpc.getUint16(o + 26, true);
    if (start !== nextExpected || end < start || end >= surfaceCount) {
      throw new Error(`Group ${i} has an invalid RPC range ${start}..${end}`);
    }
    groups.push({
      index: i,
      x: gpc.getInt32(o, true),
      y: gpc.getInt32(o + 4, true),
      referenceHeight: gpc.getInt32(o + 8, true),
      spanX: gpc.getInt32(o + 12, true),
      spanY: gpc.getInt32(o + 16, true),
      start,
      end,
    });
    for (let j = start; j <= end; j++) groupForSurface[j] = i;
    nextExpected = end + 1;
  }
  if (nextExpected !== surfaceCount) throw new Error('GPC groups do not cover the complete RPC table');

  const surfaces = [];
  for (let i = 0; i < surfaceCount; i++) {
    const o = 20 + i * 40;
    const width = rpc.getUint16(o + 2, true);
    const depth = rpc.getUint16(o + 4, true);
    if (!width || !depth) throw new Error(`RPC surface ${i} has zero dimensions`);
    const normal = [
      rpc.getInt16(o + 10, true),
      rpc.getInt16(o + 12, true),
      rpc.getInt16(o + 14, true),
    ];
    const normalLength = Math.hypot(...normal) || 1;
    surfaces.push({
      index: i,
      type: rpc.getUint16(o, true),
      width,
      depth,
      sin: rpc.getInt16(o + 6, true) / 4095,
      cos: rpc.getInt16(o + 8, true) / 4095,
      normal: normal.map(v => v / normalLength),
      heights: [16, 20, 24, 28].map(p => rpc.getInt32(o + p, true)),
      x: rpc.getInt32(o + 32, true),
      y: rpc.getInt32(o + 36, true),
      group: groupForSurface[i],
    });
  }
  return { mapName, groups, surfaces };
}

function surfaceCorners(surface, anchor) {
  const u0 = anchor === 'center' ? -surface.width / 2 : 0;
  const u1 = anchor === 'center' ? surface.width / 2 : surface.width;
  const v0 = anchor === 'center' ? -surface.depth / 2 : 0;
  const v1 = anchor === 'center' ? surface.depth / 2 : surface.depth;
  const local = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
  return local.map(([u, v], i) => ({
    x: surface.x + u * surface.cos + v * surface.sin,
    y: surface.y - u * surface.sin + v * surface.cos,
    z: surface.heights[i],
  }));
}

function renderOverlay() {
  const width = referenceCanvas.width;
  const height = referenceCanvas.height;
  if (overlayCanvas.width !== width) overlayCanvas.width = width;
  if (overlayCanvas.height !== height) overlayCanvas.height = height;
  const context = overlayCanvas.getContext('2d');
  context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCanvas.dataset.surfaceCount = '0';
  overlayCanvas.dataset.rotation = String(Number(overlayRotationInput.value) || 0);
  overlayCanvas.dataset.scale = String(Number(overlayScaleInput.value) || 100);
  if (!referenceAvailable || !currentData || width < 2 || height < 2 || !overlayEnabledCheck.checked) return;

  const cornersBySurface = currentData.surfaces.map(surface => surfaceCorners(surface, anchorSelect.value));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const corners of cornersBySurface) {
    for (const p of corners) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const baseScale = Math.min(width / spanX, height / spanY) * 0.82 * (Number(overlayScaleInput.value) / 100);
  const angle = Number(overlayRotationInput.value) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const offsetX = Number(overlayOffsetXInput.value) / 100 * width;
  const offsetY = Number(overlayOffsetYInput.value) / 100 * height;
  context.globalAlpha = Number(overlayOpacityInput.value) / 100;
  context.lineWidth = Math.max(1, Math.min(3, width / 900));
  context.lineJoin = 'round';
  context.lineCap = 'round';

  for (let i = 0; i < currentData.surfaces.length; i++) {
    const surface = currentData.surfaces[i];
    const hue = ((surface.group * 0.618033988749895) % 1) * 360;
    const projected = cornersBySurface[i].map(p => {
      const x = p.x - centerX, y = p.y - centerY;
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      return {
        x: width / 2 + rotatedX * baseScale + offsetX,
        y: height / 2 - rotatedY * baseScale + offsetY,
      };
    });
    context.beginPath();
    context.moveTo(projected[0].x, projected[0].y);
    for (let j = 1; j < projected.length; j++) context.lineTo(projected[j].x, projected[j].y);
    context.closePath();
    context.fillStyle = `hsla(${hue}, 78%, 57%, 0.12)`;
    context.strokeStyle = `hsla(${hue}, 88%, 70%, 0.92)`;
    context.fill();
    context.stroke();
  }
  context.globalAlpha = 1;
  overlayCanvas.dataset.surfaceCount = String(currentData.surfaces.length);
  overlayCanvas.dataset.rotation = String(Number(overlayRotationInput.value) || 0);
  overlayCanvas.dataset.scale = String(Number(overlayScaleInput.value) || 100);
}

function updateOverlayOutputs() {
  overlayScaleValue.textContent = `${overlayScaleInput.value}%`;
  overlayRotationValue.textContent = `${overlayRotationInput.value}°`;
  overlayOffsetXValue.textContent = `${overlayOffsetXInput.value}%`;
  overlayOffsetYValue.textContent = `${overlayOffsetYInput.value}%`;
  overlayOpacityValue.textContent = `${overlayOpacityInput.value}%`;
}

function getSharedEdgeStats(data, anchor) {
  const edges = new Map();
  for (const surface of data.surfaces) {
    const points = surfaceCorners(surface, anchor);
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      const p = points[a], q = points[b];
      const key = [`${Math.round(p.x)},${Math.round(p.y)}`, `${Math.round(q.x)},${Math.round(q.y)}`].sort().join('|');
      const signature = [`${Math.round(p.x)},${Math.round(p.y)},${p.z}`, `${Math.round(q.x)},${Math.round(q.y)},${q.z}`].sort().join('|');
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(signature);
    }
  }
  let shared = 0, exact = 0;
  for (const signatures of edges.values()) {
    if (signatures.length < 2) continue;
    shared++;
    if (new Set(signatures).size === 1) exact++;
  }
  return { shared, exact };
}

function clearMesh() {
  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
    terrainMesh = null;
  }
  if (normalLines) {
    scene.remove(normalLines);
    normalLines.geometry.dispose();
    normalLines.material.dispose();
    normalLines = null;
  }
}

function makeMesh() {
  if (!currentData) return;
  clearMesh();
  const anchor = anchorSelect.value;
  const diagonal = diagonalSelect.value;
  const useGroupColors = groupColorsCheck.checked;
  const positions = [], normals = [], colors = [], indices = [];
  const rawCorners = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const surface of currentData.surfaces) {
    const corners = surfaceCorners(surface, anchor);
    rawCorners.push(corners);
    for (const p of corners) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const spanZ = Math.max(1, maxZ - minZ);
  currentScale = 110 / Math.max(spanX, spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const heightPalette = new THREE.Color();
  for (let i = 0; i < currentData.surfaces.length; i++) {
    const surface = currentData.surfaces[i];
    const corners = rawCorners[i];
    const groupHue = (surface.group * 0.618033988749895) % 1;
    for (let j = 0; j < 4; j++) {
      const p = corners[j];
      positions.push((p.x - centerX) * currentScale, (p.y - centerY) * currentScale, (p.z - minZ) * currentScale);
      normals.push(...surface.normal);
      if (useGroupColors) {
        heightPalette.setHSL(groupHue, 0.42, 0.40);
      } else {
        const t = (p.z - minZ) / spanZ;
        heightPalette.setHSL(0.095 + t * 0.09, 0.30, 0.24 + t * 0.32);
      }
      colors.push(heightPalette.r, heightPalette.g, heightPalette.b);
    }
    const base = i * 4;
    const reverse = surface.normal[2] < 0;
    if (diagonal === '1-2') {
      indices.push(...(reverse ? [base, base + 2, base + 1, base + 1, base + 2, base + 3] : [base, base + 1, base + 2, base + 1, base + 3, base + 2]));
    } else {
      indices.push(...(reverse ? [base, base + 3, base + 1, base, base + 2, base + 3] : [base, base + 1, base + 3, base, base + 3, base + 2]));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    wireframe: wireframeCheck.checked,
  });
  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  if (normalsCheck.checked) {
    const linePositions = [];
    const lineColors = [];
    const length = Math.max(spanX, spanY) * 0.012;
    const c = new THREE.Color(0x74f2d2);
    for (let i = 0; i < currentData.surfaces.length; i++) {
      const surface = currentData.surfaces[i];
      const points = rawCorners[i];
      const center = points.reduce((acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4, z: acc.z + p.z / 4 }), { x: 0, y: 0, z: 0 });
      linePositions.push(
        (center.x - centerX) * currentScale, (center.y - centerY) * currentScale, (center.z - minZ) * currentScale,
        (center.x - centerX + surface.normal[0] * length) * currentScale,
        (center.y - centerY + surface.normal[1] * length) * currentScale,
        (center.z - minZ + surface.normal[2] * length) * currentScale,
      );
      lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    normalLines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    scene.add(normalLines);
  }

  const targetZ = (spanZ * currentScale) / 2;
  currentBounds = { spanX, spanY, spanZ, targetZ };
  camera.up.set(0, 0, 1);
  controls.target.set(0, 0, targetZ);
  camera.position.set(80, -105, Math.max(45, targetZ + 80));
  camera.far = Math.max(2000, Math.max(spanX, spanY) * currentScale * 20);
  camera.updateProjectionMatrix();
  controls.update();

  const cornerStats = getSharedEdgeStats(currentData, 'corner');
  const centerStats = getSharedEdgeStats(currentData, 'center');
  setStatus(
    `MAP ${currentData.mapName.toUpperCase()} | ${currentData.groups.length} GPC groups | ${currentData.surfaces.length} RPC surfaces\n` +
    `Anchor: ${anchor} | Diagonal: ${diagonal} | Mesh: ${currentData.surfaces.length * 4} vertices / ${currentData.surfaces.length * 2} triangles\n` +
    `Bounds: ${Math.round(spanX)} × ${Math.round(spanY)} × ${Math.round(spanZ)} raw units | display scale ${currentScale.toFixed(5)}\n` +
    `Shared edges (corner): ${cornerStats.shared}, exact height matches: ${cornerStats.exact} | (centre): ${centerStats.shared}, exact: ${centerStats.exact}\n` +
`Field checks: dimensions + direction + normal + corner heights agree across the resource inventory; visual match to original terrain still pending.`
  );
  renderOverlay();
}

async function loadMap() {
  const name = mapSelect.value;
  setStatus(`Loading ${name.toUpperCase()} GPC/RPC resources…`);
  try {
    const base = `./original-data/structs/${name}`;
    const [gpcResponse, rpcResponse] = await Promise.all([
      fetch(base + '.gpc'), fetch(base + '.rpc'),
    ]);
    if (!gpcResponse.ok) throw new Error(`GPC fetch failed: HTTP ${gpcResponse.status}`);
    if (!rpcResponse.ok) throw new Error(`RPC fetch failed: HTTP ${rpcResponse.status}`);
    const [gpcBuffer, rpcBuffer] = await Promise.all([gpcResponse.arrayBuffer(), rpcResponse.arrayBuffer()]);
    currentData = parsePair(gpcBuffer, rpcBuffer, name);
    makeMesh();
    await loadMapReference(name);
  } catch (error) {
    clearMesh();
    setStatus(`Could not load ${name.toUpperCase()}: ${error.message}\nServe the repository over HTTP(S); binary resource files are fetched from ./original-data/structs/.`);
    console.error(error);
  }
}

document.querySelector('#load').addEventListener('click', loadMap);
document.querySelector('#topDown').addEventListener('click', setTopDownView);
referenceToggle.addEventListener('click', () => {
  referencePanel.hidden = !referencePanel.hidden;
  referenceToggle.textContent = referencePanel.hidden ? 'Show map reference' : 'Hide map reference';
});
for (const control of [overlayEnabledCheck, overlayScaleInput, overlayRotationInput, overlayOffsetXInput, overlayOffsetYInput, overlayOpacityInput]) {
  control.addEventListener('input', () => {
    updateOverlayOutputs();
    renderOverlay();
  });
}
document.querySelector('#overlayReset').addEventListener('click', () => {
  overlayEnabledCheck.checked = true;
  overlayScaleInput.value = '100';
  overlayRotationInput.value = '0';
  overlayOffsetXInput.value = '0';
  overlayOffsetYInput.value = '0';
  overlayOpacityInput.value = '75';
  updateOverlayOutputs();
  renderOverlay();
});
updateOverlayOutputs();
document.querySelector('#reset').addEventListener('click', () => { if (currentData) makeMesh(); });
for (const control of [anchorSelect, diagonalSelect, groupColorsCheck, normalsCheck]) control.addEventListener('change', () => { if (currentData) makeMesh(); });
wireframeCheck.addEventListener('change', () => { if (terrainMesh) terrainMesh.material.wireframe = wireframeCheck.checked; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadMap();
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
