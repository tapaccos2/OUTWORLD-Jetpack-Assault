(()=> {
const canvas=document.querySelector('#game'), message=document.querySelector('#message');
if(!window.THREE){message.innerHTML='3D ENGINE NOT LOADED<small>Connect to the internet and reload this HTML file.</small>';return}
// Performance tiers: favour stable frame rate on Raspberry Pi and other low-power devices.
const lowPowerDevice=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4||/raspberry|armv7|aarch64/i.test(navigator.userAgent);
const renderer=new THREE.WebGLRenderer({canvas,antialias:!lowPowerDevice,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPowerDevice?1:2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.setClearColor(0x91b3c2,1);renderer.info.autoReset=true;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x829a9c);scene.fog=new THREE.FogExp2(0x829a9c,0.0034);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,250);
scene.add(camera); // Required for camera-attached first-person weapon meshes to render.
const hemi=new THREE.HemisphereLight(0xdbe9ef,0x51473a,1.12);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffdfb4,3.25);sun.position.set(-25,45,18);sun.castShadow=!lowPowerDevice;sun.shadow.mapSize.set(lowPowerDevice?768:2048,lowPowerDevice?768:2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.bias=-0.00018;sun.shadow.normalBias=0.018;scene.add(sun);const fillLight=new THREE.DirectionalLight(0x8cb8d1,.48);fillLight.position.set(18,12,28);scene.add(fillLight);
const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(3.2,20,16),new THREE.MeshBasicMaterial({color:0xffd8a0}));sunDisc.position.set(-34,31,-105);scene.add(sunDisc);
const sunHalo=new THREE.Mesh(new THREE.SphereGeometry(5.4,20,16),new THREE.MeshBasicMaterial({color:0xffc875,transparent:true,opacity:.12,depthWrite:false}));sunHalo.position.copy(sunDisc.position);scene.add(sunHalo);
const mat=(color,roughness=.8,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=1024;
 const gc=groundCanvas.getContext('2d');gc.fillStyle='#77796a';gc.fillRect(0,0,1024,1024);
 // Multi-scale mineral stains, embedded grit, fractures and abrasion create more natural ground breakup.
 for(let i=0;i<230;i++){const x=Math.random()*1024,y=Math.random()*1024,r=18+Math.random()*125;const g=gc.createRadialGradient(x,y,1,x,y,r);const shade=Math.random()>.5?'66,66,56':'151,137,105';g.addColorStop(0,`rgba(${shade},${.035+Math.random()*.075})`);g.addColorStop(1,'rgba(90,83,67,0)');gc.fillStyle=g;gc.beginPath();gc.arc(x,y,r,0,Math.PI*2);gc.fill()}
 for(let i=0;i<(lowPowerDevice?9000:33000);i++){const v=54+Math.random()*125;gc.fillStyle=`rgba(${v|0},${(v*.98)|0},${(v*.85)|0},${.04+Math.random()*.23})`;const r=.25+Math.random()*3.2;gc.beginPath();gc.ellipse(Math.random()*1024,Math.random()*1024,r,r*(.2+Math.random()*.7),Math.random()*3,0,Math.PI*2);gc.fill()}
 for(let i=0;i<(lowPowerDevice?220:650);i++){let x=Math.random()*1024,y=Math.random()*1024;gc.strokeStyle=Math.random()>.5?'rgba(31,32,27,.38)':'rgba(197,174,130,.2)';gc.lineWidth=.45+Math.random()*1.8;gc.beginPath();gc.moveTo(x,y);let px=x,py=y;for(let k=0;k<4+Math.random()*10;k++){px+=(Math.random()-.5)*23;py+=(Math.random()-.5)*12;gc.lineTo(px,py)}gc.stroke()}
 for(let i=0;i<320;i++){const x=Math.random()*1024,y=Math.random()*1024,r=1+Math.random()*8;gc.fillStyle=Math.random()>.5?'rgba(22,26,24,.3)':'rgba(202,185,147,.24)';gc.beginPath();gc.ellipse(x,y,r,r*(.3+Math.random()*.55),Math.random()*3,0,Math.PI*2);gc.fill()}
 for(let i=0;i<110;i++){const x=Math.random()*1024,y=Math.random()*1024;gc.strokeStyle='rgba(38,36,29,.25)';gc.lineWidth=.8+Math.random()*2.3;gc.beginPath();gc.moveTo(x,y);gc.lineTo(x+18+Math.random()*65,y+(Math.random()-.5)*12);gc.stroke()}
 const groundTex=new THREE.CanvasTexture(groundCanvas);groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping;groundTex.repeat.set(15,15);groundTex.colorSpace=THREE.SRGBColorSpace;groundTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const groundBump=new THREE.CanvasTexture(groundCanvas);groundBump.wrapS=groundBump.wrapT=THREE.RepeatWrapping;groundBump.repeat.set(15,15);
 const groundMat=new THREE.MeshStandardMaterial({color:0x8d9380,map:groundTex,bumpMap:groundBump,bumpScale:.24,roughness:.98});
 // Use a real PBR rock-ground material (albedo, normal and roughness maps) instead of the
 // generated canvas pattern. Keep the existing maps as a fallback if a CDN request fails.
 const pbrLoader=new THREE.TextureLoader();
 const pbrRoot='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_rocks_02/aerial_rocks_02_';
 const setupGroundMap=(texture)=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(26,26);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;return texture;};
 pbrLoader.load(pbrRoot+'diff_1k.jpg',texture=>{texture.colorSpace=THREE.SRGBColorSpace;groundMat.map=setupGroundMap(texture);groundMat.color.setHex(0xc8b89f);groundMat.needsUpdate=true;},undefined,error=>console.warn('PBR ground albedo unavailable; retaining fallback texture',error));
 pbrLoader.load(pbrRoot+'nor_gl_1k.jpg',texture=>{groundMat.normalMap=setupGroundMap(texture);groundMat.normalScale.set(.65,.65);groundMat.needsUpdate=true;},undefined,error=>console.warn('PBR ground normal unavailable; retaining fallback normal',error));
 pbrLoader.load(pbrRoot+'rough_1k.jpg',texture=>{groundMat.roughnessMap=setupGroundMap(texture);groundMat.roughness=.96;groundMat.needsUpdate=true;},undefined,error=>console.warn('PBR ground roughness unavailable; using uniform roughness',error));
const rockMat=mat(0x424944,.96,.02), rockLite=mat(0x68695d,.94,.01), dark=mat(0x151a19,.86,.08), armor=mat(0x303a3a,.72,.16), armorLite=mat(0x606a65,.76,.12), cyan=mat(0x7dacae,.55,.12), enemyMat=mat(0x66543b,.78,.04), enemyLite=mat(0x88734d,.72,.06), visor=mat(0xc45d2b,.48,.08), black=mat(0x101413,.82,.08);

// High-frequency procedural surface maps: fine grain, mineral mottling, scratches and worn edges.
function makeSurfaceTexture(base,light,dark,kind='stone'){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
 x.fillStyle=base;x.fillRect(0,0,512,512);
 for(let i=0;i<(lowPowerDevice?6200:26000);i++){
  const v=Math.random(),a=.025+Math.random()*.22;
  x.fillStyle=v>.5?light:dark;x.globalAlpha=a;
  const w=kind==='armor'?1+Math.random()*10:.5+Math.random()*7;
  const h=kind==='armor'?.5+Math.random()*2: .5+Math.random()*4;
  x.fillRect(Math.random()*512,Math.random()*512,w,h);
 }
 x.globalAlpha=1;
 // Fine scratches and erosion streaks.
 for(let i=0;i<(lowPowerDevice?260:(kind==='armor'?420:330));i++){
  x.strokeStyle=Math.random()>.5?light:dark;x.globalAlpha=.12+Math.random()*.25;x.lineWidth=.35+Math.random()*1.2;
  const px=Math.random()*512,py=Math.random()*512;x.beginPath();x.moveTo(px,py);x.lineTo(px+(Math.random()-.5)*(kind==='armor'?32:20),py+(Math.random()-.5)*7);x.stroke();
 }
 // Fine pores / pits give the surface a non-plastic finish.
 for(let i=0;i<(lowPowerDevice?620:900);i++){
  x.globalAlpha=.08+Math.random()*.24;x.fillStyle=dark;x.beginPath();x.ellipse(Math.random()*512,Math.random()*512,.4+Math.random()*1.8,.4+Math.random()*1.2,Math.random()*3,0,Math.PI*2);x.fill();
 }
 x.globalAlpha=1;
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
const rockTexture=makeSurfaceTexture('#555b55','#aaa894','#202824','stone');
const armorTexture=makeSurfaceTexture('#34494d','#9aa5a0','#10171b','armor');
const armorLiteTexture=makeSurfaceTexture('#71817a','#c1bfa5','#34413f','armor');
const insectTexture=makeSurfaceTexture('#3e5034','#a0a56c','#161e16','shell');
const insectBellyTexture=makeSurfaceTexture('#292f26','#666b49','#101710','stone');
const groundDetailTexture=makeSurfaceTexture('#77725e','#a39b7d','#3e4439','stone');
 // Convert procedural surface height variation into tangent-space normal maps.
 // This adds directional micro-relief under lighting instead of merely darkening a colour texture.
 function makeNormalMap(texture,strength){
  const src=texture.image,canvas=document.createElement('canvas');canvas.width=src.width;canvas.height=src.height;
  const cx=canvas.getContext('2d',{willReadFrequently:true});cx.drawImage(src,0,0);const im=cx.getImageData(0,0,canvas.width,canvas.height),data=im.data,w=canvas.width,h=canvas.height;
  const lum=new Float32Array(w*h);for(let i=0,p=0;i<data.length;i+=4,p++)lum[p]=(data[i]*.299+data[i+1]*.587+data[i+2]*.114)/255;
  const out=cx.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=lum[y*w+((x+w-1)%w)],r=lum[y*w+((x+1)%w)],u=lum[((y+h-1)%h)*w+x],d=lum[((y+1)%h)*w+x];let nx=(l-r)*strength,ny=(u-d)*strength,nz=1;const n=Math.hypot(nx,ny,nz)||1;const p=(y*w+x)*4;out.data[p]=Math.round((nx/n*.5+.5)*255);out.data[p+1]=Math.round((ny/n*.5+.5)*255);out.data[p+2]=Math.round((nz/n*.5+.5)*255);out.data[p+3]=255}
  cx.putImageData(out,0,0);const normal=new THREE.CanvasTexture(canvas);normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.colorSpace=THREE.NoColorSpace;normal.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return normal;
 }
 const groundNormal=makeNormalMap(groundDetailTexture,3.4);

const rockNormal=makeNormalMap(rockTexture,2.8);rockMat.map=rockTexture;rockMat.bumpMap=rockTexture;rockMat.normalMap=rockNormal;rockMat.normalScale.set(.8,.8);rockMat.bumpScale=.12;rockMat.roughness=.98;rockMat.needsUpdate=true;rockLite.map=rockTexture;rockLite.bumpMap=rockTexture;rockLite.bumpScale=.12;rockLite.roughness=.9;rockLite.needsUpdate=true;
const armorNormal=makeNormalMap(armorTexture,1.6);armor.map=armorTexture;armor.bumpMap=armorTexture;armor.normalMap=armorNormal;armor.normalScale.set(.35,.35);armor.bumpScale=.035;armor.roughness=.68;armor.needsUpdate=true;armorLite.map=armorLiteTexture;armorLite.bumpMap=armorLiteTexture;armorLite.bumpScale=.035;armorLite.roughness=.52;armorLite.needsUpdate=true;
const insectNormal=makeNormalMap(insectTexture,2.0);enemyMat.map=insectTexture;enemyMat.bumpMap=insectTexture;enemyMat.normalMap=insectNormal;enemyMat.normalScale.set(.45,.45);enemyMat.bumpScale=.04;enemyMat.roughness=.72;enemyMat.needsUpdate=true;enemyLite.map=insectTexture;enemyLite.bumpMap=insectTexture;enemyLite.bumpScale=.055;enemyLite.roughness=.48;enemyLite.needsUpdate=true;
groundTex.repeat.set(22,22);groundTex.needsUpdate=true;groundNormal.repeat.set(22,22);groundNormal.needsUpdate=true;groundMat.map=groundTex;groundMat.bumpMap=groundDetailTexture;groundMat.normalMap=groundNormal;groundMat.normalScale.set(.85,.85);groundMat.bumpScale=.17;groundMat.roughness=.96;groundMat.color.setHex(0xc0b69a);groundMat.needsUpdate=true;

// GRAPHICS UPGRADE — rolling, eroded terrain instead of a perfectly flat arena.
const terrainSegments=lowPowerDevice?72:192;
const terrainGeo=new THREE.PlaneGeometry(52,136,terrainSegments,terrainSegments);
const terrainPos=terrainGeo.attributes.position;
for(let i=0;i<terrainPos.count;i++){
 const lx=terrainPos.getX(i), lz=-terrainPos.getY(i);
 const edge=Math.min(1,Math.max(0,(Math.abs(lx)-4)/13));
 const distance=Math.max(0,(-lz-28)/30);
 const broad=Math.sin(lx*.073+lz*.031)*.95+Math.sin(lx*.14-lz*.087)*.48+Math.sin(lx*.035+lz*.12)*.78;
 const medium=Math.sin(lx*.31+lz*.26)*.13+Math.sin(lz*.43-lx*.37)*.09;
 const erosion=(Math.sin(lx*.91+lz*.73)*Math.sin(lz*.67-lx*.49))*.045;
 terrainPos.setZ(i,(broad*.72+medium+erosion)*edge*Math.min(1,distance));
}
terrainGeo.computeVertexNormals();
const ground=new THREE.Mesh(terrainGeo,groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
// Mission destination: illuminated landing beacon at the end of the ravine.
const landingZone=new THREE.Group();
const landingBase=new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.8,.22,32),new THREE.MeshStandardMaterial({color:0x303b3c,metalness:.68,roughness:.42}));
landingBase.position.set(0,.02,-56.5);landingBase.receiveShadow=true;landingBase.castShadow=true;landingZone.add(landingBase);
const landingRing=new THREE.Mesh(new THREE.TorusGeometry(1.72,.075,8,40),new THREE.MeshStandardMaterial({color:0x55e6e0,emissive:0x159b9a,emissiveIntensity:1.8,metalness:.35,roughness:.3}));
landingRing.rotation.x=Math.PI/2;landingRing.position.set(0,.18,-56.5);landingZone.add(landingRing);
const beaconMast=new THREE.Mesh(new THREE.CylinderGeometry(.09,.16,3.2,10),new THREE.MeshStandardMaterial({color:0x526a6b,metalness:.62,roughness:.35}));
beaconMast.position.set(0,1.75,-56.5);landingZone.add(beaconMast);
const beaconCore=new THREE.Mesh(new THREE.SphereGeometry(.32,16,12),new THREE.MeshBasicMaterial({color:0x7afff4}));
beaconCore.position.set(0,3.42,-56.5);landingZone.add(beaconCore);
const beaconLight=new THREE.PointLight(0x49f4e7,4,16,2);beaconLight.position.set(0,3.25,-56.5);landingZone.add(beaconLight);
scene.add(landingZone);
// Layered alien sky with generated cloud bands; no extra downloads required.
const skyCanvas=document.createElement('canvas');skyCanvas.width=1024;skyCanvas.height=512;
const skyCtx=skyCanvas.getContext('2d');
const skyGrad=skyCtx.createLinearGradient(0,0,0,512);skyGrad.addColorStop(0,'#172d3a');skyGrad.addColorStop(.24,'#3e606b');skyGrad.addColorStop(.52,'#829b9b');skyGrad.addColorStop(.76,'#c0b7a0');skyGrad.addColorStop(1,'#e0bd8b');skyCtx.fillStyle=skyGrad;skyCtx.fillRect(0,0,1024,512);
for(let i=0;i<(lowPowerDevice?70:170);i++){
 const x=Math.random()*1024,y=90+Math.random()*260,w=35+Math.random()*150,h=3+Math.random()*17;
 const cg=skyCtx.createRadialGradient(x,y,1,x,y,w);cg.addColorStop(0,`rgba(225,235,226,${.025+Math.random()*.055})`);cg.addColorStop(1,'rgba(225,235,226,0)');skyCtx.fillStyle=cg;skyCtx.save();skyCtx.translate(x,y);skyCtx.scale(1,h/Math.max(1,w));skyCtx.beginPath();skyCtx.arc(0,0,w,0,Math.PI*2);skyCtx.fill();skyCtx.restore();
}
const skyTex=new THREE.CanvasTexture(skyCanvas);skyTex.colorSpace=THREE.SRGBColorSpace;
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(190,40,24),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,depthWrite:false}));skyDome.renderOrder=-10;scene.add(skyDome);
// Environment scenery is loaded as textured GLB assets in src/assets.js.
// No generated ridge silhouettes, primitive rock clusters, barricades or fake outpost meshes here.
// SOLID WORLD COLLISION: swept horizontal movement with axis sliding.
function moveEntityWithCollision(entity,dx,dz,radius,checkActors=false){
 const canOccupy=(x,z)=>{
  if(x < -24+radius || x > 24-radius || z < -61+radius || z > 12-radius)return false;
  for(const ob of scene.children){
   if(!ob.userData||!ob.userData.blocksEnemy||ob===entity)continue;
   const sx=ob.scale?Math.max(Math.abs(ob.scale.x),Math.abs(ob.scale.z)):1;
   const rr=(ob.userData.blockRadius||1.5)*sx+radius,ox=x-ob.position.x,oz=z-ob.position.z;
   if(Math.abs(ox)<rr&&Math.abs(oz)<rr&&ox*ox+oz*oz<rr*rr)return false;
  }
  if(checkActors)for(const other of enemies){if(other===entity||!other.visible||other.userData.hp<=0)continue;const rr=radius+(other.userData.collisionRadius||.62),ox=x-other.position.x,oz=z-other.position.z;if(ox*ox+oz*oz<rr*rr)return false}
  return true;
 };
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18)),sx=dx/steps,sz=dz/steps;
 for(let i=0;i<steps;i++){let nx=entity.position.x+sx,nz=entity.position.z;if(canOccupy(nx,nz))entity.position.x=nx;nx=entity.position.x;nz=entity.position.z+sz;if(canOccupy(nx,nz))entity.position.z=nz}
}
// Hand-built prop geometry removed: real textured GLB scenery is loaded by loadEnvironmentAssets().
// Suspended dust motes catch the sun; points are subtle and do not obscure aiming.
const dustCount=lowPowerDevice?40:220,dustPositions=new Float32Array(dustCount*3);
for(let i=0;i<dustCount;i++){
 dustPositions[i*3]=(Math.random()-.5)*48;
 dustPositions[i*3+1]=.25+Math.random()*17;
 dustPositions[i*3+2]=8-Math.random()*66;
}
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
const dustMat=new THREE.PointsMaterial({color:0xf3d8a2,size:.075,transparent:true,opacity:.42,depthWrite:false,sizeAttenuation:true});
const dustField=new THREE.Points(dustGeo,dustMat);scene.add(dustField);

