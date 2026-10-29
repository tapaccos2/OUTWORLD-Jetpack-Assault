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
  // Keep the imported props in the playable scale range. The cliff assets have
  // broad, rounded silhouettes in this camera and were responsible for the giant wall-like blobs.
  const specs=[
   {url:source+'Rock001.glb',x:-9,z:-23,s:1.65,r:.4},{url:source+'Rock002.glb',x:10,z:-27,s:1.8,r:1.2},
   {url:source+'Rock003.glb',x:-15,z:-34,s:1.9,r:2.0},{url:source+'Rock001.glb',x:16,z:-37,s:1.9,r:.8},
   {url:source+'Rock002.glb',x:-21,z:-45,s:2.1,r:1.6},{url:source+'Rock003.glb',x:22,z:-48,s:2.2,r:2.9},
   {url:source+'Rock001.glb',x:-27,z:-57,s:2.6,r:.2},{url:source+'Rock002.glb',x:28,z:-60,s:2.6,r:2.4}
  ];
  const loaded=await Promise.all(specs.map(async item=>{try{
   const gltf=await loader.loadAsync(item.url),model=gltf.scene;
   model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
   const maxDim=Math.max(size.x,size.y,size.z)||1;model.scale.setScalar(item.s/maxDim);
   model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model);model.position.y-=box.min.y;model.position.x=item.x;model.position.z=item.z;model.rotation.y=item.r;
   model.traverse(part=>{if(part.isMesh){part.castShadow=!lowPowerDevice;part.receiveShadow=true}});scene.add(model);return item.url;
  }catch(e){console.warn('Environment model failed',item.url,e);return null}}));
  return {loaded:loaded.filter(Boolean),count:loaded.filter(Boolean).length};
 };
})();