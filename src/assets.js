(function(){
  const SOURCE='https://raw.githubusercontent.com/Ariescar/gobkit-free-assets/main/nature/';
  window.loadEnvironmentAssets=async function(THREE,scene,lowPowerDevice){
    if(!window.GLTFLoader){console.warn('GLTFLoader unavailable; keeping procedural environment.');return {loaded:[],count:0};}
    const loader=new window.GLTFLoader();
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
    place('rockA',[{x:-21,z:-25,s:1.45,r:.4},{x:22,z:-28,s:1.35,r:1.1},{x:-27,z:-39,s:1.8,r:2.1},{x:28,z:-42,s:1.65,r:.7},{x:-11,z:-48,s:1.25,r:2.8},{x:13,z:-53,s:1.35,r:1.9},{x:-36,z:-32,s:1.7,r:.3},{x:35,z:-36,s:1.5,r:2.5}]);
    place('rockB',[{x:-24,z:-30,s:1.15,r:1.4},{x:25,z:-32,s:1.05,r:2.4},{x:-30,z:-46,s:1.35,r:.2},{x:31,z:-48,s:1.25,r:1.7},{x:-7,z:-59,s:1.0,r:2},{x:8,z:-61,s:1.0,r:.6}]);
    place('rockC',[{x:-17,z:-36,s:1.1,r:1.2},{x:18,z:-39,s:1.15,r:2.4},{x:-32,z:-54,s:1.3,r:.7},{x:31,z:-57,s:1.25,r:1.6}]);
    place('cliffB',[{x:-49,z:-36,s:5.2,r:.4},{x:50,z:-39,s:5.4,r:Math.PI-.3}]);
    place('hill',[{x:-37,z:-86,s:7.5,r:.6},{x:38,z:-90,s:8,r:2.1}]);
    place('cliff',[{x:-46,z:-47,s:5.2},{x:47,z:-50,s:5.4,r:Math.PI},{x:-38,z:-72,s:4.5,r:.2},{x:39,z:-75,s:4.7,r:Math.PI-.2}]);
    return {loaded:Object.keys(loaded),count:Object.keys(loaded).length};
  };
})();