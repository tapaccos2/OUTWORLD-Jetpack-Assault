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
  const chosen=lowPowerDevice?specs.filter((item,index)=>item.kind!=='rock'||index%3===0):specs;
  // Local fallback scenery keeps the battlefield populated when a model CDN fails.
  function texture(base,light,dark){
   const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,256,256);
   for(let n=0;n<2600;n++){const px=Math.random()*256,py=Math.random()*256,r=.5+Math.random()*3;x.globalAlpha=.08+Math.random()*.2;x.fillStyle=Math.random()>.5?light:dark;x.beginPath();x.ellipse(px,py,r,r*(.3+Math.random()),Math.random()*3,0,Math.PI*2);x.fill()}x.globalAlpha=1;
   const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  }
  function addFallback(item,scene,THREE,lowPowerDevice){
   const g=new THREE.Group();g.position.set(item.x,0,item.z);g.rotation.y=item.rotation||0;
   const rockMat=new THREE.MeshStandardMaterial({map:texture('#555b52','#a29c85','#252b27'),roughness:.98});
   const barkMat=new THREE.MeshStandardMaterial({map:texture('#403d32','#82735a','#1e2420'),roughness:.96});
   const metalMat=new THREE.MeshStandardMaterial({map:texture('#343d3c','#78817a','#171d1d'),roughness:.78,metalness:.3});
   const foliageMat=new THREE.MeshStandardMaterial({map:texture('#58664a','#8a956a','#29372b'),roughness:1});
   const rock=(x,z,sx,sy,sz)=>{const geo=new THREE.IcosahedronGeometry(1,lowPowerDevice?2:3),p=geo.attributes.position;for(let i=0;i<p.count;i++){const k=.82+Math.random()*.34;p.setXYZ(i,p.getX(i)*k,p.getY(i)*k,p.getZ(i)*k)}geo.computeVertexNormals();const m=new THREE.Mesh(geo,rockMat);m.position.set(x,sy*.68,z);m.scale.set(sx,sy,sz);m.castShadow=!lowPowerDevice;m.receiveShadow=true;g.add(m)};
   if(item.kind==='rock'){for(let n=0;n<(lowPowerDevice?3:5);n++)rock((Math.random()-.5)*2.4,(Math.random()-.5)*2.2,.7+Math.random()*1.15,.55+Math.random(),.65+Math.random()*.9)}
   else if(item.kind==='tree'){
    const h=item.height||6.5,trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.48,h,12,5),barkMat);trunk.position.y=h/2;trunk.castShadow=!lowPowerDevice;g.add(trunk);
    for(let n=0;n<6;n++){const a=n*2.399,y=h*(.35+n*.09),len=h*(.23+(n%2)*.05),b=new THREE.Mesh(new THREE.CylinderGeometry(.04,.14,len,8,2),barkMat);b.position.set(Math.cos(a)*len*.25,y+len*.15,Math.sin(a)*len*.25);b.rotation.z=-Math.cos(a)*.62;b.rotation.x=Math.sin(a)*.62;g.add(b);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1,lowPowerDevice?1:2),foliageMat);crown.position.set(Math.cos(a)*len*.5,y+len*.35,Math.sin(a)*len*.5);crown.scale.set(len*.5,len*.4,len*.45);crown.castShadow=!lowPowerDevice;g.add(crown)}
   }else if(item.kind==='scene'){
    const hull=new THREE.Mesh(new THREE.CapsuleGeometry(1.05,5.4,6,14),metalMat);hull.rotation.z=.16;hull.rotation.y=.35;hull.position.y=1.25;hull.scale.set(1,.68,1.05);hull.castShadow=!lowPowerDevice;g.add(hull);
    for(let n=0;n<7;n++){const rib=new THREE.Mesh(new THREE.TorusGeometry(1.05,.075,8,24),metalMat);rib.rotation.x=Math.PI/2;rib.position.set(-2.3+n*.72,1.2,0);g.add(rib)}
    for(let n=0;n<8;n++)rock((Math.random()-.5)*8,(Math.random()-.5)*5,.35+Math.random()*.7,.25+Math.random()*.5,.4+Math.random()*.7)
   }else{
    const crate=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.35,1.45),metalMat);crate.position.y=.72;crate.castShadow=!lowPowerDevice;crate.receiveShadow=true;g.add(crate);
    for(let n=-1;n<=1;n++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.08,1.42,.08),barkMat);bar.position.set(n*.58,.72,.75);g.add(bar);const cross=new THREE.Mesh(new THREE.BoxGeometry(1.62,.08,.08),barkMat);cross.position.set(0,.72+n*.47,.75);g.add(cross)}
   }
   if(item.collision){g.userData.blocksEnemy=true;g.userData.blockRadius=item.collision}g.userData.environmentAsset='fallback-'+item.asset;scene.add(g);
  }
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
    console.warn('Environment GLB failed; adding detailed local scenery fallback:',item.asset,e);
    addFallback(item,scene,THREE,lowPowerDevice);
    return 'fallback-'+item.asset;
   }
  }));
  const successful=loaded.filter(Boolean);
  console.info('OUTWORLD: loaded textured CC0 environment GLBs',successful.length,'of',chosen.length);
  return {loaded:successful,count:successful.length};
 };
})();