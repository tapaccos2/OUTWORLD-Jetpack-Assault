(()=> {
const canvas=document.querySelector('#game'), message=document.querySelector('#message');
if(!window.THREE){message.innerHTML='3D ENGINE NOT LOADED<small>Connect to the internet and reload this HTML file.</small>';return}
// Performance tiers: favour stable frame rate on Raspberry Pi and other low-power devices.
const lowPowerDevice=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4||/raspberry|armv7|aarch64/i.test(navigator.userAgent);
const renderer=new THREE.WebGLRenderer({canvas,antialias:!lowPowerDevice,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,lowPowerDevice?1:2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.setClearColor(0x91b3c2,1);renderer.info.autoReset=true;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x7e9695);scene.fog=new THREE.FogExp2(0x7e9695,0.0025);
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
groundMat.map=groundDetailTexture;groundMat.bumpMap=groundDetailTexture;groundMat.normalMap=groundNormal;groundMat.normalScale.set(.65,.65);groundMat.bumpScale=.24;groundMat.roughness=1.0;groundMat.color.setHex(0xaaa38b);groundMat.needsUpdate=true;

// GRAPHICS UPGRADE — rolling, eroded terrain instead of a perfectly flat arena.
const terrainSegments=lowPowerDevice?72:192;
const terrainGeo=new THREE.PlaneGeometry(260,260,terrainSegments,terrainSegments);
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
// Load CC0 glTF environment models asynchronously; procedural terrain remains as fallback.
// Imported nature pack disabled: its current models read as oversized smooth blobs at gameplay scale. Use the handcrafted environment below until suitable game-scale assets are integrated.
// Removed the visible development grid for a natural, continuous alien terrain.
// Distant rugged ridge silhouettes made from real 3D geometry.
// Distant alien escarpment: one layered, jagged skyline instead of oversized smooth boulders.
function makeRidgeLayer(zBase, heightScale, color, seed){
 const verts=[], indices=[], cols=[];
 const points=54;
 let heights=[];
 for(let i=0;i<=points;i++){
  const x=-118+i*(236/points);
  const wave=Math.sin(i*.47+seed)*.42+Math.sin(i*1.19+seed*2.1)*.24+Math.sin(i*2.73+seed*.7)*.13;
  const peak=Math.pow(Math.max(0,Math.sin(i*.31+seed*1.4)),5)*.55;
  heights.push(3.2+(wave+peak+Math.random()*.12)*heightScale);
 }
 for(let i=0;i<=points;i++){
  const x=-118+i*(236/points), top=heights[i];
  verts.push(x,0,zBase, x,top,zBase+(Math.sin(i*.77+seed)*1.5));
  const shade=.72+((Math.sin(i*2.17+seed)+1)*.14);
  cols.push(shade,shade*.98,shade*.88, shade*.72,shade*.77,shade*.68);
  if(i<points){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
 geo.setIndex(indices);geo.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color,vertexColors:true,roughness:1,flatShading:true,side:THREE.DoubleSide});
 const ridge=new THREE.Mesh(geo,material);ridge.position.z=0;ridge.receiveShadow=true;scene.add(ridge);
}
makeRidgeLayer(-111,12,0x77796c,1.7);
makeRidgeLayer(-102,8,0x555f57,4.2);
makeRidgeLayer(-94,5,0x3c4c47,7.1);
// Small luminous alien mineral outcrops scattered across the landing zone
const crystalMat=new THREE.MeshStandardMaterial({color:0x777d69,emissive:0x090d08,emissiveIntensity:.12,roughness:.82,metalness:.08});
for(let i=0;i<7;i++){const group=new THREE.Group();const count=2+Math.floor(Math.random()*2);for(let j=0;j<count;j++){const crystal=new THREE.Mesh(new THREE.ConeGeometry(.10+Math.random()*.12,.25+Math.random()*.48,5),crystalMat);crystal.position.set((Math.random()-.5)*.45,.14+Math.random()*.12,(Math.random()-.5)*.45);crystal.rotation.z=(Math.random()-.5)*.3;group.add(crystal)}group.userData.blocksEnemy=true;group.userData.blockRadius=.55;group.position.set((Math.random()-.5)*88,.03,-12-Math.random()*75);scene.add(group)}
// Rock clusters
for(let i=0;i<(lowPowerDevice?28:60);i++){
 const size=lowPowerDevice?.12+Math.random()*.22:.14+Math.random()*.32;
 const geo=new THREE.IcosahedronGeometry(size,2),p=geo.attributes.position;
 for(let j=0;j<p.count;j++){const n=.58+Math.random()*.82;p.setXYZ(j,p.getX(j)*n,p.getY(j)*(.5+Math.random()*.72),p.getZ(j)*(.62+Math.random()*.76))}
 geo.computeVertexNormals();
 const r=new THREE.Mesh(geo,Math.random()>.35?rockMat:rockLite);r.userData.blocksEnemy=true;r.userData.blockRadius=size*.78;
 r.position.set((Math.random()-.5)*92,.02+Math.random()*.05,-8-Math.random()*92);
 r.scale.set(.8+Math.random()*.38,.42+Math.random()*.42,.72+Math.random()*.42);r.rotation.set(Math.random()*.18,Math.random()*3,Math.random()*.18);r.castShadow=true;r.receiveShadow=true;scene.add(r)
}
// Alien rock spires and weathered landing-zone barricades
for(let i=0;i<(lowPowerDevice?5:9);i++){const h=1.5+Math.random()*3.2,w=.45+Math.random()*.75;const geo=new THREE.IcosahedronGeometry(1,2),p=geo.attributes.position;for(let j=0;j<p.count;j++){const n=.78+Math.random()*.42;p.setXYZ(j,p.getX(j)*n,p.getY(j),p.getZ(j)*n)}geo.computeVertexNormals();const spire=new THREE.Mesh(geo,mat(i%3?0x343d37:0x4a4d40));spire.scale.set(w,h*.7,w*.8);spire.userData.blocksEnemy=true;spire.userData.blockRadius=w*1.2;spire.position.set((Math.random()-.5)*100,h*.32,-18-Math.random()*82);spire.rotation.set((Math.random()-.5)*.2,Math.random()*3,(Math.random()-.5)*.28);spire.castShadow=true;spire.receiveShadow=true;scene.add(spire)}
for(let i=0;i<5;i++){const xPos=(i-2)*13;const base=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.3,.7),mat(0x3b4b4b));base.userData.blocksEnemy=true;base.userData.blockRadius=2.2;base.position.set(xPos,.65,-18-(i%3)*9);base.rotation.y=(Math.random()-.5)*.22;base.castShadow=true;base.receiveShadow=true;scene.add(base);const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,.09,.74),mat(0xd18b42));stripe.position.set(xPos,.95,-18-(i%3)*9);stripe.rotation.y=base.rotation.y;scene.add(stripe)}
// Simple industrial debris
for(let i=0;i<7;i++){let box=new THREE.Mesh(new THREE.BoxGeometry(1.8+Math.random()*2,.4+Math.random(),1+Math.random()*2),dark);box.userData.blocksEnemy=true;box.userData.blockRadius=1.65;box.position.set((Math.random()-.5)*65,.2,-8-Math.random()*70);box.rotation.y=Math.random()*Math.PI;box.castShadow=true;box.receiveShadow=true;scene.add(box)}