// Ravine walls, alien scrub, spore vents and nest primitives removed.
 // These environmental silhouettes are being replaced by textured, imported GLB models.
// Landscape-only play: request a real orientation lock where the browser permits it.
function requestLandscapeLock(){
  try{
    if(screen.orientation && typeof screen.orientation.lock==="function"){
      screen.orientation.lock("landscape").catch(()=>{});
    }
  }catch(_){}
}
window.addEventListener("pointerdown",requestLandscapeLock,{once:true,passive:true});
window.addEventListener("keydown",requestLandscapeLock,{once:true});
function updateViewportSize(){
  // The browser's layout viewport is the authoritative canvas size. Do not mix
  // visualViewport dimensions with innerWidth/innerHeight: Android can report
  // different values while rotating, leaving a half-width WebGL canvas.
  const w=Math.max(1,Math.round(window.innerWidth));
  const h=Math.max(1,Math.round(window.innerHeight));
  document.documentElement.style.setProperty("--vh",h+"px");
  document.documentElement.style.setProperty("--vw",w+"px");
  const canvasEl=document.querySelector("#game");
  if(canvasEl){canvasEl.style.width=w+"px";canvasEl.style.height=h+"px";}
  if(typeof renderer!=="undefined" && typeof camera!=="undefined"){
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener("resize",updateViewportSize,{passive:true});
window.addEventListener("orientationchange",()=>{setTimeout(updateViewportSize,120);setTimeout(updateViewportSize,350)}, {passive:true});window.addEventListener("pageshow",()=>setTimeout(updateViewportSize,80),{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener("resize",updateViewportSize,{passive:true}); updateViewportSize();
function soldier(isEnemy=false){
 if(isEnemy){
   // Hydran redesign: smoother plated insect anatomy with a low, predatory silhouette.
   const bug=new THREE.Group();
   const carapace=new THREE.MeshStandardMaterial({color:0xffffff,map:insectTexture,roughness:.78,metalness:.04});
   const armorEdge=new THREE.MeshStandardMaterial({color:0xffffff,map:armorLiteTexture,roughness:.72,metalness:.05});
   const darkJoint=new THREE.MeshStandardMaterial({color:0x202a24,roughness:.46,metalness:.2});
   const bellyMat=new THREE.MeshStandardMaterial({color:0xffffff,map:insectBellyTexture,roughness:.82});
   const glowEye=new THREE.MeshStandardMaterial({color:0xff6a26,emissive:0xff3908,emissiveIntensity:2.8,roughness:.18});
   const veinMat=new THREE.MeshStandardMaterial({color:0xc6d779,emissive:0x273b08,emissiveIntensity:.55,roughness:.4});
   function part(geo,mat,pos,scale,rot){
     const m=new THREE.Mesh(geo,mat);m.position.set(...pos);
     if(scale)m.scale.set(...scale);if(rot)m.rotation.set(...rot);
     m.castShadow=true;m.receiveShadow=true;bug.add(m);return m;
   }
   // Hydran arachnid-warrior silhouette: lean, armoured, predatory, with long splayed legs.
   // The design uses original procedural geometry rather than copied film assets.
   const shellRidge=new THREE.MeshStandardMaterial({color:0xffffff,map:armorLiteTexture,roughness:.34,metalness:.18});
   const underPlate=new THREE.MeshStandardMaterial({color:0x303b2b,map:insectBellyTexture,roughness:.76});
   const fangMat=new THREE.MeshStandardMaterial({color:0x222820,roughness:.28,metalness:.12});
   const eyeMat=new THREE.MeshStandardMaterial({color:0xff8a32,emissive:0x7e2105,emissiveIntensity:1.5,roughness:.2});
   // Narrow, elongated rear abdomen with overlapping armoured tergites.
   part(new THREE.CapsuleGeometry(.42,.95,8,18),carapace,[0,1.12,-.52],[1.0,.9,1.22],[Math.PI/2,0,0]);
   part(new THREE.CapsuleGeometry(.30,.82,6,14),underPlate,[0,.83,-.45],[1,.72,1.05],[Math.PI/2,0,0]);
   for(let i=0;i<4;i++){
     const z=-1.28+i*.39;
     const seg=part(new THREE.SphereGeometry(.43,22,14),i%2?shellRidge:carapace,[0,1.15,z],[.87,.66,.34],[.04,0,0]);
     // Small swept shell spikes break up the smooth silhouette.
     for(const side of [-1,1]){
       part(new THREE.ConeGeometry(.095,.30,9),shellRidge,[side*.34,1.46,z-.04],[.72,1,1],[0,0,side*.72]);
     }
   }
   // Distinct thorax and narrow forward head shield.
   part(new THREE.SphereGeometry(.47,26,18),shellRidge,[0,1.28,.28],[.91,.72,.94]);
   part(new THREE.ConeGeometry(.43,.78,7,2),carapace,[0,1.34,.88],[1,.78,1],[Math.PI/2,0,0]);
   part(new THREE.SphereGeometry(.26,20,14),underPlate,[0,1.14,1.12],[1,.65,.72]);
   // Multiple small compound eyes in recessed sockets, not oversized glowing bulbs.
   for(const side of [-1,1]){
     part(new THREE.SphereGeometry(.105,16,12),fangMat,[side*.29,1.48,.99],[1,.95,.68]);
     part(new THREE.SphereGeometry(.066,16,12),eyeMat,[side*.30,1.49,1.045],[1,.95,.65]);
     for(let i=0;i<2;i++){
       part(new THREE.SphereGeometry(.035,10,8),eyeMat,[side*(.18+i*.22),1.57,.91-i*.08],[1,1,.7]);
     }
     // Paired hooked mandibles with dark, pointed tips.
     part(new THREE.CapsuleGeometry(.065,.29,4,10),shellRidge,[side*.16,.98,1.18],[.8,.8,1],[.34,0,side*.45]);
     part(new THREE.ConeGeometry(.075,.32,10),fangMat,[side*.19,.78,1.35],[1,1,1],[.18,0,Math.PI+side*.24]);
     // Short sensory feelers swept back over the head.
     part(new THREE.CylinderGeometry(.012,.035,.32,7),shellRidge,[side*.13,1.72,.82],[1,1,1],[-.6,0,side*.32]);
   }
   // Serrated dorsal plates follow the spine, giving the insect a hard, dangerous profile.
   for(let i=0;i<5;i++){
     const z=.35-i*.40;
     part(new THREE.ConeGeometry(.20,.48,7),shellRidge,[0,1.73,z],[.82,1,.72],[Math.PI*.82,0,0]);
   }
   // Six long, thin, two-jointed legs splay sideways and forward/backward.
   const limbs=[];
   for(const side of [-1,1]){
     for(let pair=0;pair<3;pair++){
       const z=.60-pair*.68;
       const hipX=side*.35;
       const hip=new THREE.Group();hip.position.set(hipX,1.00,z);bug.add(hip);
       part(new THREE.SphereGeometry(.105,12,9),fangMat,[hipX,1.00,z],[1,1,1]);
       const upper=new THREE.Group();hip.add(upper);
       const forwardBias=pair===0?.23:pair===2?-.24:0;
       const upperLength=.69, lowerLength=.78;
       const upperMesh=new THREE.Mesh(new THREE.CapsuleGeometry(.055,upperLength-.12,4,9),carapace);
       upperMesh.position.set(side*.31,-.20,forwardBias*.25);
       upperMesh.rotation.z=-side*.78;upperMesh.rotation.x=pair===0?-.22:pair===2?.20:0;
       upperMesh.castShadow=true;upperMesh.receiveShadow=true;upper.add(upperMesh);
       const knee=new THREE.Group();knee.position.set(side*.53,-.39,forwardBias);upper.add(knee);
       const kneeMesh=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),shellRidge);kneeMesh.castShadow=true;knee.add(kneeMesh);
       const lower=new THREE.Group();knee.add(lower);
       const lowerMesh=new THREE.Mesh(new THREE.CapsuleGeometry(.035,lowerLength-.1,4,8),fangMat);
       lowerMesh.position.set(side*.25,-.35,forwardBias*.2);lowerMesh.rotation.z=side*.40;
       lowerMesh.castShadow=true;lowerMesh.receiveShadow=true;lower.add(lowerMesh);
       const foot=new THREE.Mesh(new THREE.ConeGeometry(.045,.25,8),shellRidge);
       foot.position.set(side*.40,-.70,forwardBias*.25);foot.rotation.z=Math.PI;foot.castShadow=true;lower.add(foot);
       limbs.push({upper,lower,side,pair});
     }
   }
   // Small amber sensory glands along the back; restrained glow, mostly natural chitin.
   for(let i=0;i<3;i++){
     part(new THREE.SphereGeometry(.055,12,9),eyeMat,[0,1.47,-.12-i*.40],[.8,.7,1]);
   }
   bug.userData.limbs=limbs;bug.userData.insect=true;
   bug.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
   return bug;
 }

 const root=new THREE.Group(), body=new THREE.Mesh(new THREE.CapsuleGeometry(.30, .55, 4, 10),isEnemy?enemyMat:armor);body.scale.set(1.16,1.05,.72);body.position.y=1.42;body.castShadow=true;root.add(body);
 const chest=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),isEnemy?enemyLite:armorLite);chest.scale.set(.34,.28,.105);chest.position.set(0,1.52,.245);root.add(chest);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.225,16,12),isEnemy?enemyMat:armorLite);head.position.y=2.18;head.castShadow=true;root.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),isEnemy?enemyLite:armor);helmet.scale.set(.265,.165,.245);helmet.position.set(0,2.34,0);helmet.castShadow=true;root.add(helmet);
 const face=new THREE.Mesh(new THREE.BoxGeometry(.37,.115,.09),isEnemy?visor:cyan);face.position.set(0,2.2,.235);root.add(face);
 const brow=new THREE.Mesh(new THREE.BoxGeometry(.34,.045,.075),dark);brow.position.set(0,2.27,.225);root.add(brow);
 // Compact radio/comms modules on both sides of the helmet.
 for(const side of [-1,1]){const comm=new THREE.Mesh(new THREE.BoxGeometry(.09,.14,.14),dark);comm.position.set(side*.28,2.18,0);root.add(comm);const lamp=new THREE.Mesh(new THREE.SphereGeometry(.035,7,6),isEnemy?visor:cyan);lamp.position.set(side*.31,2.2,.045);root.add(lamp)}
 const pack=new THREE.Mesh(new THREE.BoxGeometry(.42,.58,.24),dark);pack.position.set(0,1.54,-.29);pack.castShadow=true;root.add(pack);
 const packPanel=new THREE.Mesh(new THREE.BoxGeometry(.32,.36,.035),isEnemy?enemyMat:armorLite);packPanel.position.set(0,1.58,-.415);root.add(packPanel);
 // Raised shoulder armour, chest utility panels and knee guards
