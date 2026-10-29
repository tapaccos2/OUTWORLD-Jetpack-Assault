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
  const specs=[
   {url:source+'Rock001.glb',x:-8,z:-24,s:2.5,r:.4},{url:source+'Rock002.glb',x:9,z:-30,s:2.8,r:1.2},
   {url:source+'Rock003.glb',x:-14,z:-38,s:3.2,r:2.0},{url:source+'Rock001.glb',x:16,z:-42,s:3.4,r:.8},
   {url:source+'Cliff001.glb',x:-34,z:-48,s:8.5,r:.2},{url:source+'Cliff002.glb',x:35,z:-51,s:9,r:2.9},
   {url:source+'Mountain001.glb',x:-45,z:-80,s:17,r:.4},{url:source+'Mountain002.glb',x:43,z:-84,s:18,r:2.7}
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