// SOLID WORLD COLLISION: swept horizontal movement with axis sliding.
function moveEntityWithCollision(entity,dx,dz,radius,checkActors=false){
 const canOccupy=(x,z)=>{
  if(x < -55+radius || x > 55-radius || z < -95+radius || z > 22-radius)return false;
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
// GRAPHICS MILESTONE 5 — environmental dressing (low-poly, mobile-conscious).
// 2. Landing-zone paint: worn perimeter ring and broken hazard markings.
const paintMat=new THREE.MeshStandardMaterial({color:0x88754f,roughness:1,transparent:true,opacity:.42});
for(let i=0;i<9;i++){const mark=new THREE.Mesh(new THREE.BoxGeometry(.7+Math.random()*1.1,.012,.055),paintMat);mark.position.set((Math.random()-.5)*26,-.065,-15-Math.random()*18);mark.rotation.y=(Math.random()-.5)*.35;scene.add(mark)}
// 3. Two industrial landing beacons with emissive lenses and restrained glow.
const beaconMetal=mat(0x263b40,.55,.42);
const beaconGlow=new THREE.MeshStandardMaterial({color:0x62e8ff,emissive:0x1b9eae,emissiveIntensity:2.2,roughness:.25});
for(const x of [-17,17]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,3.6,8),beaconMetal);pole.position.set(x,1.8,-25);pole.castShadow=true;scene.add(pole);const cap=new THREE.Mesh(new THREE.BoxGeometry(.7,.24,.7),dark);cap.position.set(x,3.55,-25);scene.add(cap);const lens=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),beaconGlow);lens.position.set(x,3.62,-25);scene.add(lens);const baseRing=new THREE.Mesh(new THREE.TorusGeometry(.36,.045,6,18),beaconGlow);baseRing.position.set(x,.12,-25);baseRing.rotation.x=Math.PI/2;scene.add(baseRing)}
// 4. A damaged drop-pod wreck gives the landing zone a recognisable focal prop.
const wreck=new THREE.Group();const wreckHull=new THREE.Mesh(new THREE.CylinderGeometry(.75,1.05,2.6,7,1),mat(0x39494b,.8,.25));wreckHull.rotation.z=Math.PI/2;wreckHull.rotation.x=.18;wreckHull.position.set(0,1.15,0);wreck.add(wreckHull);
const wreckNose=new THREE.Mesh(new THREE.ConeGeometry(.78,.8,7),mat(0x6b7770,.75,.2));wreckNose.rotation.z=-Math.PI/2;wreckNose.position.set(1.65,1.18,0);wreck.add(wreckNose);
const wreckStripe=new THREE.Mesh(new THREE.BoxGeometry(1.25,.12,1.5),mat(0xb65a3c,.7,.15));wreckStripe.position.set(-.05,1.38,.02);wreck.add(wreckStripe);
for(let side=-1;side<=1;side+=2){const fin=new THREE.Mesh(new THREE.BoxGeometry(.6,.12,1.25),dark);fin.position.set(side*.35,.35,side*.45);fin.rotation.z=side*.22;wreck.add(fin)}
wreck.position.set(-10,0,-38);wreck.rotation.y=-.45;wreck.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(wreck);
// 5. Ground-level mineral shards and debris add scale variation near the player.
const shardMat=new THREE.MeshStandardMaterial({color:0x5a7774,roughness:.75,metalness:.12});
for(let i=0;i<24;i++){const h=.18+Math.random()*.42;const shard=new THREE.Mesh(new THREE.ConeGeometry(.12+Math.random()*.12,h,5),shardMat);shard.position.set((Math.random()-.5)*76,h*.48,-3-Math.random()*65);shard.rotation.z=(Math.random()-.5)*.7;shard.rotation.x=(Math.random()-.5)*.5;shard.castShadow=true;scene.add(shard)}