for(const side of [-1,1]){const shoulder=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),isEnemy?enemyLite:armorLite);shoulder.scale.set(.19,.14,.16);shoulder.position.set(side*.49,1.82,.02);shoulder.rotation.z=side*.12;root.add(shoulder);
const knee=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),isEnemy?enemyLite:armorLite);knee.scale.set(.14,.12,.065);knee.position.set(side*.22,.58,.17);root.add(knee)}
const chestPanel=new THREE.Mesh(new THREE.BoxGeometry(.18,.26,.055),isEnemy?visor:cyan);chestPanel.position.set(-.16,1.52,.31);root.add(chestPanel);
 // Layered abdominal plates and belt give the torso a more recognisable sci-fi marine silhouette.
 for(let row=0;row<2;row++){const plate=new THREE.Mesh(new THREE.BoxGeometry(.42,.13,.075),isEnemy?enemyLite:armorLite);plate.position.set(0,1.16-row*.14,.245);root.add(plate)}
 const belt=new THREE.Mesh(new THREE.BoxGeometry(.7,.12,.46),dark);belt.position.set(0,.98,0);root.add(belt);
 const legs=[],arms=[];for(let side of [-1,1]){
 const legPivot=new THREE.Group();legPivot.position.set(side*.22,.86,.025);root.add(legPivot);legs.push(legPivot);
 const hip=new THREE.Mesh(new THREE.BoxGeometry(.32,.24,.34),isEnemy?enemyLite:armorLite);hip.position.set(0,0,0);hip.rotation.z=side*.08;legPivot.add(hip);
 const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.115,.34,5,12),isEnemy?dark:armor);thigh.position.set(0,-.22,0);thigh.castShadow=true;thigh.receiveShadow=true;legPivot.add(thigh);
 const thighPlate=new THREE.Mesh(new THREE.BoxGeometry(.23,.27,.07),isEnemy?enemyLite:armorLite);thighPlate.position.set(0,-.13,.16);legPivot.add(thighPlate);
 const knee=new THREE.Group();knee.position.set(0,-.39,.025);legPivot.add(knee);
 const kneeCore=new THREE.Mesh(new THREE.SphereGeometry(.075,14,10),armorLite);kneeCore.position.set(0,0,.04);knee.add(kneeCore);
 const shin=new THREE.Mesh(new THREE.BoxGeometry(.22,.29,.08),isEnemy?enemyLite:armorLite);shin.position.set(0,-.16,.10);knee.add(shin);
 const boot=new THREE.Mesh(new THREE.BoxGeometry(.3,.16,.42),black);boot.position.set(0,-.34,.09);knee.add(boot);
 // Shoulder pivot: the upper arm, forearm armour and hand rotate as one articulated limb.
 const armPivot=new THREE.Group();armPivot.position.set(side*.47,1.81,.035);armPivot.rotation.z=-side*.10;root.add(armPivot);arms.push(armPivot);
 const shoulder=new THREE.Mesh(new THREE.SphereGeometry(1,18,14),isEnemy?enemyLite:armorLite);shoulder.scale.set(.19,.18,.18);shoulder.position.set(0,-.015,0);shoulder.castShadow=true;armPivot.add(shoulder);
 const upperArm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.31,5,12),isEnemy?enemyMat:armorLite);upperArm.position.set(side*.015,-.235,.015);upperArm.castShadow=true;upperArm.receiveShadow=true;armPivot.add(upperArm);
 const elbow=new THREE.Group();elbow.position.set(side*.025,-.43,.055);armPivot.add(elbow);
 const elbowJoint=new THREE.Mesh(new THREE.SphereGeometry(.075,12,10),dark);elbowJoint.castShadow=true;elbow.add(elbowJoint);
 const forearm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.26,5,12),isEnemy?enemyLite:armor);forearm.position.set(side*.025,-.15,.055);forearm.rotation.z=-side*.08;forearm.castShadow=true;elbow.add(forearm);
 const forearmPlate=new THREE.Mesh(new THREE.BoxGeometry(.19,.22,.055),isEnemy?enemyLite:armorLite);forearmPlate.position.set(side*.025,-.15,.145);elbow.add(forearmPlate);
 const hand=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.15),black);hand.position.set(side*.02,-.32,.09);hand.castShadow=true;elbow.add(hand);
 armPivot.userData.elbow=elbow;
 }
 for(const side of [-1,1]){const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.075,.11,.22,8),dark);nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*.13,1.16,-.46);root.add(nozzle);const status=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),isEnemy?visor:cyan);status.position.set(side*.15,1.76,-.435);root.add(status)}
