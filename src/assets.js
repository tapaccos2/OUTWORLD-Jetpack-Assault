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
   crate:'https://cdn.3dassets.dev/assets/27447/v1/model.glb',
   building:'https://cdn.3dassets.dev/assets/36525/v1/model.glb'
  };
  const specs=[
   // Mission 01: devastated human outpost on a barren moon, not a forest planet.
   {asset:'building',x:-8.5,z:-10.5,height:5.6,rotation:.22,kind:'building'},
   {asset:'building',x:5.8,z:-15.5,height:4.7,rotation:1.62,kind:'building'},
   {asset:'building',x:-2,z:-21,height:6.2,rotation:2.82,kind:'building'},
   {asset:'crashSite',x:8.8,z:-24,height:5.2,rotation:2.15,kind:'wreck'},
   {asset:'building',x:-11.5,z:-29.5,height:4.3,rotation:1.02,kind:'building'},
   {asset:'building',x:4.2,z:-34.5,height:5.1,rotation:3.32,kind:'building'},
   {asset:'crashSite',x:-5.5,z:-39.5,height:4.8,rotation:.55,kind:'wreck'},
   {asset:'building',x:10.5,z:-44,height:3.8,rotation:2.55,kind:'building'},
   {asset:'crate',x:-13,z:-16,scale:.62,rotation:1.2,kind:'prop',collision:1},
   {asset:'crate',x:11,z:-25,scale:.62,rotation:2,kind:'prop',collision:1},
   {asset:'crate',x:-12,z:-43,scale:.62,rotation:.6,kind:'prop',collision:1},
   {asset:'crate',x:12,z:-48,scale:.62,rotation:2.8,kind:'prop',collision:1},
   {asset:'boulders',x:-19,z:-17,scale:1,rotation:.4,kind:'rock',collision:1.8},
   {asset:'boulders',x:19,z:-21,scale:1,rotation:2.1,kind:'rock',collision:1.8},
   {asset:'boulders',x:-20,z:-34,scale:.9,rotation:1.4,kind:'rock',collision:1.7},
   {asset:'boulders',x:20,z:-39,scale:.9,rotation:2.8,kind:'rock',collision:1.7},
   {asset:'boulders',x:-15,z:-51,scale:.7,rotation:1.1,kind:'rock',collision:1.5},
   {asset:'boulders',x:15,z:-54,scale:.7,rotation:2.4,kind:'rock',collision:1.5},
   {asset:'crate',x:-4.5,z:-12,scale:.54,rotation:.2,kind:'prop',collision:.8},
   {asset:'crate',x:3.5,z:-31,scale:.56,rotation:1.4,kind:'prop',collision:.8},
   {asset:'crate',x:-6,z:-46,scale:.58,rotation:.9,kind:'prop',collision:.8},
   {asset:'boulders',x:-21,z:6,scale:.8,rotation:2.4,kind:'rock',collision:1.3},
   {asset:'boulders',x:21,z:7,scale:.8,rotation:.9,kind:'rock',collision:1.3}
  ];
  // Mission one is barren moon terrain: industrial wreckage and rock cover, no forest props.
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