// MODERN REMAKE VISUAL PASS — monumental outpost silhouettes and atmospheric depth.
const structureMetal=new THREE.MeshStandardMaterial({color:0x26383c,metalness:.72,roughness:.36});
const structureEdge=new THREE.MeshStandardMaterial({color:0x82979a,metalness:.68,roughness:.32});
const structureGlow=new THREE.MeshStandardMaterial({color:0x4ceaff,emissive:0x087b91,emissiveIntensity:2.2,metalness:.25,roughness:.28});
function addOutpost(x,z,scale=1){
 const g=new THREE.Group();
 const base=new THREE.Mesh(new THREE.CylinderGeometry(3.8*scale,5.2*scale,1.5*scale,10),structureMetal);
 base.position.y=.55*scale;base.castShadow=true;base.receiveShadow=true;g.add(base);
 const tower=new THREE.Mesh(new THREE.BoxGeometry(2.6*scale,10*scale,2.6*scale),structureMetal);
 tower.position.y=5.8*scale;tower.castShadow=true;tower.receiveShadow=true;g.add(tower);
 const crown=new THREE.Mesh(new THREE.CylinderGeometry(1.9*scale,1.5*scale,1.4*scale,8),structureEdge);
 crown.position.y=11.3*scale;crown.castShadow=true;g.add(crown);
 for(let side of [-1,1]){
  const brace=new THREE.Mesh(new THREE.BoxGeometry(.55*scale,7.8*scale,.65*scale),structureEdge);
  brace.position.set(side*1.65*scale,5.1*scale,0);brace.rotation.z=side*.12;g.add(brace);
  const light=new THREE.Mesh(new THREE.BoxGeometry(.12*scale,3.4*scale,.14*scale),structureGlow);
  light.position.set(side*1.33*scale,5.8*scale,1.34*scale);g.add(light);
 }
 const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.06*scale,.11*scale,3.8*scale,8),structureEdge);
 antenna.position.y=13.7*scale;g.add(antenna);
 const beacon=new THREE.Mesh(new THREE.SphereGeometry(.18*scale,10,8),structureGlow);
 beacon.position.y=15.65*scale;g.add(beacon);
 g.position.set(x,0,z);g.scale.setScalar(scale);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(g);
}
addOutpost(-27,-58,1.15);addOutpost(31,-74,.92);addOutpost(18,-38,.62);
// Broken elevated transit bridge across the far canyon.
const bridgeMat=new THREE.MeshStandardMaterial({color:0x303f42,metalness:.62,roughness:.48});
for(let i=0;i<9;i++){
 const span=new THREE.Mesh(new THREE.BoxGeometry(4.2,.32,1.8),bridgeMat);
 span.position.set(-18+i*4.1,5.8,-64+Math.sin(i*.8)*1.8);span.rotation.z=Math.sin(i*.8)*.035;
 span.castShadow=true;span.receiveShadow=true;scene.add(span);
}
for(let i=0;i<5;i++){
 const pylon=new THREE.Mesh(new THREE.CylinderGeometry(.22,.38,5.5,7),structureMetal);
 pylon.position.set(-14+i*8,3.0,-64);pylon.castShadow=true;scene.add(pylon);
}
// Alien scrub clusters with stems, layered leaves and luminous seed pods.
const plantStem=new THREE.MeshStandardMaterial({color:0x283e32,roughness:.9});
const plantLeaf=new THREE.MeshStandardMaterial({color:0x718e48,roughness:.7,side:THREE.DoubleSide});
const seedGlow=new THREE.MeshStandardMaterial({color:0xb9ed62,emissive:0x3f6512,emissiveIntensity:1.1,roughness:.3});
for(let i=0;i<(lowPowerDevice?16:78);i++){
 const x=(Math.random()-.5)*100,z=-4-Math.random()*83;
 if(Math.abs(x)<7&&z>-34)continue;
 const clump=new THREE.Group();
 const stems=2+Math.floor(Math.random()*4);
 for(let j=0;j<stems;j++){
  const h=.35+Math.random()*1.0;
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.075,h,5),plantStem);
  stem.position.set((Math.random()-.5)*.65,h*.5,(Math.random()-.5)*.6);stem.rotation.z=(Math.random()-.5)*.55;clump.add(stem);
  const leaf=new THREE.Mesh(new THREE.SphereGeometry(.22+Math.random()*.2,8,6),plantLeaf);
  leaf.scale.set(.65,.34,1.65);leaf.position.copy(stem.position);leaf.position.y+=h*.25;leaf.rotation.z=stem.rotation.z+.5;clump.add(leaf);
 }
 if(Math.random()>.45){
  const pod=new THREE.Mesh(new THREE.SphereGeometry(.13+Math.random()*.1,10,8),seedGlow);
  pod.position.set(0,.5+Math.random()*.8,0);clump.add(pod);
 }
 clump.position.set(x,.02,z);clump.rotation.y=Math.random()*Math.PI;clump.traverse(o=>{if(o.isMesh){o.castShadow=true}});scene.add(clump);
}
// Suspended dust motes catch the sun; points are subtle and do not obscure aiming.
const dustCount=lowPowerDevice?40:360,dustPositions=new Float32Array(dustCount*3);
for(let i=0;i<dustCount;i++){
 dustPositions[i*3]=(Math.random()-.5)*110;
 dustPositions[i*3+1]=.25+Math.random()*17;
 dustPositions[i*3+2]=4-Math.random()*105;
}
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
const dustMat=new THREE.PointsMaterial({color:0xf3d8a2,size:.075,transparent:true,opacity:.42,depthWrite:false,sizeAttenuation:true});
const dustField=new THREE.Points(dustGeo,dustMat);scene.add(dustField);