// Milestone 8: layered powered-marine armour, hard-surface panels and jetpack hardware.
 const armourEdge=new THREE.MeshStandardMaterial({color:isEnemy?0x321d20:0x16363a,metalness:.68,roughness:.34});
 const accentMat=new THREE.MeshStandardMaterial({color:isEnemy?0xff704e:0x55efff,emissive:isEnemy?0x6d1309:0x087e91,emissiveIntensity:.75,metalness:.35,roughness:.28});
 // Angular chest cuirass over the rounded undersuit, with raised upper plates.
 const cuirass=new THREE.Mesh(new THREE.BoxGeometry(.49,.39,.105),isEnemy?enemyLite:armorLite);
 cuirass.position.set(0,1.56,.265);cuirass.rotation.x=-.06;root.add(cuirass);
 const breastCore=new THREE.Mesh(new THREE.BoxGeometry(.22,.17,.035),armourEdge);
 breastCore.position.set(0,1.59,.326);root.add(breastCore);
 for(const side of [-1,1]){
   const pectoral=new THREE.Mesh(new THREE.BoxGeometry(.16,.22,.045),isEnemy?enemyMat:armor);
   pectoral.position.set(side*.16,1.62,.32);pectoral.rotation.z=side*-.12;root.add(pectoral);
   const bolt=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),accentMat);
   bolt.position.set(side*.205,1.71,.35);root.add(bolt);
   // Rounded elbow joints and hard-surface forearm guards.
   const elbow=new THREE.Mesh(new THREE.SphereGeometry(.105,10,8),armourEdge);
   elbow.position.set(side*.53,1.31,.06);root.add(elbow);
   const vambrace=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.20,3,8),isEnemy?enemyLite:armorLite);
   vambrace.scale.set(1,.82,.8);vambrace.position.set(side*.55,1.18,.13);vambrace.rotation.z=side*.10;root.add(vambrace);
   // Thigh armour and inset knee hardware.
   // Thigh and knee armour are parented to the articulated leg pivots below.
   // Twin jetpack exhausts and glowing turbine cores.
   const thruster=new THREE.Mesh(new THREE.CylinderGeometry(.105,.13,.30,12),armourEdge);
   thruster.rotation.x=Math.PI/2;thruster.position.set(side*.145,1.34,-.43);root.add(thruster);
   const nozzleRing=new THREE.Mesh(new THREE.TorusGeometry(.092,.018,6,12),isEnemy?enemyLite:armorLite);
   nozzleRing.position.set(side*.145,1.34,-.59);root.add(nozzleRing);
   const turbine=new THREE.Mesh(new THREE.CircleGeometry(.067,12),accentMat);
   turbine.position.set(side*.145,1.34,-.61);root.add(turbine);
   // Utility pouches with contrasting fastening strips.
   const thighPouch=new THREE.Mesh(new THREE.BoxGeometry(.13,.15,.10),dark);
   thighPouch.position.set(side*.34,.91,.16);root.add(thighPouch);
   const pouchMark=new THREE.Mesh(new THREE.BoxGeometry(.07,.025,.018),accentMat);
   pouchMark.position.set(side*.34,.93,.22);root.add(pouchMark);
 }
 // Helmet faceplate: a dark visor, reinforced brow and side-mounted sensor housings.
 const faceplate=new THREE.Mesh(new THREE.BoxGeometry(.31,.105,.045),armourEdge);
 faceplate.position.set(0,2.205,.245);root.add(faceplate);
 const visorGlass=new THREE.Mesh(new THREE.BoxGeometry(.255,.045,.018),accentMat);
 visorGlass.position.set(0,2.205,.272);root.add(visorGlass);
 const helmetCrest=new THREE.Mesh(new THREE.BoxGeometry(.10,.045,.18),armourEdge);
 helmetCrest.position.set(0,2.475,-.015);root.add(helmetCrest);
 // Backpack side canisters, fuel indicators and upper protective plate.
 for(const side of [-1,1]){
   const canister=new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.46,10),armourEdge);
   canister.position.set(side*.245,1.52,-.30);root.add(canister);
   const canisterBand=new THREE.Mesh(new THREE.TorusGeometry(.075,.012,5,10),accentMat);
   canisterBand.rotation.x=Math.PI/2;canisterBand.position.set(side*.245,1.55,-.30);root.add(canisterBand);
 }
 const packTop=new THREE.Mesh(new THREE.BoxGeometry(.30,.10,.08),isEnemy?enemyLite:armorLite);
 packTop.position.set(0,1.88,-.31);root.add(packTop);
 const rifle=new THREE.Group();rifle.position.set(.39,1.30,.36);rifle.scale.setScalar(.76);root.add(rifle);
 const rifleReceiver=new THREE.Mesh(new THREE.BoxGeometry(.17,.19,.62),black);rifleReceiver.position.set(0,0,.16);rifleReceiver.castShadow=true;rifle.add(rifleReceiver);
 const rifleReceiverShell=new THREE.Mesh(new THREE.BoxGeometry(.178,.105,.37),armor);rifleReceiverShell.position.set(0,.055,.13);rifle.add(rifleReceiverShell);
 const rifleBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.043,.052,.50,12),dark);rifleBarrel.rotation.x=Math.PI/2;rifleBarrel.position.set(0,.005,.66);rifle.add(rifleBarrel);
 const rifleBarrelSleeve=new THREE.Mesh(new THREE.CylinderGeometry(.063,.063,.20,12),armorLite);rifleBarrelSleeve.rotation.x=Math.PI/2;rifleBarrelSleeve.position.set(0,.005,.48);rifle.add(rifleBarrelSleeve);
 const rifleMuzzle=new THREE.Mesh(new THREE.CylinderGeometry(.072,.072,.095,14),dark);rifleMuzzle.rotation.x=Math.PI/2;rifleMuzzle.position.set(0,.005,.91);rifle.add(rifleMuzzle);
 const rifleMuzzleRing=new THREE.Mesh(new THREE.TorusGeometry(.055,.012,6,16),cyan);rifleMuzzleRing.position.set(0,.005,.963);rifle.add(rifleMuzzleRing);
 const rifleRail=new THREE.Mesh(new THREE.BoxGeometry(.07,.035,.49),dark);rifleRail.position.set(0,.119,.22);rifle.add(rifleRail);
 for(let n=0;n<5;n++){const notch=new THREE.Mesh(new THREE.BoxGeometry(.078,.018,.035),armorLite);notch.position.set(0,.143,.03+n*.09);rifle.add(notch)}
 const rifleStock=new THREE.Mesh(new THREE.BoxGeometry(.13,.14,.24),dark);rifleStock.position.set(0,-.015,-.25);rifle.add(rifleStock);
 const rifleGrip=new THREE.Mesh(new THREE.BoxGeometry(.095,.22,.13),black);rifleGrip.position.set(0,-.17,.10);rifleGrip.rotation.x=-.16;rifle.add(rifleGrip);
 const rifleMagazine=new THREE.Mesh(new THREE.BoxGeometry(.115,.25,.15),armor);rifleMagazine.position.set(0,-.18,.28);rifleMagazine.rotation.x=-.12;rifle.add(rifleMagazine);
 const riflePowerCell=new THREE.Mesh(new THREE.BoxGeometry(.035,.12,.20),cyan);riflePowerCell.position.set(.095,.01,.20);rifle.add(riflePowerCell);

 // Character silhouette pass: collar, segmented shoulder trim, chest harness and side pouches.
 const collar=new THREE.Mesh(new THREE.CylinderGeometry(.19,.24,.12,8),dark);collar.position.set(0,1.99,.015);root.add(collar);
 for(const side of [-1,1]){
  const shoulderTrim=new THREE.Mesh(new THREE.BoxGeometry(.27,.055,.36),isEnemy?visor:cyan);shoulderTrim.position.set(side*.49,1.91,.045);shoulderTrim.rotation.z=side*.12;root.add(shoulderTrim);
  const pouch=new THREE.Mesh(new THREE.BoxGeometry(.16,.22,.16),dark);pouch.position.set(side*.36,1.03,.22);root.add(pouch);
  const pouchLatch=new THREE.Mesh(new THREE.BoxGeometry(.08,.035,.025),isEnemy?enemyLite:armorLite);pouchLatch.position.set(side*.36,1.07,.31);root.add(pouchLatch);
 }
 const harness=new THREE.Mesh(new THREE.BoxGeometry(.075,.56,.055),dark);harness.position.set(.19,1.48,.32);harness.rotation.z=-.18;root.add(harness);
 const harnessClip=new THREE.Mesh(new THREE.BoxGeometry(.12,.09,.045),isEnemy?enemyLite:cyan);harnessClip.position.set(.14,1.31,.36);root.add(harnessClip);
 // Helmet brow optics and a small forehead sensor.
 const sensor=new THREE.Mesh(new THREE.BoxGeometry(.09,.055,.035),isEnemy?visor:cyan);sensor.position.set(0,2.39,.22);root.add(sensor);
 const visorLine=new THREE.Mesh(new THREE.BoxGeometry(.24,.018,.018),dark);visorLine.position.set(0,2.2,.306);root.add(visorLine);
 // Rifle detail pass: top rail, rear stock, angled grip, magazine and side power cell.
 const rail=new THREE.Mesh(new THREE.BoxGeometry(.055,.035,.58),dark);rail.position.set(.42,1.455,.42);root.add(rail);
 for(let n=0;n<5;n++){const notch=new THREE.Mesh(new THREE.BoxGeometry(.065,.025,.045),isEnemy?enemyLite:armorLite);notch.position.set(.42,1.478,.19+n*.105);root.add(notch)}
 const stock=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.28),dark);stock.position.set(.42,1.32,.015);root.add(stock);
 const grip=new THREE.Mesh(new THREE.BoxGeometry(.105,.24,.14),black);grip.position.set(.42,1.15,.37);grip.rotation.x=-.16;root.add(grip);
 const magazine=new THREE.Mesh(new THREE.BoxGeometry(.12,.28,.19),isEnemy?enemyMat:armor);magazine.position.set(.42,1.19,.55);magazine.rotation.x=-.12;root.add(magazine);
 const powerCell=new THREE.Mesh(new THREE.BoxGeometry(.07,.12,.2),isEnemy?visor:cyan);powerCell.position.set(.51,1.34,.68);root.add(powerCell);
 const muzzleRing=new THREE.Mesh(new THREE.TorusGeometry(.073,.018,6,12),isEnemy?enemyLite:armorLite);muzzleRing.position.set(.42,1.32,1.045);root.add(muzzleRing);

 const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0xffc66a}));muzzle.position.set(.42,1.32,.96);muzzle.visible=false;root.add(muzzle);
const muzzleCore=new THREE.Mesh(new THREE.SphereGeometry(.06,8,8),new THREE.MeshBasicMaterial({color:0xffffff}));muzzleCore.position.copy(muzzle.position);muzzleCore.visible=false;root.add(muzzleCore);
 root.userData={legs,arms,muzzle,muzzleCore,isEnemy,chest,head,helmet,face,pack};return root
}

// First-person weapon: use the imported GLB asset only. No procedural gun geometry.
const weaponRig=new THREE.Group();camera.add(weaponRig);
weaponRig.position.set(.24,-.24,-.90);weaponRig.scale.set(.56,.56,.56);
const fpFlash=new THREE.Group();
const fpFlashOuter=new THREE.Mesh(new THREE.ConeGeometry(.038,.18,6),new THREE.MeshBasicMaterial({color:0xff9c2e,transparent:true,opacity:.95,depthWrite:false,depthTest:false,toneMapped:false}));
fpFlashOuter.rotation.x=-Math.PI/2;fpFlashOuter.scale.set(1.8,1.8,1.8);fpFlashOuter.position.set(0,0,0);fpFlash.add(fpFlashOuter);
const fpFlashCore=new THREE.Mesh(new THREE.SphereGeometry(.025,6,4),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,depthWrite:false,depthTest:false,toneMapped:false}));
fpFlashCore.position.set(0,0,0);fpFlash.add(fpFlashCore);fpFlash.visible=false;weaponRig.add(fpFlash);
const worldMuzzleFlash=new THREE.Group();
const worldFlashCone=new THREE.Mesh(new THREE.ConeGeometry(.075,.34,7),new THREE.MeshBasicMaterial({color:0xff9c2e,transparent:true,opacity:.98,depthWrite:false,depthTest:false,toneMapped:false}));
worldFlashCone.rotation.x=-Math.PI/2;worldFlashCone.position.z=-.13;worldMuzzleFlash.add(worldFlashCone);
const worldFlashCore=new THREE.Mesh(new THREE.SphereGeometry(.052,7,5),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,depthWrite:false,depthTest:false,toneMapped:false}));
worldMuzzleFlash.add(worldFlashCore);worldMuzzleFlash.visible=false;worldMuzzleFlash.renderOrder=1002;scene.add(worldMuzzleFlash);
const armRig=new THREE.Group();camera.add(armRig);
// The dedicated imported first-person GLB below is the only visible weapon asset.

