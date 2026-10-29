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
   crate:'https://cdn.3dassets.dev/assets/17350/v1/model.glb'
  };
  const specs=[
   {asset:'crashSite',x:0,z:-54,scale:.62,rotation:0,kind:'scene'},
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
   {asset:'crate',x:13,z:-38,scale:.58,rotation:2.4,kind:'prop',collision:1.0}
  ];
  const chosen=lowPowerDevice?specs.filter(item=>item.kind!=='rock'||(item.x<0&&item.z===-38)):specs;
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
    const scale=item.height?item.height/Math.max(.001,beforeSize.y):(item.scale||1);
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
    console.error('Textured environment GLB failed to load; no procedural replacement was added:',item.asset,URLS[item.asset],e);
    return null;
   }
  }));
  const successful=loaded.filter(Boolean);
  console.info('OUTWORLD: loaded textured CC0 environment GLBs',successful.length,'of',chosen.length);
  return {loaded:successful,count:successful.length};
 };
})();