// HYDRAN VALLEY — ravine walls, alien growths, spore vents and nest structures.
const cliffMat=new THREE.MeshStandardMaterial({color:0x303b36,roughness:.96,metalness:.02});
const cliffLit=new THREE.MeshStandardMaterial({color:0x4d5a49,roughness:.88});
const chitinMat=new THREE.MeshStandardMaterial({color:0x293d31,roughness:.48,metalness:.12});
const sporeMat=new THREE.MeshStandardMaterial({color:0x9ac64c,emissive:0x334f08,emissiveIntensity:.65,roughness:.38});
const nestMat=new THREE.MeshStandardMaterial({color:0x544b35,roughness:.78});
for(let side of [-1,1]){
  // Layered ravine walls frame the route without sealing the playable area.
  for(let i=0;i<12;i++){
    const h=4+Math.random()*7, w=2.4+Math.random()*3;
    const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),i%3===0?cliffLit:cliffMat);
    rock.scale.set(w,h,3+Math.random()*3);
    rock.position.set(side*(12+Math.random()*5),h*.48,-8-i*6);
    rock.rotation.set(Math.random()*.25,Math.random()*.5,side*(Math.random()*.12));
    rock.castShadow=true;rock.receiveShadow=true;scene.add(rock);
  }
  // Alien chitin spires and glowing spore pods along the ravine edges.
  for(let i=0;i<9;i++){
    const x=side*(6.8+Math.random()*3.8), z=-5-i*7;
    const spike=new THREE.Mesh(new THREE.ConeGeometry(.45+Math.random()*.45,1.8+Math.random()*2.8,7),chitinMat);
    spike.position.set(x,spike.geometry.parameters.height*.48,z);spike.rotation.z=side*(Math.random()*.22);spike.castShadow=true;scene.add(spike);
    if(i%2===0){
      const pod=new THREE.Mesh(new THREE.SphereGeometry(.22+Math.random()*.14,10,8),sporeMat);
      pod.position.set(x-side*.35,.9+Math.random()*1.4,z-.15);pod.castShadow=true;scene.add(pod);
    }
  }
}
// Cracked alien nest mound at the far end of the valley.
const nest=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),nestMat);
nest.scale.set(5.5,2.8,3.2);nest.position.set(0,2.2,-76);nest.castShadow=true;nest.receiveShadow=true;scene.add(nest);
for(let i=0;i<7;i++){
  const rib=new THREE.Mesh(new THREE.TorusGeometry(1.2+i*.24,.10,7,18),chitinMat);
  rib.scale.set(1.25,1,.72);rib.position.set((i-3)*.8,2.1+(i%2)*.55,-78.5);rib.rotation.y=(i-3)*.10;scene.add(rib);
}
for(let i=0;i<5;i++){
  const egg=new THREE.Mesh(new THREE.SphereGeometry(.45+Math.random()*.25,12,9),sporeMat);
  egg.scale.y=1.35;egg.position.set(-3.8+i*1.9,.6,-72-Math.random()*3);egg.castShadow=true;scene.add(egg);
}

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

