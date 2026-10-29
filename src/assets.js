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
  const loader=new window.GLTFLoader();
  // These are actual textured GLB assets, with their materials and texture maps embedded.
  // Sources are CC0 and web-optimised; no primitive stand-ins are generated for failed models.
  const URLS={
   canopy:'https://cdn.3dassets.dev/assets/36136/v1/model.glb',
   buttress:'https://cdn.3dassets.dev/assets/36137/v1/model.glb',
   boulders:'https://cdn.3dassets.dev/assets/18142/v1/model.glb',
   crashSite:'https://cdn.3dassets.dev/assets/17375/v1/model.glb',
   crate:'https://cdn.3dassets.dev/assets/27447/v1/model.glb'
  };
  const specs=[
   // Omit the bundled crash-site scene: its large pale base slab reads as a floating platform.
   {asset:'canopy',x:-17,z:-19,height:8.5,rotation:.45,kind:'tree',collision:1.6},
   {asset:'buttress',x:18,z:-22,height:7.4,rotation:2.3,kind:'tree',collision:1.7},
   {asset:'canopy',x:-19,z:-37,height:8.0,rotation:2.6,kind:'tree',collision:1.6},
   {asset:'buttress',x:19,z:-41,height:7.0,rotation:.9,kind:'tree',collision:1.7},
   {asset:'canopy',x:-15,z:-54,height:7.7,rotation:1.7,kind:'tree',collision:1.6},
   {asset:'buttress',x:15,z:-56,height:7.2,rotation:3.1,kind:'tree',collision:1.7},
   {asset:'boulders',x:-20,z:-28,scale:1.0,rotation:.4,kind:'rock',collision:1.8},
   {asset:'boulders',x:20,z:-32,scale:1.0,rotation:2.1,kind:'rock',collision:1.8},
   {asset:'boulders',x:-20,z:-47,scale:.9,rotation:1.4,kind:'rock',collision:1.7},
   {asset:'boulders',x:20,z:-50,scale:.9,rotation:2.8,kind:'rock',collision:1.7},
   {asset:'crate',x:-13,z:-29,scale:.58,rotation:.4,kind:'prop',collision:1.0},
   {asset:'crate',x:13,z:-38,scale:.58,rotation:2.4,kind:'prop',collision:1.0},
   {asset:'crate',x:-11,z:-16,scale:.62,rotation:1.2,kind:'prop',collision:1.0},
   {asset:'crate',x:11,z:-25,scale:.62,rotation:2.0,kind:'prop',collision:1.0},
   {asset:'crate',x:-12,z:-43,scale:.62,rotation:.6,kind:'prop',collision:1.0},
   {asset:'crate',x:12,z:-48,scale:.62,rotation:2.8,kind:'prop',collision:1.0},
   {asset:'boulders',x:-13,z:-20,scale:.7,rotation:1.1,kind:'rock',collision:1.5},
   {asset:'boulders',x:13,z:-35,scale:.7,rotation:2.4,kind:'rock',collision:1.5},
   {asset:'boulders',x:-13,z:-51,scale:.7,rotation:.2,kind:'rock',collision:1.5},
   {asset:'canopy',x:-12,z:-31,height:6.3,rotation:1.8,kind:'tree',collision:1.5},
   {asset:'buttress',x:12,z:-46,height:6.0,rotation:2.2,kind:'tree',collision:1.5},
   // Dense combat dressing: cover clusters are deliberately placed along the playable route,
   // not only on the far outside edges of the ravine.
   {asset:'boulders',x:-8.5,z:-10,scale:.72,rotation:.8,kind:'rock',collision:1.35},
   {asset:'crate',x:8.5,z:-12,scale:.56,rotation:1.7,kind:'prop',collision:.8},
   {asset:'canopy',x:14,z:-13,height:6.5,rotation:2.5,kind:'tree',collision:1.3},
   {asset:'buttress',x:-15,z:-16,height:6.8,rotation:.4,kind:'tree',collision:1.35},
   {asset:'boulders',x:5.5,z:-19,scale:.68,rotation:2.3,kind:'rock',collision:1.3},
   {asset:'crate',x:-5.3,z:-20,scale:.55,rotation:.2,kind:'prop',collision:.8},
   {asset:'canopy',x:16,z:-25,height:6.4,rotation:1.1,kind:'tree',collision:1.35},
   {asset:'boulders',x:-15,z:-25,scale:.75,rotation:2.8,kind:'rock',collision:1.4},
   {asset:'crate',x:4.5,z:-28,scale:.6,rotation:2.1,kind:'prop',collision:.85},
   {asset:'boulders',x:9.5,z:-30,scale:.72,rotation:.6,kind:'rock',collision:1.35},
   {asset:'canopy',x:-16,z:-32,height:6.8,rotation:2.1,kind:'tree',collision:1.4},
   {asset:'crate',x:5.5,z:-34,scale:.56,rotation:1.4,kind:'prop',collision:.8},
   {asset:'boulders',x:-8.5,z:-35,scale:.7,rotation:1.9,kind:'rock',collision:1.3},
   {asset:'buttress',x:15,z:-36,height:6.3,rotation:2.7,kind:'tree',collision:1.3},
   {asset:'crate',x:-5,z:-39,scale:.58,rotation:.9,kind:'prop',collision:.8},
   {asset:'boulders',x:8.5,z:-42,scale:.72,rotation:2.5,kind:'rock',collision:1.35},
   {asset:'canopy',x:-14,z:-45,height:6.4,rotation:1.5,kind:'tree',collision:1.35},
   {asset:'crate',x:5,z:-46,scale:.58,rotation:2.7,kind:'prop',collision:.8},
   {asset:'boulders',x:-8,z:-48,scale:.7,rotation:.3,kind:'rock',collision:1.3},
   {asset:'buttress',x:14,z:-52,height:6.7,rotation:1.9,kind:'tree',collision:1.4},
   {asset:'crate',x:7,z:-54,scale:.56,rotation:.4,kind:'prop',collision:.8},
   // Rear perimeter around the player start (player spawns at z=+5).
   {asset:'canopy',x:-20,z:7,height:8.2,rotation:.8,kind:'tree',collision:1.5},
   {asset:'buttress',x:20,z:8,height:7.8,rotation:2.5,kind:'tree',collision:1.5},
   {asset:'boulders',x:-16,z:10,scale:1.0,rotation:.7,kind:'rock',collision:1.6},
   {asset:'boulders',x:16,z:10,scale:.95,rotation:2.3,kind:'rock',collision:1.6},
   {asset:'crate',x:-10,z:9,scale:.62,rotation:.3,kind:'prop',collision:.8},
   {asset:'crate',x:10,z:10,scale:.62,rotation:2.1,kind:'prop',collision:.8},
   {asset:'canopy',x:-21,z:1,height:7.6,rotation:2.2,kind:'tree',collision:1.5},
   {asset:'buttress',x:21,z:2,height:7.4,rotation:.4,kind:'tree',collision:1.5},
   {asset:'boulders',x:-13,z:2,scale:.9,rotation:1.8,kind:'rock',collision:1.5},
   {asset:'boulders',x:13,z:1,scale:.92,rotation:.2,kind:'rock',collision:1.5},
   {asset:'crate',x:-7,z:0,scale:.58,rotation:1.2,kind:'prop',collision:.8},
   {asset:'crate',x:7,z:0,scale:.58,rotation:2.6,kind:'prop',collision:.8},
   {asset:'canopy',x:-18,z:-4,height:7.1,rotation:1.4,kind:'tree',collision:1.4},
   {asset:'buttress',x:18,z:-3,height:7.3,rotation:2.8,kind:'tree',collision:1.4},
   {asset:'boulders',x:-11,z:6,scale:.8,rotation:2.4,kind:'rock',collision:1.3},
   {asset:'boulders',x:11,z:6,scale:.8,rotation:.9,kind:'rock',collision:1.3},
   {asset:'crate',x:-4.8,z:10.5,scale:.54,rotation:.6,kind:'prop',collision:.75},
   {asset:'crate',x:4.8,z:10.5,scale:.54,rotation:2.4,kind:'prop',collision:.75}
  ];
  // Arrange imported models in continuous roadside bands instead of scattering them.
  // The centre remains a clear lane; crates form the inner shoulder, rocks the mid-shoulder,
  // and tall trees the outside boundary. This changes placement only, never model geometry.
  for(const item of specs){
   if(item.kind==='scene')continue;
   const side=item.x<0?-1:1;
   if(item.kind==='prop')item.x=side*(5.4+((Math.round(Math.abs(item.z)*2)%3)*.35));
   else if(item.kind==='rock')item.x=side*(8.2+((Math.round(Math.abs(item.z)*2)%3)*.55));
   else if(item.kind==='tree')item.x=side*(14.2+((Math.round(Math.abs(item.z)*2)%3)*1.1));
  }
  const chosen=lowPowerDevice?specs.filter((item,index)=>item.kind!=='rock'||index%3===0):specs;
  // Only imported GLB scenery is rendered; failed downloads are logged and skipped.
  const sourceCache=new Map();
  const getSource=key=>{
   if(!sourceCache.has(key))sourceCache.set(key,loader.loadAsync(URLS[key]));
   return sourceCache.get(key);
  };
  const loaded=await Promise.all(chosen.map(async item=>{
   try{
    const gltf=await getSource(item.asset),model=gltf.scene.clone(true);
    model.rotation.y=item.rotation||0;
    model.updateMatrixWorld(true);
    const before=new THREE.Box3().setFromObject(model),beforeSize=before.getSize(new THREE.Vector3());
    const maxDim=Math.max(beforeSize.x,beforeSize.y,beforeSize.z,.001);
    // Normalise GLB authoring units so an asset's source scale cannot turn a crate into a shipping container.
    const targetSize=item.height?item.height:(item.kind==='rock'?3.0*(item.scale||1):1.45*(item.scale||.58)/.58);
    const scale=targetSize/(item.height?Math.max(.001,beforeSize.y):maxDim);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
    model.position.x=item.x-center.x;
    model.position.z=item.z-center.z;
    model.position.y-=bounds.min.y;
    model.traverse(part=>{
     if(!part.isMesh)return;
     part.castShadow=!lowPowerDevice;
     part.receiveShadow=true;
     part.frustumCulled=false;
     if(part.material){
      const materials=Array.isArray(part.material)?part.material:[part.material];
      materials.forEach(material=>{
       material.needsUpdate=true;
       if(material.map)material.map.colorSpace=THREE.SRGBColorSpace;
       if(material.roughnessMap)material.roughnessMap.colorSpace=THREE.NoColorSpace;
       if(material.normalMap)material.normalMap.colorSpace=THREE.NoColorSpace;
      });
     }
    });
    if(item.collision){model.userData.blocksEnemy=true;model.userData.blockRadius=item.collision;}
    model.userData.environmentAsset=item.asset;
    scene.add(model);
    return item.asset;
   }catch(e){
    console.error('Environment GLB failed; no non-asset substitute will be rendered:',item.asset,URLS[item.asset],e);
    return null;
   }
  }));
  const successful=loaded.filter(Boolean);
  console.info('OUTWORLD: loaded textured CC0 environment GLBs',successful.length,'of',chosen.length);
  return {loaded:successful,count:successful.length};
 };
})();