const player=soldier(false);
// Compatibility handle for the third-person toggle only; contains no procedural weapon geometry.
const marineRifle=new THREE.Group();marineRifle.visible=false;player.add(marineRifle);
// Never display the blockout soldier, even while network assets are loading.
player.children.forEach(o=>{o.visible=false});
// Imported character and first-person weapon assets only. No procedural soldier or viewmodel geometry.
armRig.visible=false;
const fpAssetRig=new THREE.Group();camera.add(fpAssetRig);
fpAssetRig.position.set(.20,-.24,-.48);
fpAssetRig.scale.setScalar(1);
const assetLoader=window.GLTFLoader?new window.GLTFLoader():null;
if(assetLoader&&window.MeshoptDecoder)assetLoader.setMeshoptDecoder(window.MeshoptDecoder);
const externalMixers=[];
const soldierAssetURL='https://raw.githubusercontent.com/cktang88/3d-fps/main/public/assets/models/characters/soldier_tac.glb';
const firstPersonAssetURL='https://raw.githubusercontent.com/cktang88/3d-fps/main/public/assets/models/fp/m4a1.glb';
const thirdPersonWeaponURL='https://raw.githubusercontent.com/cktang88/3d-fps/main/public/assets/models/weapons/m4a1.glb';
let importedSoldier=null,importedFP=null;
function normalizeGLB(model,targetHeight){
 model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const height=size.y||Math.max(size.x,size.z)||1;
 model.scale.multiplyScalar(targetHeight/height);
 model.updateMatrixWorld(true);
 const scaledBox=new THREE.Box3().setFromObject(model),scaledCenter=scaledBox.getCenter(new THREE.Vector3());
 model.position.x-=scaledCenter.x;model.position.z-=scaledCenter.z;model.position.y-=scaledBox.min.y;
 model.updateMatrixWorld(true);
}
if(assetLoader){
 assetLoader.load(soldierAssetURL,gltf=>{
  importedSoldier=gltf.scene;
  normalizeGLB(importedSoldier,2.35);
  importedSoldier.rotation.y=0; // inherit player yaw; the parent already applies the forward-facing correction
  const soldierBones={head:null,neck:null,spine:null,leftArm:null,rightArm:null,leftForearm:null,rightForearm:null,leftHand:null,rightHand:null,leftLeg:null,rightLeg:null,leftShin:null,rightShin:null};
  const boneRest=new Map(),allBones=[];
    const headsetName=/headphones?|head.?set|earpiece|earphones?|earmuffs?|ear.?cups?|head.?mounted.?display|comms?|microphones?|\\bmic\\b|audio.?device|helmet.?speaker|peltor|ear.?protection/i;
  importedSoldier.traverse(o=>{
   // Some GLBs name the accessory parent, not its renderable mesh; hide matching nodes at any level.
   if(o!==importedSoldier&&/(headphones?|head.?set|earpiece|earphones?|earmuffs?|ear.?cups?|head.?mounted.?display|comms?|microphones?|\\bmic\\b|audio.?device|helmet.?speaker|peltor|ear.?protection|headgear)/i.test(o.name||'')){
    o.visible=false;
    console.info('OUTWORLD: removed named headset/accessory node',o.name);
   }
   if(o.isMesh){
    o.castShadow=true;o.receiveShadow=true;
    // Remove separately-meshed ear cups even when the source GLB uses generic mesh names.
     // The head itself is centered on X, so side-position filtering avoids hiding the face.
     o.geometry.computeBoundingBox?.();
     const accessoryBounds=new THREE.Box3().setFromObject(o);
     const accessorySize=accessoryBounds.getSize(new THREE.Vector3());
     const accessoryCenter=accessoryBounds.getCenter(new THREE.Vector3());
     // setFromObject returns world coordinates; convert the center back into soldier-local space
     // so this works when the player moves anywhere in the level.
     const soldierLocalCenter=importedSoldier.worldToLocal(accessoryCenter.clone());
     const maxDim=Math.max(accessorySize.x,accessorySize.y,accessorySize.z);
     const atSideOfHead=soldierLocalCenter.y>1.62&&soldierLocalCenter.y<2.36&&Math.abs(soldierLocalCenter.x)>.105&&Math.abs(soldierLocalCenter.x)<.62;
     if(maxDim<.72&&atSideOfHead){
      o.visible=false;
      console.info('OUTWORLD: removed side-head accessory mesh',o.name,{x:soldierLocalCenter.x,y:soldierLocalCenter.y,z:soldierLocalCenter.z,size:maxDim});
     }
    }
    if(o.isBone){
    allBones.push(o);
    const n=o.name.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!soldierBones.head&&/(head|mixamorighead)$/.test(n))soldierBones.head=o;
    if(!soldierBones.neck&&n.includes('neck'))soldierBones.neck=o;
    if(!soldierBones.spine&&/(spine2|spine3|chest|upperchest|mixamorigspine2)/.test(n))soldierBones.spine=o;
    if(!soldierBones.leftArm&&/(leftarm|leftupperarm|mixamorigleftarm|upperarml|leftshoulder)/.test(n))soldierBones.leftArm=o;
    if(!soldierBones.rightArm&&/(rightarm|rightupperarm|mixamorigrightarm|upperarmr|rightshoulder)/.test(n))soldierBones.rightArm=o;
    if(!soldierBones.leftForearm&&/(leftforearm|leftlowerarm|mixamorigleftforearm|lowerarml)/.test(n))soldierBones.leftForearm=o;
    if(!soldierBones.rightForearm&&/(rightforearm|rightlowerarm|mixamorigrightforearm|lowerarmr)/.test(n))soldierBones.rightForearm=o;
    if(!soldierBones.leftHand&&/(lefthand|mixamoriglefthand|handl)/.test(n))soldierBones.leftHand=o;
    if(!soldierBones.rightHand&&/(righthand|mixamorigrighthand|handr)/.test(n))soldierBones.rightHand=o;
    if(!soldierBones.leftLeg&&/(leftupleg|leftthigh|mixamorigleftupleg|thighl|leftupperleg)/.test(n))soldierBones.leftLeg=o;
    if(!soldierBones.rightLeg&&/(rightupleg|rightthigh|mixamorigrightupleg|thighr|rightupperleg)/.test(n))soldierBones.rightLeg=o;
    if(!soldierBones.leftShin&&/(leftleg|leftcalf|leftlowerleg|mixamorigleftleg|calfl)/.test(n)&&!n.includes('upleg'))soldierBones.leftShin=o;
    if(!soldierBones.rightShin&&/(rightleg|rightcalf|rightlowerleg|mixamorigrightleg|calfr)/.test(n)&&!n.includes('upleg'))soldierBones.rightShin=o;
    boneRest.set(o,o.quaternion.clone());
   }
  });
  importedSoldier.userData.boneRig={soldierBones,boneRest,allBones};
  // Keep a reference to any authored rifle/weapon meshes inside the character asset.
  const attachedWeapons=[];
  importedSoldier.traverse(o=>{if(o.isMesh&&/(rifle|weapon|gun|smg|carbine)/i.test(o.name)){attachedWeapons.push(o);o.castShadow=true}});
  importedSoldier.userData.attachedWeapons=attachedWeapons;
  // Log the imported rig so missing bone mappings are visible during browser testing.
  console.info('OUTWORLD soldier rig:',allBones.map(b=>b.name).join(', '));
  console.info('OUTWORLD mapped bones:',Object.fromEntries(Object.entries(soldierBones).map(([k,b])=>[k,b?.name||null])));
  // Load a separate genuine 3D rifle mesh for the third-person marine (never procedural geometry).
  assetLoader.load(thirdPersonWeaponURL,weaponGLTF=>{
   const rifle=weaponGLTF.scene;
   rifle.updateMatrixWorld(true);
   const rifleBounds=new THREE.Box3().setFromObject(rifle);
   const rifleSize=rifleBounds.getSize(new THREE.Vector3());
   const rifleCenter=rifleBounds.getCenter(new THREE.Vector3());
   const rifleLength=Math.max(rifleSize.x,rifleSize.y,rifleSize.z)||1;
   rifle.scale.setScalar(.92/rifleLength);
   // Preserve the geometry-centering correction; overwriting position here previously discarded it.
   const centerOffset=new THREE.Vector3(-rifleCenter.x,-rifleCenter.y,-rifleCenter.z).multiplyScalar(rifle.scale.x);
   rifle.position.copy(centerOffset);
   rifle.rotation.set(Math.PI/2,0,0); // The asset is authored upright; rotate its long axis horizontal for a held rifle.
   rifle.updateMatrixWorld(true);
   rifle.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(o.material){o.material.depthWrite=true;o.material.needsUpdate=true}}});
   // Parent the real rifle to the animated right hand and add grip offset to the centering correction.
   const gripBone=importedSoldier.userData.boneRig?.soldierBones?.rightHand||importedSoldier.userData.boneRig?.soldierBones?.rightForearm;
   if(gripBone){
    gripBone.add(rifle);
    rifle.position.add(new THREE.Vector3(0,-.015,-.23));
   }else{
    importedSoldier.add(rifle);
    rifle.position.add(new THREE.Vector3(.18,1.34,-.24));
   }
   importedSoldier.userData.thirdPersonWeapon=rifle;
   console.info('OUTWORLD: imported third-person M4A1 rifle loaded');
  },undefined,e=>console.error('OUTWORLD third-person rifle asset failed to load.',e));
  player.add(importedSoldier);
  // Re-align the actual asset's feet to the player ground plane after attaching it to the player.
  importedSoldier.updateMatrixWorld(true);
  const footBounds=new THREE.Box3().setFromObject(importedSoldier);
  if(Number.isFinite(footBounds.min.y))importedSoldier.position.y-=footBounds.min.y-player.position.y;
  // The original blockout is deliberately kept invisible; only the imported character is rendered.
  player.children.forEach(o=>{if(o!==importedSoldier)o.visible=false});
  if(gltf.animations&&gltf.animations.length){
   const mixer=new THREE.AnimationMixer(importedSoldier);externalMixers.push(mixer);
   const moveClip=gltf.animations.find(a=>/walk|run|jog|move|locomotion/i.test(a.name)&&!/idle/i.test(a.name))||null;
   const idleClip=gltf.animations.find(a=>/idle|stand|breath/i.test(a.name))||null;
   const idleAction=idleClip?mixer.clipAction(idleClip):null;
   const moveAction=moveClip?mixer.clipAction(moveClip):null;
   if(idleAction)idleAction.play();
   if(moveAction){moveAction.enabled=true;moveAction.setEffectiveWeight(0);}
   importedSoldier.userData.locomotion={idleAction,moveAction,active:'idle'};
  }
  console.info('OUTWORLD: imported CC BY 4.0 tactical soldier loaded');
 },undefined,e=>console.error('OUTWORLD soldier asset failed to load; procedural player remains hidden.',e));
 assetLoader.load(firstPersonAssetURL,gltf=>{
  importedFP=gltf.scene;
  // Frame the imported FPS rig from its actual bounds instead of assuming its authoring scale.
  // Keep the complete rifle and both arms in the camera frustum even if the source GLB scale changes.
  importedFP.updateMatrixWorld(true);
  const fpBounds=new THREE.Box3().setFromObject(importedFP);
  const fpSize=fpBounds.getSize(new THREE.Vector3());
  const fpCenter=fpBounds.getCenter(new THREE.Vector3());
  const fpScale=Math.min(.95/Math.max(fpSize.x,.001),.62/Math.max(fpSize.y,.001),1.25/Math.max(fpSize.z,.001));
  importedFP.scale.setScalar(fpScale);
  importedFP.position.set(-fpCenter.x*fpScale,-fpCenter.y*fpScale,-fpCenter.z*fpScale);
  importedFP.updateMatrixWorld(true);
  importedFP.traverse(o=>{if(o.isMesh){o.renderOrder=1000;o.frustumCulled=false;if(o.material){o.material.depthTest=true;o.material.depthWrite=true;o.material.needsUpdate=true}}});
  fpAssetRig.add(importedFP);
  // Attach the muzzle flash to the forward end of the real imported weapon asset.
  // Use the GLB's original local-space bounds; world-space bounds here would misplace the anchor.
  const muzzleAnchor=new THREE.Group();
  muzzleAnchor.position.set(fpCenter.x,fpBounds.min.y+fpSize.y*.43,fpBounds.max.z+.025);
  importedFP.add(muzzleAnchor);
  fpFlash.position.set(0,0,0);
  muzzleAnchor.add(fpFlash);
  weaponRig.userData.muzzleAnchor=muzzleAnchor;
  if(gltf.animations&&gltf.animations.length){
   const mixer=new THREE.AnimationMixer(importedFP);externalMixers.push(mixer);
   const idle=gltf.animations.find(a=>/idle/i.test(a.name))||gltf.animations[0];mixer.clipAction(idle).play();
  }
  console.info('OUTWORLD: imported first-person arms/weapon asset loaded');
 },undefined,e=>console.error('OUTWORLD first-person asset failed to load.',e));
}
// No homemade arm meshes. These groups remain only as visibility containers.
const leftArm=new THREE.Group(),rightArm=new THREE.Group();
armRig.add(leftArm,rightArm);
// Player jetpack: twin compact nozzles and animated exhaust glow.
const jetGlowMat=new THREE.MeshBasicMaterial({color:0x54eaff,transparent:true,opacity:.78});
const jetGlows=[];
for(const side of [-1,1]){
 const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.10,.14,.30,10),new THREE.MeshStandardMaterial({color:0x17262d,metalness:.7,roughness:.3}));
 nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*.20,1.12,-.39);player.add(nozzle);
 const glow=new THREE.Mesh(new THREE.ConeGeometry(.105,.52,10),jetGlowMat);
 glow.rotation.x=Math.PI/2;glow.position.set(side*.20,1.12,-.78);glow.visible=false;player.add(glow);jetGlows.push(glow);
}
scene.add(player);player.position.set(0,0,5);
const enemies=[];
const hydranPalettes=[0x78934a,0x9b5b3c,0x526b45,0x77705b,0x465b59];
const enemySpawns=[
 {x:-5,z:-13,trigger:-7,wave:1},{x:5,z:-15,trigger:-7,wave:1},
 {x:7,z:-25,trigger:-18,wave:2},{x:-6,z:-28,trigger:-18,wave:2},
 {x:-4,z:-39,trigger:-30,wave:3},{x:6,z:-42,trigger:-30,wave:3},
 {x:0,z:-50,trigger:-42,wave:4}
];
for(let i=0;i<enemySpawns.length;i++){
 const spawn=enemySpawns[i],obj=soldier(true),size=.78+Math.random()*.22;
 obj.scale.set(size,.82+Math.random()*.18,size);obj.position.set(spawn.x,0,spawn.z);obj.visible=false;
 obj.rotation.y=Math.PI+(Math.random()-.5)*.5;
 obj.userData.spawned=false;obj.userData.triggerZ=spawn.trigger;obj.userData.wave=spawn.wave;
 obj.userData.hp=100+Math.round(Math.random()*35);obj.userData.moveSpeed=3.7+Math.random()*1.2;
 obj.userData.cooldown=1.4+i*.35;obj.userData.fireCooldown=.9+i*.35;obj.userData.hit=0;
 obj.userData.walk=Math.random()*6;obj.userData.wanderPhase=Math.random()*Math.PI*2;obj.userData.wanderStrength=.2+Math.random()*.6;obj.userData.collisionRadius=.68;
 const palette=new THREE.Color(hydranPalettes[i%hydranPalettes.length]);
 obj.traverse(part=>{if(part.isMesh&&part.material&&part.material.map===insectTexture){part.material=part.material.clone();part.material.color.copy(palette);part.material.needsUpdate=true}});
 scene.add(obj);enemies.push(obj);
}
// Keep the tested full-size procedural Hydran enemies visible. The imported GLB pack
// currently has inconsistent in-game scale/orientation, so do not hide these meshes.
if(window.loadEnvironmentAssets)window.loadEnvironmentAssets(THREE,scene,lowPowerDevice).catch(err=>console.warn('Environment GLB assets unavailable; procedural fallback remains active.',err));
const bullets=[],sparks=[],clock=new THREE.Clock();let hp=100,fuel=100,yaw=0,pitch=-.05,targetYaw=0,targetPitch=-.05,vy=0,onGround=true,started=false,dead=false,won=false,fireHeld=false,boostHeld=false,jumpQueued=false,shotCooldown=0,damageFlash=0,lookTouch=null,stick={x:0,y:0},pointerLocked=false,lastShot=0,muzzleLife=0,hitConfirmTimer=0,thirdPerson=false,fireRecoil=0;
function startGame(){
 started=true;
 if(message) message.style.display='none';
}
// Start the simulation once the scene has been constructed; the start prompt is only UI.
message.addEventListener('pointerdown',e=>{e.preventDefault();startGame()});
message.addEventListener('click',startGame);
const viewToggle=document.querySelector('#viewToggle');function toggleView(){thirdPerson=!thirdPerson;viewToggle.textContent=thirdPerson?'VIEW: THIRD PERSON':'VIEW: FIRST PERSON'}viewToggle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleView()});const keys={};addEventListener('keydown',e=>{if(e.code==='KeyV'){toggleView();return}startGame();keys[e.code]=true;if(e.code==='Space'){jumpQueued=true;e.preventDefault()}if(e.code==='KeyR'&&(dead||won))location.reload()});addEventListener('keyup',e=>keys[e.code]=false);
canvas.addEventListener('pointerdown',()=>startGame(),{passive:true});
canvas.addEventListener('mousedown',e=>{if(e.button===0){startGame();fireHeld=true;shoot()}});canvas.addEventListener('click',()=>{startGame();if(innerWidth>700&&canvas.requestPointerLock&&!dead&&!won&&!pointerLocked)canvas.requestPointerLock()});
addEventListener('mouseup',()=>fireHeld=false);addEventListener('blur',()=>fireHeld=false);document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===canvas;if((dead||won)&&document.pointerLockElement)document.exitPointerLock()});
let mouseLookDown=false;
canvas.addEventListener('mousedown',e=>{if(e.button===2)mouseLookDown=true});
addEventListener('mouseup',e=>{if(e.button===2)mouseLookDown=false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{if(pointerLocked){targetYaw-=e.movementX*.0034;targetPitch-=e.movementY*.0030;targetPitch=Math.max(-.8,Math.min(.65,targetPitch))}else if(mouseLookDown){targetYaw-=e.movementX*.004;targetPitch=Math.max(-.8,Math.min(.65,targetPitch-e.movementY*.003))}});
const mobile=document.querySelector('#mobile');if(('ontouchstart'in window)||innerWidth<800)mobile.style.display='block';
if(mobile){
 mobile.style.pointerEvents='auto';
 mobile.querySelectorAll('button,#stick,#lookArea').forEach(el=>{el.style.touchAction='none';el.addEventListener('touchstart',()=>startGame(),{passive:true})});
}
function bindHold(id,fn){const el=document.getElementById(id);el.addEventListener('pointerdown',e=>{e.preventDefault();fn(true)});['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>el.addEventListener(ev,e=>fn(false)))}
bindHold('fire',v=>{fireHeld=v;if(v){startGame();shoot()}});bindHold('boost',v=>boostHeld=v);document.getElementById('jump').addEventListener('pointerdown',e=>{e.preventDefault();jumpQueued=true;startGame()});
const stickEl=document.querySelector('#stick'),nub=document.querySelector('#nub');let stickPointer=null;
function moveStick(e){
 const r=stickEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 const dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),scale=Math.min(1,42/(len||1));
 stick.x=dx*scale/42;stick.y=dy*scale/42;
 nub.style.transform=`translate(${stick.x*37}px,${stick.y*37}px)`;
}
function resetStick(e){
 if(e&&stickPointer!==null&&e.pointerId!==stickPointer)return;
 stickPointer=null;stick.x=0;stick.y=0;nub.style.transform='';
}
stickEl.addEventListener('pointerdown',e=>{
 e.preventDefault();e.stopPropagation();stickPointer=e.pointerId;
 try{stickEl.setPointerCapture(e.pointerId)}catch(_){}
 moveStick(e);startGame();
});
stickEl.addEventListener('pointermove',e=>{if(stickPointer!==null&&e.pointerId===stickPointer)moveStick(e)});
stickEl.addEventListener('pointerup',resetStick);
stickEl.addEventListener('pointercancel',resetStick);
stickEl.addEventListener('lostpointercapture',()=>{if(stickPointer!==null)resetStick()});
// Touch fallback for Android browsers that do not deliver captured pointer moves reliably.
stickEl.addEventListener('touchstart',e=>{const t=e.changedTouches[0];if(!t)return;e.preventDefault();stickPointer='touch';moveStick({clientX:t.clientX,clientY:t.clientY});startGame()},{passive:false});
stickEl.addEventListener('touchmove',e=>{if(stickPointer!=='touch')return;const t=e.changedTouches[0];if(!t)return;e.preventDefault();moveStick({clientX:t.clientX,clientY:t.clientY})},{passive:false});
function resetTouchStick(){if(stickPointer==='touch')resetStick()}
stickEl.addEventListener('touchend',resetTouchStick);
stickEl.addEventListener('touchcancel',resetTouchStick);
const lookArea=document.querySelector('#lookArea');
let lookPointerId=null,lookLastX=0,lookLastY=0;
function applyLookDelta(dx,dy){targetYaw-=dx*.008;targetPitch=Math.max(-.8,Math.min(.65,targetPitch-dy*.006))}
lookArea.style.touchAction='none';
lookArea.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse')return;
 e.preventDefault();e.stopPropagation();
 if(lookPointerId!==null)return;
 lookPointerId=e.pointerId;lookLastX=e.clientX;lookLastY=e.clientY;
 try{lookArea.setPointerCapture(e.pointerId)}catch(_){}
 startGame();
},{passive:false});
lookArea.addEventListener('pointermove',e=>{
 if(lookPointerId!==e.pointerId)return;
 e.preventDefault();applyLookDelta(e.clientX-lookLastX,e.clientY-lookLastY);
 lookLastX=e.clientX;lookLastY=e.clientY;
},{passive:false});
function stopLook(e){if(lookPointerId!==null&&e.pointerId===lookPointerId)lookPointerId=null}
lookArea.addEventListener('pointerup',stopLook);
lookArea.addEventListener('pointercancel',stopLook);
lookArea.addEventListener('lostpointercapture',stopLook);
function shoot(){if(dead||won||!started||shotCooldown>0)return;shotCooldown=.075;fireRecoil=1;const dir=new THREE.Vector3();camera.getWorldDirection(dir).normalize();const origin=camera.position.clone();scene.updateMatrixWorld(true);let target=null,targetPoint=null,bestAlong=66,targetDamage=0;
 const raycaster=new THREE.Raycaster(origin,dir,0,65);
 // Mesh raycasts provide precise hits; a body capsule below makes hits reliable on moving enemies and thin limbs.
 for(const e of enemies){if(!e.visible||e.userData.hp<=0)continue;
  const hits=raycaster.intersectObject(e,true);
  if(hits.length&&hits[0].distance<bestAlong){bestAlong=hits[0].distance;target=e;targetPoint=hits[0].point.clone();const local=e.worldToLocal(targetPoint.clone());const h=local.y/Math.max(.1,e.scale.y);targetDamage=h<.45?40:(h>.78?70:50)}
  const foot=e.localToWorld(new THREE.Vector3(0,.18,0)),head=e.localToWorld(new THREE.Vector3(0,2.05,0)),axis=head.clone().sub(foot),to=origin.clone().sub(foot),axisLen=axis.lengthSq(),rayAxis=dir.dot(axis),rayTo=dir.dot(to),axisTo=axis.dot(to),denom=axisLen-rayAxis*rayAxis;
  const along=denom>1e-6?(rayAxis*axisTo-axisLen*rayTo)/denom:-rayTo;
  if(along>=0&&along<bestAlong&&along<65){const t=THREE.MathUtils.clamp((axisTo+along*rayAxis)/Math.max(axisLen,1e-6),0,1),rayPoint=origin.clone().addScaledVector(dir,along),bodyPoint=foot.clone().addScaledVector(axis,t),radius=(e.userData.insect?.56:.48)*Math.max(e.scale.x,e.scale.z);if(rayPoint.distanceTo(bodyPoint)<radius){bestAlong=along;target=e;targetPoint=bodyPoint;targetDamage=t<.22?40:(t>.82?70:50)}}
 }
 if(target){target.userData.hp-=targetDamage;target.userData.hit=.2;document.querySelector('.reticle').classList.add('confirmed');hitConfirmTimer=.22;for(let i=0;i<10;i++)spawnSpark(targetPoint.clone().add(new THREE.Vector3((Math.random()-.5)*.42,(Math.random()-.5)*.48,(Math.random()-.5)*.35)),0xffad63);if(target.userData.hp<=0){target.visible=false;target.userData.hp=0;for(let i=0;i<24;i++)spawnSpark(target.position.clone().add(new THREE.Vector3((Math.random()-.5)*.9,1+Math.random()*1.5,(Math.random()-.5)*.9)),i%3===0?0x8caca4:0xff8d4d)}}
 scene.updateMatrixWorld(true);const muzzleWorld=weaponRig.userData.muzzleAnchor?weaponRig.userData.muzzleAnchor.getWorldPosition(new THREE.Vector3()):origin.clone().add(dir.clone().multiplyScalar(.65));const tpRifle=thirdPerson&&importedSoldier?.userData.thirdPersonWeapon?importedSoldier.userData.thirdPersonWeapon:null;let start=muzzleWorld;if(tpRifle){const rb=new THREE.Box3().setFromObject(tpRifle);const lo=rb.min,hi=rb.max;const corners=[new THREE.Vector3(lo.x,lo.y,lo.z),new THREE.Vector3(lo.x,lo.y,hi.z),new THREE.Vector3(lo.x,hi.y,lo.z),new THREE.Vector3(lo.x,hi.y,hi.z),new THREE.Vector3(hi.x,lo.y,lo.z),new THREE.Vector3(hi.x,lo.y,hi.z),new THREE.Vector3(hi.x,hi.y,lo.z),new THREE.Vector3(hi.x,hi.y,hi.z)];start=corners.reduce((best,p)=>p.dot(dir)>best.dot(dir)?p:best,corners[0]).clone();}else if(thirdPerson){start=player.localToWorld(new THREE.Vector3(.18,1.34,-.24));}const end=target?targetPoint.clone():origin.clone().add(dir.clone().multiplyScalar(42));worldMuzzleFlash.position.copy(start);worldMuzzleFlash.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);worldMuzzleFlash.visible=true;
  // Only draw travelling tracers for shots that miss; hits still get the muzzle flash and impact sparks.
  if(!target){const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.025,.038,2.4,7),new THREE.MeshBasicMaterial({color:0x9df7ff,transparent:true,opacity:1,depthWrite:false,depthTest:false,toneMapped:false}));bolt.frustumCulled=false;bolt.renderOrder=1001;scene.add(bolt);bullets.push({obj:bolt,life:.18,duration:.18,start,end,tracer:true,beam:true});}
  fpFlash.visible=false;
  // Do not show the old blockout muzzle spheres in third-person; they appear detached from the imported rifle.
  if(!thirdPerson){if(player.userData.muzzle)player.userData.muzzle.visible=true;if(player.userData.muzzleCore)player.userData.muzzleCore.visible=true;}
  muzzleLife=.09}