// First-person assault rifle: compact machined-metal silhouette, restrained wear and subdued status light.
const weaponRig=new THREE.Group();camera.add(weaponRig);weaponRig.position.set(.36,-.31,-.78);weaponRig.scale.set(.92,.92,.92);weaponRig.rotation.set(-.025,-.035,-.015);
const gunMetal=new THREE.MeshStandardMaterial({color:0x343a38,metalness:.62,roughness:.48});
const gunEdge=new THREE.MeshStandardMaterial({color:0x626863,metalness:.58,roughness:.43});
const gunDark=new THREE.MeshStandardMaterial({color:0x171b19,metalness:.18,roughness:.72});
const gunPolymer=new THREE.MeshStandardMaterial({color:0x282b26,metalness:.08,roughness:.86});
const gunEnergy=new THREE.MeshStandardMaterial({color:0x5f8d8a,emissive:0x102a28,emissiveIntensity:.55,metalness:.18,roughness:.5});
function gunPart(geo,material,pos,rot){const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(rot)m.rotation.set(...rot);m.castShadow=false;m.receiveShadow=false;weaponRig.add(m)}
gunPart(new THREE.BoxGeometry(.22,.19,.43),gunMetal,[0,0,0]);
gunPart(new THREE.BoxGeometry(.205,.055,.39),gunEdge,[0,.115,-.015]);
gunPart(new THREE.BoxGeometry(.17,.055,.2),gunDark,[0,.145,.07]);
gunPart(new THREE.CylinderGeometry(.025,.03,.48,12),gunDark,[0,.015,-.43],[Math.PI/2,0,0]);
gunPart(new THREE.CylinderGeometry(.042,.042,.075,12),gunEdge,[0,.015,-.685],[Math.PI/2,0,0]);
gunPart(new THREE.CylinderGeometry(.012,.012,.34,8),gunMetal,[0,.07,-.36],[Math.PI/2,0,0]);
gunPart(new THREE.BoxGeometry(.19,.105,.29),gunPolymer,[0,-.005,-.30]);
for(let side of [-1,1])for(let j=0;j<6;j++)gunPart(new THREE.BoxGeometry(.012,.014,.035),gunEdge,[side*.099,.012,-.405+j*.043]);
gunPart(new THREE.BoxGeometry(.12,.22,.16),gunDark,[0,-.18,-.02],[.16,0,0]);
gunPart(new THREE.BoxGeometry(.105,.17,.13),gunPolymer,[0,-.16,.16],[.24,0,0]);
gunPart(new THREE.BoxGeometry(.13,.16,.22),gunPolymer,[0,-.015,.30]);
gunPart(new THREE.BoxGeometry(.12,.12,.17),gunDark,[0,-.01,.46]);
gunPart(new THREE.BoxGeometry(.055,.12,.07),gunPolymer,[0,-.12,.075],[.18,0,0]);
gunPart(new THREE.BoxGeometry(.055,.04,.11),gunDark,[0,.17,.075]);
gunPart(new THREE.BoxGeometry(.065,.035,.15),gunDark,[0,.16,-.12]);
gunPart(new THREE.BoxGeometry(.018,.018,.075),gunEnergy,[0,.181,-.13]);
weaponRig.traverse(o=>{if(o.isMesh){o.renderOrder=1000;if(o.material){o.material.depthTest=false;o.material.depthWrite=false}}});
const fpFlash=new THREE.Group();const fpFlashOuter=new THREE.Mesh(new THREE.ConeGeometry(.105,.42,8),new THREE.MeshBasicMaterial({color:0xffb84d,transparent:true,opacity:.95,depthWrite:false}));fpFlashOuter.rotation.x=-Math.PI/2;fpFlashOuter.position.set(0,.015,-1.03);fpFlash.add(fpFlashOuter);const fpFlashCore=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,depthWrite:false}));fpFlashCore.position.set(0,.015,-.86);fpFlash.add(fpFlashCore);fpFlash.visible=false;weaponRig.add(fpFlash);

