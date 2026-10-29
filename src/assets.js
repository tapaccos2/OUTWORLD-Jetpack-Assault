(function(){
  const SOURCE='https://raw.githubusercontent.com/Ariescar/gobkit-free-assets/main/nature/';
  window.loadEnvironmentAssets=async function(THREE,scene,lowPowerDevice){
    if(!THREE.GLTFLoader){console.warn('GLTFLoader unavailable; keeping procedural environment.');return {loaded:[],count:0};}
    const loader=new THREE.GLTFLoader();
    const defs=[{key:'rockA',url:SOURCE+'Rock001.glb'},{key:'rockB',url:SOURCE+'Rock002.glb'},{key:'cliff',url:SOURCE+'Cliff001.glb'},{key:'rockC',url:SOURCE+'Rock003.glb'},{key:'cliffB',url:SOURCE+'Cliff002.glb'},{key:'hill',url:SOURCE+'Hill001.glb'}];
    const loaded={};
    await Promise.all(defs.map(async item=>{try{
      const gltf=await loader.loadAsync(item.url),model=gltf.scene;
      model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
      const maxDim=Math.max(size.x,size.y,size.z)||1;model.scale.setScalar(1/maxDim);model.updateMatrixWorld(true);
      const normalized=new THREE.Box3().setFromObject(model);model.position.y-=normalized.min.y;
      model.traverse(n=>{if(n.isMesh){n.castShadow=!lowPowerDevice;n.receiveShadow=true;}});
      loaded[item.key]=model;
    }catch(err){console.warn('Optional environment model failed:',item.url,err);}}));
    const place=(key,positions)=>{if(!loaded[key])return;for(const p of positions){const model=loaded[key].clone(true);model.scale.multiplyScalar(p.s);model.position.set(p.x,0,p.z);model.rotation.y=p.r||0;model.traverse(n=>{if(n.isMesh&&n.material){n.material=n.material.clone();n.material.roughness=Math.max(n.material.roughness??.8,.78);}});scene.add(model);}};
    place('rockA',[{x:-17,z:-12,s:3,r:.4},{x:18,z:-18,s:2.7,r:1.1},{x:-24,z:-31,s:3.8,r:2.1},{x:25,z:-34,s:3.5,r:.7},{x:-11,z:-43,s:2.2,r:2.8},{x:13,z:-48,s:2.6,r:1.9},{x:-32,z:-22,s:3.4,r:.3},{x:31,z:-26,s:3,r:2.5}]);
    place('rockB',[{x:-20,z:-8,s:2,r:1.4},{x:22,z:-11,s:1.8,r:2.4},{x:-27,z:-39,s:2.3,r:.2},{x:29,z:-42,s:2.1,r:1.7},{x:-6,z:-54,s:1.6,r:2},{x:7,z:-57,s:1.7,r:.6}]);
    place('rockC',[{x:-14,z:-27,s:1.8,r:1.2},{x:16,z:-30,s:2,r:2.4},{x:-29,z:-48,s:2.2,r:.7},{x:28,z:-51,s:2.1,r:1.6}]);
    place('cliffB',[{x:-46,z:-25,s:8.5,r:.4},{x:47,z:-29,s:9,r:Math.PI-.3}]);
    place('hill',[{x:-34,z:-76,s:12,r:.6},{x:35,z:-81,s:13,r:2.1}]);
    place('cliff',[{x:-43,z:-36,s:8},{x:44,z:-39,s:8.5,r:Math.PI},{x:-35,z:-66,s:7,r:.2},{x:36,z:-69,s:7.5,r:Math.PI-.2}]);
    return {loaded:Object.keys(loaded),count:Object.keys(loaded).length};
  };
})();