function spawnSpark(pos,color){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.028,5,4),new THREE.MeshBasicMaterial({color,toneMapped:false}));mesh.position.copy(pos);scene.add(mesh);sparks.push({obj:mesh,life:.35,vel:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5)})}
function enemyShoot(enemy,distance){
 const muzzle=enemy.position.clone().add(new THREE.Vector3(0,1.48,.32).applyAxisAngle(new THREE.Vector3(0,1,0),enemy.rotation.y));
 const target=player.position.clone().add(new THREE.Vector3(0,1.25,0));
 const hitChance=THREE.MathUtils.clamp(.78-distance*.012,.38,.72);
 const hits=Math.random()<hitChance;
 if(hits){hp=Math.max(0,hp-7);damageFlash=.3;for(let j=0;j<5;j++)spawnSpark(target.clone().add(new THREE.Vector3((Math.random()-.5)*.55,(Math.random()-.5)*.55,(Math.random()-.5)*.55)),0xff3d39)}
 const end=hits?target:target.clone().add(new THREE.Vector3((Math.random()-.5)*distance*.22,(Math.random()-.5)*distance*.14,(Math.random()-.5)*distance*.22));
 const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([muzzle,end]),new THREE.LineBasicMaterial({color:0xff554c,transparent:true,opacity:.9}));
 scene.add(line);bullets.push({obj:line,life:.18});
}
function endGame(victory){won=victory;dead=!victory;message.style.display='block';message.innerHTML=victory?'LANDING ZONE SECURED':'MARINE DOWN';message.innerHTML+='<small>Press R to redeploy</small>';if(document.pointerLockElement)document.exitPointerLock()}
function resize(){updateViewportSize();renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPowerDevice?0.82:1.6));if(innerWidth<800)mobile.style.display='block'}addEventListener('resize',resize);
function update(dt){
 if(dead||won)return;
  // Frame-rate-independent damped aim filters micro-jitter without adding a fixed-frame delay.
  const aimBlend=1-Math.exp(-dt*42);const yawDelta=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));yaw+=yawDelta*aimBlend;pitch+=(targetPitch-pitch)*aimBlend;
 shotCooldown=Math.max(0,shotCooldown-dt);damageFlash=Math.max(0,damageFlash-dt);document.querySelector('#damageOverlay').style.opacity=damageFlash>0?String(Math.min(.82,damageFlash*2.3)):'0';hitConfirmTimer=Math.max(0,hitConfirmTimer-dt);if(hitConfirmTimer===0)document.querySelector('.reticle').classList.remove('confirmed');muzzleLife=Math.max(0,muzzleLife-dt);if(muzzleLife===0){worldMuzzleFlash.visible=false;if(player.userData.muzzle)player.userData.muzzle.visible=false;if(player.userData.muzzleCore)player.userData.muzzleCore.visible=false;}
 const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y,side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+stick.x;
 const boost=(keys.ShiftLeft||keys.ShiftRight||boostHeld)&&fuel>0;const speed=boost?13:7.2;if(boost){fuel=Math.max(0,fuel-26*dt);vy=Math.max(vy,2.6)}else fuel=Math.min(100,fuel+10*dt);
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 // Use camera-relative strafing, but normalize diagonals so A/D+W/S does not change lateral speed.
 const wish=new THREE.Vector3(forward.x*fwd+right.x*side,0,forward.z*fwd+right.z*side);
 if(wish.lengthSq()>1)wish.normalize();
 const moveX=wish.x*speed*dt,moveZ=wish.z*speed*dt;
 moveEntityWithCollision(player,moveX,moveZ,.62,true);
 if(jumpQueued&&onGround){vy=7.3;onGround=false}jumpQueued=false;vy-=18*dt;player.position.y+=vy*dt;if(player.position.y<=0){player.position.y=0;vy=0;onGround=true}
 // Face the actual travel direction in third person so strafing does not look like skating sideways.
 const travelSpeed=Math.hypot(wish.x,wish.z);
 if(thirdPerson&&travelSpeed>.15&&!boost){
  const moveYaw=Math.atan2(-wish.x,-wish.z);
  const bodyDelta=Math.atan2(Math.sin(moveYaw-player.rotation.y),Math.cos(moveYaw-player.rotation.y));
  player.rotation.y+=bodyDelta*(1-Math.exp(-dt*7));
 }else{
  const aimBodyYaw=yaw+Math.PI;
  const bodyDelta=Math.atan2(Math.sin(aimBodyYaw-player.rotation.y),Math.cos(aimBodyYaw-player.rotation.y));
  player.rotation.y+=bodyDelta*(1-Math.exp(-dt*9));
 }
 player.position.y=Math.max(0,player.position.y);
 const lookDir=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));if(thirdPerson){const behind=4.9,high=2.45,shoulder=1.45;const desiredCam=new THREE.Vector3(player.position.x+Math.sin(yaw)*behind+Math.cos(yaw)*shoulder,player.position.y+high,player.position.z+Math.cos(yaw)*behind-Math.sin(yaw)*shoulder);camera.position.lerp(desiredCam,1-Math.exp(-dt*8));const aim=player.position.clone().add(new THREE.Vector3(0,1.4,0)).add(lookDir.clone().multiplyScalar(6.2)).add(new THREE.Vector3(Math.cos(yaw)*.85,0,-Math.sin(yaw)*.85));camera.lookAt(aim)}else{camera.position.set(player.position.x,player.position.y+2.15,player.position.z);camera.lookAt(camera.position.clone().add(lookDir.multiplyScalar(25)))}
 const moving=Math.abs(fwd)+Math.abs(side)>.1;
 weaponRig.visible=false;armRig.visible=false;fpAssetRig.visible=!thirdPerson;marineRifle.visible=false;
 // The imported first-person arms and rifle follow look pitch and locomotion as one authored viewmodel.
 const viewGait=performance.now()*.010;
 fpAssetRig.rotation.set(THREE.MathUtils.clamp(-pitch*.20,-.22,.22),THREE.MathUtils.clamp(-yawDelta*.08,-.08,.08),moving?Math.sin(viewGait)*.012:0);
 fpAssetRig.position.set(moving?Math.sin(viewGait*.5)*.012:0,-.34+(moving?Math.abs(Math.sin(viewGait))*.014:0),-.58+(fireRecoil*.045));
 // Prevent the marine's own helmet/visor and armour from clipping across the first-person view.
 player.visible=thirdPerson;
 // Drive the imported character's authored locomotion clips; do not fake walking by bobbing the blockout.
 if(importedSoldier?.userData.locomotion){
  const rig=importedSoldier.userData.locomotion;
  const wantsMove=moving&&onGround&&!!rig.moveAction;
  const next=wantsMove?'move':'idle';
  if(next!==rig.active){
   const from=rig.active==='move'?rig.moveAction:rig.idleAction;
   const to=next==='move'?rig.moveAction:rig.idleAction;
   if(to){to.reset();to.setEffectiveTimeScale(1);to.setEffectiveWeight(1);to.play();if(from)to.crossFadeFrom(from,.18,true);}
   if(from&&!to)from.fadeOut(.18);
   rig.active=next;
  }
  if(rig.moveAction)rig.moveAction.setEffectiveWeight(wantsMove?1:0);
  if(rig.idleAction)rig.idleAction.setEffectiveWeight(wantsMove?0:1);
 }
 // Animate the imported character's actual skeleton: gait, knees, elbows, hands and camera-driven aim.
 if(importedSoldier?.userData.boneRig){
  const {soldierBones,boneRest}=importedSoldier.userData.boneRig;
  const aimPitch=THREE.MathUtils.clamp(pitch,-.85,.85);
  const phase=performance.now()*.009*(boost?1.45:1);
  const gaitActive=moving&&onGround&&!boost&&!importedSoldier.userData.locomotion?.moveAction;
  for(const key of ['head','neck','spine','leftArm','rightArm','leftForearm','rightForearm','leftHand','rightHand','leftLeg','rightLeg','leftShin','rightShin']){
   const b=soldierBones[key];if(!b)continue;
   b.quaternion.copy(boneRest.get(b));
   if(key==='head')b.rotateX(-aimPitch*.72);
   else if(key==='neck')b.rotateX(-aimPitch*.28);
   else if(key==='spine')b.rotateX(-aimPitch*.10);
   else if(key==='leftArm'){b.rotateX(gaitActive?Math.sin(phase)*.40:0);b.rotateZ(-aimPitch*.16-.06);}
   else if(key==='rightArm'){b.rotateX(gaitActive?Math.sin(phase+Math.PI)*.40:0);b.rotateZ(-aimPitch*.16+.06);}
   else if(key==='leftForearm'){b.rotateX(gaitActive?Math.max(0,Math.sin(phase+Math.PI*.5))*.32:0);}
   else if(key==='rightForearm'){b.rotateX(gaitActive?Math.max(0,Math.sin(phase+Math.PI*1.5))*.32:0);}
   else if(key==='leftHand'||key==='rightHand'){b.rotateX(-aimPitch*.10);}
   else if(key==='leftLeg'){b.rotateX(gaitActive?Math.sin(phase)*.58:0);}
   else if(key==='rightLeg'){b.rotateX(gaitActive?Math.sin(phase+Math.PI)*.58:0);}
   else if(key==='leftShin'){b.rotateX(gaitActive?Math.max(0,-Math.sin(phase))*.72:0);}
   else if(key==='rightShin'){b.rotateX(gaitActive?Math.max(0,Math.sin(phase))*.72:0);}
  }
  // Move any rifle/weapon meshes that belong to the imported character with firing recoil.
  for(const weapon of importedSoldier.userData.attachedWeapons||[]){
   if(!weapon.userData.restPosition)weapon.userData.restPosition=weapon.position.clone();
   weapon.position.copy(weapon.userData.restPosition);
   weapon.position.z+=fireRecoil*.035;
  }
 }
 fireRecoil=Math.max(0,fireRecoil-dt*5.5);
 const gait=performance.now()*.012;
 player.children[0].position.y=1.42+(moving?Math.abs(Math.sin(gait))*.045:Math.sin(performance.now()*.002)*.012);
 player.children[2].rotation.z=moving?Math.sin(gait)*.025:0;
 player.userData.legs.forEach((leg,i)=>{const phase=performance.now()*.010+i*Math.PI;leg.rotation.x=moving?Math.sin(phase)*.48:0;leg.rotation.z=moving?Math.sin(phase)*.035:0;const knee=leg.children.find(c=>c.type==='Group');if(knee)knee.rotation.x=moving?Math.max(0,Math.sin(phase+Math.PI*.5))*.62:0});
 player.userData.arms.forEach((arm,i)=>{
   const phase=gait+i*Math.PI;
   const armSwing=moving?Math.sin(phase)*.38:0;
   arm.rotation.x=-.12+armSwing-fireRecoil*.30;
   arm.rotation.z=(i===0?-.13:.13)+(moving?Math.sin(phase)*.065:0);
   if(arm.userData.elbow){
     arm.userData.elbow.rotation.x=-.16-fireRecoil*.38+(moving?Math.max(0,Math.sin(phase+Math.PI*.5))*.24:0);
     arm.userData.elbow.rotation.z=(i===0?.08:-.08)+(moving?Math.sin(phase)*.08:0);
   }
 });
 // Upper torso, helmet and rifle react together to aiming and firing instead of remaining rigid.
 if(player.userData.chest){
   player.userData.chest.rotation.x=-.12-fireRecoil*.18;
   player.userData.chest.rotation.z=(moving?Math.sin(gait)*.045:0)-fireRecoil*.055;
 }
 if(player.userData.head)player.userData.head.rotation.x=-.025-fireRecoil*.045;
 marineRifle.rotation.x=-.08-fireRecoil*.24+(moving?Math.sin(gait)*.045:0);
 marineRifle.position.y=1.38+(moving?Math.abs(Math.sin(gait))*.035:0)-fireRecoil*.035;
 marineRifle.visible=thirdPerson;
 // Persistent 3D jetpack flames: animate scale and glow without allocating meshes each frame.
 if(!player.userData.flames){player.userData.flames=[];for(const side of [-1,1]){const flame=new THREE.Mesh(new THREE.ConeGeometry(.095,.62,7),new THREE.MeshBasicMaterial({color:0xffa13b,transparent:true,opacity:.9,depthWrite:false}));flame.position.set(side*.13,.95,-.42);flame.rotation.x=Math.PI;flame.visible=false;player.add(flame);player.userData.flames.push(flame)}}
 player.userData.flames.forEach((flame,i)=>{flame.visible=boost;if(boost){flame.scale.y=.75+Math.random()*.65;flame.material.color.setHex(Math.random()>.25?0xffa13b:0x63edff);flame.material.opacity=.72+Math.random()*.25}})
 let remaining=0;
 for(const e of enemies){
  if(!e.userData.spawned&&player.position.z<=e.userData.triggerZ){
   e.userData.spawned=true;e.visible=true;
   document.querySelector('#missionText').textContent='Hydran ambush detected — eliminate the defenders';
  }
  if(!e.visible)continue;
 remaining++;
 const dx=player.position.x-e.position.x,dz=player.position.z-e.position.z,d=Math.hypot(dx,dz);
 e.userData.walk+=dt*7;
 // Hydran enemies use articulated six-limb insect rigs, not marine legs/arms.
 if(e.userData.insect&&Array.isArray(e.userData.limbs)){
   e.userData.limbs.forEach((limb,i)=>{
     const swing=d>3?Math.sin(e.userData.walk+(limb.pair*Math.PI*.72)+(limb.side<0?Math.PI:0))*.22:0;
     limb.upper.rotation.z=limb.side*((limb.pair-1)*.10+swing*1.25);
     limb.upper.rotation.x=Math.sin(e.userData.walk+(limb.pair%2)*Math.PI)*.13;
     limb.lower.rotation.z=-limb.side*((limb.pair-1)*.08+swing*.85);
     limb.lower.rotation.x=Math.max(0,Math.sin(e.userData.walk+limb.pair*Math.PI*.8))* .20;
   });
   e.children[0].position.y=1.03+(d>3?Math.abs(Math.sin(e.userData.walk*2))*.065:Math.sin(e.userData.walk*1.3)*.018);e.rotation.z=d>3?Math.sin(e.userData.walk)*.025:0;
 }else{
   if(e.userData.legs)e.userData.legs.forEach((leg,i)=>leg.rotation.x=d>3?Math.sin(e.userData.walk+i*Math.PI)*.48:0);
   if(e.userData.arms)e.userData.arms.forEach((arm,i)=>{arm.rotation.x=d>3?Math.sin(e.userData.walk+i*Math.PI+Math.PI)*.18:(d<=2.8?-.16:0)});
   if(e.children[0])e.children[0].position.y=1.42+(d>3?Math.abs(Math.sin(e.userData.walk))*.035:0);
 }
 e.userData.hit=Math.max(0,e.userData.hit-dt);
 if(e.userData.hit>0&&e.children[0].material.emissive)e.children[0].material.emissive.setHex(0xff3820);
 else if(e.children[0].material.emissive)e.children[0].material.emissive.setHex(0x000000);
 e.rotation.y=Math.atan2(dx,dz);
 if(d>7.5){let moveX=dx/(d||1),moveZ=dz/(d||1);const wander=Math.sin(performance.now()*.0014+(e.userData.wanderPhase||0))*(e.userData.wanderStrength||.3);moveX+=-moveZ*wander;moveZ+=moveX*wander*.35;const avoidX=e.position.x,avoidZ=e.position.z;let steerX=0,steerZ=0;for(const ob of scene.children){if(!ob.userData||!ob.userData.blocksEnemy)continue;const ox=avoidX-ob.position.x,oz=avoidZ-ob.position.z,dist=Math.hypot(ox,oz),radius=ob.userData.blockRadius||2.5;if(dist<radius+2.1&&dist>.01){const weight=(radius+2.1-dist)/(radius+2.1);steerX+=(ox/dist)*weight*2.6;steerZ+=(oz/dist)*weight*2.6}}moveX+=steerX;moveZ+=steerZ;const ml=Math.hypot(moveX,moveZ)||1;moveX/=ml;moveZ/=ml;const enemySpeed=e.userData.moveSpeed||4.2;e.userData.collisionRadius=.62;moveEntityWithCollision(e,moveX*enemySpeed*dt,moveZ*enemySpeed*dt,.62,true)}
 else if(d<30){e.userData.fireCooldown-=dt;if(e.userData.fireCooldown<=0){enemyShoot(e,d);e.userData.fireCooldown=1.55+Math.random()*.7}}
 }
 if(fireHeld&&shotCooldown<=0)shoot();
 bullets.forEach(b=>{b.life-=dt;if(b.tracer){const progress=THREE.MathUtils.clamp(1-b.life/b.duration,0,1);const head=b.start.clone().lerp(b.end,progress);if(b.beam){const travel=b.end.clone().sub(b.start);const direction=travel.clone().normalize();b.obj.position.copy(head).addScaledVector(direction,-1.2);b.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);b.obj.material.opacity=Math.min(1,b.life/.10)}else{const tail=THREE.MathUtils.clamp(progress-.22,0,1);const a=b.start.clone().lerp(b.end,tail);b.obj.geometry.setFromPoints([a,head]);b.obj.material.opacity=Math.min(1,b.life/.045)}}if(b.life<=0){scene.remove(b.obj);b.obj.geometry.dispose();b.obj.material.dispose()}});for(let i=bullets.length-1;i>=0;i--)if(bullets[i].life<=0)bullets.splice(i,1);if(muzzleLife<=dt)fpFlash.visible=false;
 sparks.forEach(s=>{s.life-=dt;s.obj.position.addScaledVector(s.vel,dt);s.vel.y-=9*dt;s.obj.scale.setScalar(Math.max(.01,s.life*3))});for(let i=sparks.length-1;i>=0;i--)if(sparks[i].life<=0){const deadSpark=sparks[i].obj;scene.remove(deadSpark);deadSpark.geometry.dispose();deadSpark.material.dispose();sparks.splice(i,1)}
 document.querySelector('#hpText').textContent=Math.round(hp)+'%';document.querySelector('#hpBar').style.width=hp+'%';document.querySelector('#fuelText').textContent=Math.round(fuel)+'%';document.querySelector('#fuelBar').style.width=fuel+'%';document.querySelector('#enemyText').textContent=remaining;
 const allSpawned=enemies.every(e=>e.userData.spawned);
 const atLanding=Math.hypot(player.position.x,player.position.z+56.5)<3.6;
 if(remaining>0)document.querySelector('#missionText').textContent='Hostiles remaining: '+remaining+' · Reach the landing beacon';
 else if(!allSpawned)document.querySelector('#missionText').textContent='Advance through the ravine to draw out Hydran patrols';
 else if(!atLanding)document.querySelector('#missionText').textContent='Ravine clear — reach the illuminated landing beacon';
 else document.querySelector('#missionText').textContent='Landing zone reached';
 if(hp<=0)endGame(false);else if(allSpawned&&remaining===0&&atLanding)endGame(true);
}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.04);for(const mixer of externalMixers)mixer.update(dt);update(dt);renderer.render(scene,camera)}loop();
})();