const player=soldier(false);
// Third-person rifle mounted to the marine's forward hand; visible only in chase view.
const marineRifle=new THREE.Group();
const mrMetal=new THREE.MeshStandardMaterial({color:0x26343a,metalness:.78,roughness:.31});
const mrEdge=new THREE.MeshStandardMaterial({color:0x82979b,metalness:.7,roughness:.3});
const mrGlow=new THREE.MeshStandardMaterial({color:0x43e8ff,emissive:0x087da0,emissiveIntensity:1.8,metalness:.2,roughness:.25});
function mrPart(geo,mat,pos,rot){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(rot)m.rotation.set(...rot);m.castShadow=true;marineRifle.add(m);return m}
mrPart(new THREE.BoxGeometry(.16,.15,.48),mrMetal,[0,0,0]);
mrPart(new THREE.BoxGeometry(.19,.045,.34),mrEdge,[0,.09,-.03]);
mrPart(new THREE.CylinderGeometry(.035,.045,.48,10),mrMetal,[0,.015,-.39],[Math.PI/2,0,0]);
mrPart(new THREE.CylinderGeometry(.05,.05,.055,10),mrEdge,[0,.015,-.64],[Math.PI/2,0,0]);
mrPart(new THREE.BoxGeometry(.06,.035,.22),mrGlow,[0,.08,-.25]);
mrPart(new THREE.BoxGeometry(.11,.14,.17),mrMetal,[0,-.12,.12],[.2,0,0]);
marineRifle.position.set(.30,1.48,.43);marineRifle.scale.set(1.18,1.18,1.18);marineRifle.rotation.set(-.04,0,0);player.add(marineRifle);

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
const externalMixers=[];const enemies=[];const hydranPalettes=[0x78934a,0x9b5b3c,0x526b45,0x77705b,0x465b59];for(let i=0;i<7;i++){const obj=soldier(true);const size=.78+Math.random()*.48;obj.scale.set(size,.82+Math.random()*.42,size);obj.position.set((Math.random()-.5)*34,0,-20-Math.random()*34);obj.rotation.y=Math.PI+(Math.random()-.5)*.5;obj.userData.hp=100+Math.round(Math.random()*50);obj.userData.moveSpeed=3.7+Math.random()*1.7;obj.userData.cooldown=1.4+i*.35;obj.userData.fireCooldown=.9+i*.35;obj.userData.hit=0;obj.userData.walk=Math.random()*6;obj.userData.wanderPhase=Math.random()*Math.PI*2;obj.userData.wanderStrength=.2+Math.random()*.6;const palette=new THREE.Color(hydranPalettes[i%hydranPalettes.length]);obj.traverse(part=>{if(part.isMesh&&part.material&&part.material.map===insectTexture){part.material=part.material.clone();part.material.color.copy(palette);part.material.needsUpdate=true}});scene.add(obj);enemies.push(obj)}
// Replace placeholder enemy meshes with textured, rigged GLB models when available.
if(window.loadCombatModels)window.loadCombatModels(THREE,enemies).then(mixers=>externalMixers.push(...mixers)).catch(err=>console.warn('3D character assets unavailable; procedural fallback remains active.',err));
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
 const muzzleLocal=new THREE.Vector3(0.0,0.015,-1.02);const muzzleWorld=muzzleLocal.applyMatrix4(camera.matrixWorld);const start=thirdPerson?origin.clone().add(dir.clone().multiplyScalar(.65)):muzzleWorld;const end=target?targetPoint.clone():origin.clone().add(dir.clone().multiplyScalar(42));const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.055,.085,2.8,8),new THREE.MeshBasicMaterial({color:target?0xffc46b:0x9df7ff,transparent:true,opacity:1,depthWrite:false}));bolt.frustumCulled=false;scene.add(bolt);bullets.push({obj:bolt,life:.22,duration:.22,start,end,tracer:true,beam:true});fpFlash.visible=!thirdPerson;if(player.userData.muzzle)player.userData.muzzle.visible=true;if(player.userData.muzzleCore)player.userData.muzzleCore.visible=true;muzzleLife=.085}
