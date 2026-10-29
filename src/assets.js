import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads CC0 glTF props from Gobkit's public free environment pack.
 * Source/license: https://gobkit.com/api/free (CC0 1.0; redistribution permitted).
 * Assets are optional and load asynchronously; existing procedural meshes remain as fallback.
 */
export async function loadEnvironmentAssets(THREE, scene, lowPowerDevice) {
  const loader = new GLTFLoader();
  const definitions = [
    { key: 'rockA', url: 'https://gobkit.com/freebies/environment/Rock001.glb' },
    { key: 'rockB', url: 'https://gobkit.com/freebies/environment/Rock002.glb' },
    { key: 'cliff', url: 'https://gobkit.com/freebies/environment/Cliff001.glb' }
  ];
  const loaded = {};
  await Promise.all(definitions.map(async item => {
    try {
      const gltf = await loader.loadAsync(item.url);
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      model.scale.setScalar(1 / maxDim);
      model.updateMatrixWorld(true);
      const normalizedBounds = new THREE.Box3().setFromObject(model);
      model.position.y -= normalizedBounds.min.y;
      model.traverse(node => {
        if (node.isMesh) {
          node.castShadow = !lowPowerDevice;
          node.receiveShadow = true;
          if (node.material) {
            node.material.side = THREE.FrontSide;
            node.material.needsUpdate = true;
          }
        }
      });
      loaded[item.key] = model;
    } catch (error) {
      console.warn('Could not load CC0 model:', item.url, error);
    }
  }));

  const placeCopies = (key, placements) => {
    const prototype = loaded[key];
    if (!prototype) return;
    for (const p of placements) {
      const prop = prototype.clone(true);
      const s = p.scale || 1;
      prop.scale.multiplyScalar(s);
      prop.position.set(p.x, p.y || 0, p.z);
      prop.rotation.y = p.rotation || 0;
      prop.traverse(node => {
        if (node.isMesh && node.material) {
          node.material = node.material.clone();
          node.material.roughness = Math.max(node.material.roughness ?? 0.8, 0.78);
        }
      });
      scene.add(prop);
    }
  };

  placeCopies('rockA', [
    {x:-17,z:-12,scale:3.0,rotation:.4},{x:18,z:-18,scale:2.7,rotation:1.1},
    {x:-24,z:-31,scale:3.8,rotation:2.1},{x:25,z:-34,scale:3.5,rotation:.7},
    {x:-11,z:-43,scale:2.2,rotation:2.8},{x:13,z:-48,scale:2.6,rotation:1.9},
    {x:-32,z:-22,scale:3.4,rotation:.3},{x:31,z:-26,scale:3.0,rotation:2.5}
  ]);
  placeCopies('rockB', [
    {x:-20,z:-8,scale:2.0,rotation:1.4},{x:22,z:-11,scale:1.8,rotation:2.4},
    {x:-27,z:-39,scale:2.3,rotation:.2},{x:29,z:-42,scale:2.1,rotation:1.7},
    {x:-6,z:-54,scale:1.6,rotation:2.0},{x:7,z:-57,scale:1.7,rotation:.6}
  ]);
  placeCopies('cliff', [
    {x:-43,z:-36,scale:13,rotation:0},{x:44,z:-39,scale:14,rotation:Math.PI},
    {x:-35,z:-66,scale:11,rotation:.2},{x:36,z:-69,scale:12,rotation:Math.PI-.2}
  ]);
  return { loaded: Object.keys(loaded), count: Object.keys(loaded).length };
}
