(function(){
 const ROOT='https://raw.githubusercontent.com/Ariescar/gobkit-free-assets/main/';
 window.loadCombatModels=async function(THREE,enemies){
  if(!window.GLTFLoader)return [];
  const loader=new window.GLTFLoader(), names=['minion/minion-a01.glb','minion/minion-a02.glb','minion/minion-b01.glb','minion/minion-b02.glb','minion/minion-c01.glb','minion/minion-d01.glb'];
  const cache=await Promise.all(names.map(async url=>{try{return await loader.loadAsync(ROOT+url)}catch(e){console.warn('Could not load character model',url,e);return null}}));
  const mixers=[];
  enemies.forEach((enemy,index)=>{
   const source=cache[index%cache.length];if(!source)return;
   const model=source.scene.clone(true);model.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
   const height=Math.max(size.y,.01);model.scale.setScalar(2.05/height);model.updateMatrixWorld(true);
   const scaledBounds=new THREE.Box3().setFromObject(model);model.position.y-=scaledBounds.min.y;
   // Hide the handmade placeholder body, keeping its gameplay root and AI intact.
   enemy.traverse(part=>{if(part.isMesh)part.visible=false});
   model.rotation.y=Math.PI; // source pack faces +Z; orient towards the player
   model.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;if(Array.isArray(part.material))part.material.forEach(mat=>{mat.roughness=Math.max(mat.roughness??.8,.55)});else if(part.material)part.material.roughness=Math.max(part.material.roughness??.8,.55)}});
   enemy.add(model);enemy.userData.externalModel=model;
   if(cache[index%cache.length]&&source.animations&&source.animations.length){
    const mixer=new THREE.AnimationMixer(model),clip=source.animations[0];
    const action=mixer.clipAction(clip);action.play();mixers.push(mixer);
   }
  });
  return mixers;
 };
 window.loadEnvironmentAssets=async function(THREE,scene,lowPowerDevice){
  if(!window.GLTFLoader)return {loaded:[],count:0};
  const loader=new window.GLTFLoader(),source=ROOT+'nature/';
  // Genuine GLB environment assets. Keep vegetation around the perimeter so the central combat lane stays clear.
  const specs=[
   // Existing rock formations
   {file:'Rock001.glb',x:-9,z:-23,s:1.65,r:.4},{file:'Rock002.glb',x:10,z:-27,s:1.8,r:1.2},
   {file:'Rock003.glb',x:-15,z:-34,s:1.9,r:2.0},{file:'Rock001.glb',x:16,z:-37,s:1.9,r:.8},
   {file:'Rock002.glb',x:-21,z:-45,s:2.1,r:1.6},{file:'Rock003.glb',x:22,z:-48,s:2.2,r:2.9},
   {file:'Rock001.glb',x:-27,z:-57,s:2.6,r:.2},{file:'Rock002.glb',x:28,z:-60,s:2.6,r:2.4},
   // 3D alien trees at varied heights, placed along both sides of the arena
   {file:'TreeHigh001.glb',x:-8,z:-16,s:7.5,r:.4},{file:'TreeMed002.glb',x:-11,z:-25,s:6.2,r:1.8},
   {file:'TreeLow003.glb',x:-9,z:-35,s:5.0,r:2.6},{file:'TreeHigh002.glb',x:8,z:-19,s:7.5,r:2.2},
   {file:'TreeMed001.glb',x:11,z:-31,s:6.2,r:.7},{file:'TreeLow002.glb',x:9,z:-42,s:5.0,r:1.3},
   {file:'TreeHigh003.glb',x:-12,z:-48,s:7.8,r:1.1},{file:'TreeMed003.glb',x:-8,z:-59,s:6.0,r:2.7},
   {file:'TreeLow001.glb',x:12,z:-55,s:5.0,r:.2},{file:'TreeHigh001.glb',x:8,z:-70,s:7.5,r:1.6},
   {file:'TreeMed002.glb',x:-12,z:-76,s:6.0,r:2.1},
   // Bushes and ground cover add detail without creating a wall of foliage
   {file:'Bush001.glb',x:-13,z:-20,s:1.45,r:.2},{file:'Bush002.glb',x:13,z:-22,s:1.4,r:1.5},
   {file:'Bush002.glb',x:-24,z:-31,s:1.55,r:2.5},{file:'Bush001.glb',x:25,z:-34,s:1.5,r:.8},
   {file:'Bush001.glb',x:-16,z:-43,s:1.35,r:1.2},{file:'Bush002.glb',x:17,z:-46,s:1.4,r:2.7},
   {file:'Bush002.glb',x:-29,z:-66,s:1.6,r:.5},{file:'Bush001.glb',x:28,z:-68,s:1.5,r:1.9},
   {file:'Grass001.glb',x:-12,z:-29,s:.72,r:.1},{file:'Grass002.glb',x:12,z:-32,s:.7,r:1.1},
   {file:'Grass003.glb',x:-15,z:-52,s:.75,r:2.1},{file:'Grass001.glb',x:15,z:-55,s:.7,r:.4},
   {file:'Grass002.glb',x:-25,z:-40,s:.8,r:2.7},{file:'Grass003.glb',x:26,z:-44,s:.75,r:1.5},
   {file:'Grass001.glb',x:-21,z:-73,s:.75,r:.8},{file:'Grass002.glb',x:22,z:-77,s:.75,r:2.4}
  ];
  const chosen=lowPowerDevice?specs.filter((item,index)=>item.file.startsWith('Tree')?index%2===0:(!item.file.startsWith('Grass')||index%3===0)):specs;
  // Load each source file once, then clone it for placements to avoid duplicate network downloads.
  const sourceCache=new Map();
  const getSource=file=>{
   if(!sourceCache.has(file))sourceCache.set(file,loader.loadAsync(source+file));
   return sourceCache.get(file);
  };
  const loaded=await Promise.all(chosen.map(async item=>{try{
   const gltf=await getSource(item.file),model=gltf.scene.clone(true);
   model.rotation.y=item.r;
   model.updateMatrixWorld(true);
   const originalBounds=new THREE.Box3().setFromObject(model);
   const originalSize=originalBounds.getSize(new THREE.Vector3());
   // Tree height, not widest dimension, controls scale. Center X/Z and put the feet on the terrain.
   const targetHeight=item.s;
   const scale=targetHeight/Math.max(.001,originalSize.y);
   model.scale.setScalar(scale);
   model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model);
   const center=box.getCenter(new THREE.Vector3());
   model.position.x+=item.x-center.x;
   model.position.z+=item.z-center.z;
   model.position.y-=box.min.y;
   model.traverse(part=>{if(part.isMesh){part.castShadow=!lowPowerDevice;part.receiveShadow=true;part.frustumCulled=false}});
   scene.add(model);
   return item.file;
  }catch(e){console.warn('Environment model failed',item.file,e);return null}}));
  const successful=loaded.filter(Boolean);
  console.info('OUTWORLD: loaded 3D environment assets',successful.length,'of',chosen.length);
  return {loaded:successful,count:successful.length};
 };
})();