function spawnSpark(pos,color){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.055,5,5),new THREE.MeshBasicMaterial({color}));mesh.position.copy(pos);scene.add(mesh);sparks.push({obj:mesh,life:.35,vel:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5)})}
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
 shotCooldown=Math.max(0,shotCooldown-dt);damageFlash=Math.max(0,damageFlash-dt);document.querySelector('#damageOverlay').style.opacity=damageFlash>0?String(Math.min(.82,damageFlash*2.3)):'0';hitConfirmTimer=Math.max(0,hitConfirmTimer-dt);if(hitConfirmTimer===0)document.querySelector('.reticle').classList.remove('confirmed');muzzleLife=Math.max(0,muzzleLife-dt);if(muzzleLife===0){if(player.userData.muzzle)player.userData.muzzle.visible=false;if(player.userData.muzzleCore)player.userData.muzzleCore.visible=false;}
 const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y,side=(keys.KeyD?1:0)-(keys.KeyA?1:0)+stick.x;
 const boost=(keys.ShiftLeft||keys.ShiftRight||boostHeld)&&fuel>0;const speed=boost?13:7.2;if(boost){fuel=Math.max(0,fuel-26*dt);vy=Math.max(vy,2.6)}else fuel=Math.min(100,fuel+10*dt);
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));const moveX=(forward.x*fwd+right.x*side)*speed*dt,moveZ=(forward.z*fwd+right.z*side)*speed*dt;moveEntityWithCollision(player,moveX,moveZ,.62,true);
 if(jumpQueued&&onGround){vy=7.3;onGround=false}jumpQueued=false;vy-=18*dt;player.position.y+=vy*dt;if(player.position.y<=0){player.position.y=0;vy=0;onGround=true}
 player.rotation.y=yaw+Math.PI;player.position.y=Math.max(0,player.position.y);
 const lookDir=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));if(thirdPerson){const behind=4.9,high=2.45,shoulder=1.45;const desiredCam=new THREE.Vector3(player.position.x+Math.sin(yaw)*behind+Math.cos(yaw)*shoulder,player.position.y+high,player.position.z+Math.cos(yaw)*behind-Math.sin(yaw)*shoulder);camera.position.lerp(desiredCam,1-Math.exp(-dt*8));const aim=player.position.clone().add(new THREE.Vector3(0,1.4,0)).add(lookDir.clone().multiplyScalar(6.2)).add(new THREE.Vector3(Math.cos(yaw)*.85,0,-Math.sin(yaw)*.85));camera.lookAt(aim)}else{camera.position.set(player.position.x,player.position.y+2.15,player.position.z);camera.lookAt(camera.position.clone().add(lookDir.multiplyScalar(25)))}
 weaponRig.visible=!thirdPerson;marineRifle.visible=thirdPerson;
 // Prevent the marine's own helmet/visor and armour from clipping across the first-person view.
 player.visible=thirdPerson;
 const moving=Math.abs(fwd)+Math.abs(side)>.1;
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
 let remaining=0;for(const e of enemies){
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
 bullets.forEach(b=>{b.life-=dt;if(b.tracer){const progress=THREE.MathUtils.clamp(1-b.life/b.duration,0,1);const head=b.start.clone().lerp(b.end,progress);if(b.beam){const travel=b.end.clone().sub(b.start);const direction=travel.clone().normalize();b.obj.position.copy(head).addScaledVector(direction,-1.25);b.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);b.obj.material.opacity=Math.min(1,b.life/.07)}else{const tail=THREE.MathUtils.clamp(progress-.22,0,1);const a=b.start.clone().lerp(b.end,tail);b.obj.geometry.setFromPoints([a,head]);b.obj.material.opacity=Math.min(1,b.life/.045)}}if(b.life<=0){scene.remove(b.obj);b.obj.geometry.dispose();b.obj.material.dispose()}});for(let i=bullets.length-1;i>=0;i--)if(bullets[i].life<=0)bullets.splice(i,1);if(muzzleLife<=dt)fpFlash.visible=false;
 sparks.forEach(s=>{s.life-=dt;s.obj.position.addScaledVector(s.vel,dt);s.vel.y-=9*dt;s.obj.scale.setScalar(Math.max(.01,s.life*3))});for(let i=sparks.length-1;i>=0;i--)if(sparks[i].life<=0){const deadSpark=sparks[i].obj;scene.remove(deadSpark);deadSpark.geometry.dispose();deadSpark.material.dispose();sparks.splice(i,1)}
 document.querySelector('#hpText').textContent=Math.round(hp)+'%';document.querySelector('#hpBar').style.width=hp+'%';document.querySelector('#fuelText').textContent=Math.round(fuel)+'%';document.querySelector('#fuelBar').style.width=fuel+'%';document.querySelector('#enemyText').textContent=remaining;document.querySelector('#missionText').textContent=remaining?`Hostiles remaining: ${remaining}`:'Zone clear';if(hp<=0)endGame(false);else if(remaining===0)endGame(true);
}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.04);for(const mixer of externalMixers)mixer.update(dt);update(dt);renderer.render(scene,camera)}loop();
})();
