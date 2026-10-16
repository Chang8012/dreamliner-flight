/** Procedural Boeing 787-9 visual model. Coordinates: nose +X, up +Y, wings +/-Z.
 * Dimensions: 62.8 m long, 60.1 m span, extended wheels at Y=-6.15 m.
 * Controls: throttle and flaps 0..1, gear boolean/0..1, speed m/s, airborne boolean.
 * The caller owns aircraft group position/orientation and scene lighting.
 */
export function createAircraft(THREE) {
  const clamp=THREE.MathUtils.clamp;
  const lerp=THREE.MathUtils.lerp;
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const aircraft=new THREE.Group();
  aircraft.name='Boeing 787-9';
  const palette={white:new THREE.Color(0xf4f7fc),ink:new THREE.Color(0x111b2b),blue:new THREE.Color(0x0864a8),silver:new THREE.Color(0xa6b5c6),red:new THREE.Color(0xff4238),green:new THREE.Color(0x45f9a3)};
  const mat=(color,metalness=0,roughness=.4)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const skin= new THREE.MeshPhysicalMaterial({color:palette.white,roughness:.31,metalness:.18,clearcoat:.65,clearcoatRoughness:.26});
  const wingMat=mat(palette.white,.28,.32);
  const blueMat=mat(palette.blue,.35,.28);
  const silver=mat(palette.silver,.78,.24);
  const darkMat=mat(palette.ink,.28,.33);
  const rubber=mat(palette.ink,.02,.86);
  const glass= new THREE.MeshPhysicalMaterial({color:palette.ink,roughness:.12,metalness:.48,clearcoat:1});
  const fanMat=mat(palette.silver.clone().lerp(palette.ink,.5),.85,.35);
  const lineMat=new THREE.LineBasicMaterial({color:palette.ink,transparent:true,opacity:.24});
  const panelMat=new THREE.LineBasicMaterial({color:palette.ink,transparent:true,opacity:.3});
  const allGeometries=[];
  function mesh(geometry,material,parent=aircraft) { allGeometries.push(geometry); const m=new THREE.Mesh(geometry,material); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
  function geo(positions,indices) {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(indices)g.setIndex(indices);g.computeVertexNormals();return g;}
  function line(points,material=panelMat,parent=aircraft,closed=false){const g=new THREE.BufferGeometry().setFromPoints(points);allGeometries.push(g);const l=closed?new THREE.LineLoop(g,material):new THREE.Line(g,material);parent.add(l);return l;}
  function rod(a,b,r,material=silver,parent=aircraft){const delta=b.clone().sub(a);const m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),12),material,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;}
  function ellipsoid(x,y,z,sx,sy,sz,material,parent=aircraft){const m=mesh(new THREE.SphereGeometry(1,24,12),material,parent);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m;}
  const profile=[[-31.4,.055,.07,.65],[-29.5,.43,.48,.6],[-27,1.0,1.02,.42],[-24,1.93,2.0,.15],[-20,2.65,2.79,0],[-16,2.88,3.0,0],[17.5,2.88,3.0,0],[22,2.82,2.94,-.015],[25,2.55,2.7,-.06],[27,2.11,2.28,-.16],[29,1.43,1.6,-.3],[30.4,.72,.87,-.46],[31.4,.025,.03,-.57]];
  function profileSlope(i,k){const last=profile.length-1;if(i===0)return (profile[1][k]-profile[0][k])/(profile[1][0]-profile[0][0]);if(i===last)return (profile[last][k]-profile[last-1][k])/(profile[last][0]-profile[last-1][0]);const h0=profile[i][0]-profile[i-1][0],h1=profile[i+1][0]-profile[i][0],d0=(profile[i][k]-profile[i-1][k])/h0,d1=(profile[i+1][k]-profile[i][k])/h1;if(d0*d1<=0)return 0;const w0=2*h1+h0,w1=h1+2*h0;return (w0+w1)/(w0/d0+w1/d1);}
  function bodyAt(x) {let i=0;while(i<profile.length-2&&profile[i+1][0]<x)i++;const a=profile[i],b=profile[i+1],h=b[0]-a[0],t=clamp((x-a[0])/h,0,1);const value=k=>(2*t*t*t-3*t*t+1)*a[k]+(t*t*t-2*t*t+t)*h*profileSlope(i,k)+(-2*t*t*t+3*t*t)*b[k]+(t*t*t-t*t)*h*profileSlope(i+1,k);return {r:value(1),ry:value(2),cy:value(3)};}
  function bodyPoint(x,theta,offset=.022){const p=bodyAt(x);return V(x,p.cy+(p.ry+offset)*Math.cos(theta),(p.r+offset)*Math.sin(theta));}
  const bodyPos=[],bodyUV=[],bodyIdx=[];const nBody=170,nRadial=48;
  for(let i=0;i<=nBody;i++){const x=lerp(-31.4,31.4,i/nBody),b=bodyAt(x);for(let j=0;j<=nRadial;j++){const theta=j/nRadial*Math.PI*2;bodyPos.push(x,b.cy+b.ry*Math.cos(theta),b.r*Math.sin(theta));bodyUV.push((x+31.4)/62.8,j/nRadial);} }
  for(let i=0;i<nBody;i++)for(let j=0;j<nRadial;j++){const a=i*(nRadial+1)+j,b=a+nRadial+1;bodyIdx.push(a,a+1,b+1,a,b+1,b);}
  const bodyGeo=geo(bodyPos,bodyIdx);bodyGeo.setAttribute('uv',new THREE.Float32BufferAttribute(bodyUV,2));
  const livery=document.createElement('canvas');livery.width=4096;livery.height=1024;const lc=livery.getContext('2d');
  const liveryTexture=new THREE.CanvasTexture(livery);liveryTexture.colorSpace=THREE.SRGBColorSpace;liveryTexture.anisotropy=4;
  skin.map=liveryTexture;
  function paintLivery(){
    lc.fillStyle=palette.white.getStyle();lc.fillRect(0,0,4096,1024);
    const blue=palette.blue.getStyle();lc.fillStyle=blue;
    lc.beginPath();lc.moveTo(0,238);lc.bezierCurveTo(900,300,2300,385,4096,420);lc.lineTo(4096,604);lc.bezierCurveTo(2300,639,900,724,0,786);lc.closePath();lc.fill();
    lc.strokeStyle=palette.silver.getStyle();lc.lineWidth=7;
    for(const side of [1,-1]){lc.beginPath();lc.moveTo(0,512+side*285);lc.bezierCurveTo(900,512+side*205,2300,512+side*137,4096,512+side*105);lc.stroke();}
    lc.fillStyle=blue;lc.font='500 45px Arial';lc.textAlign='center';
    lc.fillText('D R E A M L I N E R',3020,200);
    lc.save();lc.translate(3020,824);lc.scale(-1,-1);lc.fillText('D R E A M L I N E R',0,0);lc.restore();
    liveryTexture.needsUpdate=true;
  }
  paintLivery();mesh(bodyGeo,skin);
  const roundRect=new THREE.Shape();const ww=.34,hh=.49,cr=.13;
  roundRect.moveTo(-ww/2+cr,-hh/2);roundRect.lineTo(ww/2-cr,-hh/2);roundRect.quadraticCurveTo(ww/2,-hh/2,ww/2,-hh/2+cr);roundRect.lineTo(ww/2,hh/2-cr);roundRect.quadraticCurveTo(ww/2,hh/2,ww/2-cr,hh/2);roundRect.lineTo(-ww/2+cr,hh/2);roundRect.quadraticCurveTo(-ww/2,hh/2,-ww/2,hh/2-cr);roundRect.lineTo(-ww/2,-hh/2+cr);roundRect.quadraticCurveTo(-ww/2,-hh/2,-ww/2+cr,-hh/2);
  const windowGeo=new THREE.ShapeGeometry(roundRect,5);allGeometries.push(windowGeo);
  const doorXs=[23,7.3,-11,-23.1];
  const windowMatrices=[];
  const windowDummy=new THREE.Object3D();
  for(const side of [-1,1]){
    for(let x=-23.9;x<25;x+=.69){if(doorXs.some(d=>Math.abs(x-d)<.85))continue;const b=bodyAt(x);const theta=side*Math.acos(1.02/b.ry);const p=bodyPoint(x,theta,.045);windowDummy.position.copy(p);windowDummy.lookAt(p.clone().add(V(0,.34,side*.94)));windowDummy.updateMatrix();windowMatrices.push(windowDummy.matrix.clone());}
    for(const x of doorXs){const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;const xx=x+.54*Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.28);const yy=.42+1.22*Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.28);const b=bodyAt(xx);pts.push(bodyPoint(xx,side*Math.acos(clamp((yy-b.cy)/b.ry,-1,1)),.037));}line(pts,panelMat,aircraft,true);}
    const panes=[[[27.95,.20],[29.12,.34],[28.72,.94],[27.83,.94]],[[26.55,.55],[27.76,.24],[27.64,.97],[26.42,1.1]]];
    for(const corners of panes){const pp=[],ii=[],n=8;for(let u=0;u<=n;u++)for(let v=0;v<=n;v++){const p=u/n,s=v/n;const x=lerp(lerp(corners[0][0],corners[1][0],p),lerp(corners[3][0],corners[2][0],p),s);const theta=lerp(lerp(corners[0][1],corners[1][1],p),lerp(corners[3][1],corners[2][1],p),s);pp.push(...bodyPoint(x,side*theta,.033).toArray());}for(let u=0;u<n;u++)for(let v=0;v<n;v++){const a=u*(n+1)+v,b=a+n+1;ii.push(a,a+1,b,a+1,b+1,b);}const m=mesh(geo(pp,ii),glass);m.material.side=THREE.DoubleSide;}
  }
  const passengerWindows=new THREE.InstancedMesh(windowGeo,glass,windowMatrices.length);
  windowMatrices.forEach((matrix,i)=>passengerWindows.setMatrixAt(i,matrix));
  passengerWindows.instanceMatrix.needsUpdate=true;
  aircraft.add(passengerWindows);
  ellipsoid(-30.9,.65,0,.7,.17,.17,silver);
  const wingStations=[[2.25,8.6,-9.9,-.68],[3.5,7.5,-10.0,-.62],[10,3.1,-10.25,-.27],[10.3,2.9,-10.25,-.25],[18,-2.6,-11.9,.23],[25,-7.9,-13.2,.9],[28,-10.9,-14,1.45],[30.05,-14.2,-14.72,2.05]];
  function wingAt(z){z=Math.abs(z);let i=0;while(i<wingStations.length-2&&wingStations[i+1][0]<z)i++;const a=wingStations[i],b=wingStations[i+1];const t=clamp((z-a[0])/(b[0]-a[0]),0,1);return {le:lerp(a[1],b[1],t),te:lerp(a[2],b[2],t),y:lerp(a[3],b[3],t)};}
  const deformables=[];
  function wingSurface(z0,z1,c0,c1,side,isFlap=false,material=wingMat){
    const pos=[],idx=[];const ns=Math.ceil((z1-z0)*1.3)+2,nc=12;
    for(let face=0;face<2;face++)for(let i=0;i<=ns;i++){const z=lerp(z0,z1,i/ns);const w=wingAt(z),chord=w.le-w.te;
      for(let j=0;j<=nc;j++){const c=lerp(c0,c1,j/nc),t=.105- .045*z/30;const thick=5*t*chord*(.2969*Math.sqrt(c)-.126*c-.3516*c*c+.2843*c*c*c-.1036*c*c*c*c);const camber=.022*chord*Math.sin(c*Math.PI);pos.push(w.le-c*chord,w.y+camber+(face===0?thick:-thick*.65),z*side);}}
    const layer=(ns+1)*(nc+1);
    for(let f=0;f<2;f++)for(let i=0;i<ns;i++)for(let j=0;j<nc;j++){const a=f*layer+i*(nc+1)+j,b=a+nc+1;const tri=[a,b,a+1,a+1,b,b+1];if((f===1)!==(side<0)){for(let k=0;k<6;k+=3)[tri[k+1],tri[k+2]]=[tri[k+2],tri[k+1]];}idx.push(...tri);}
    for(let i=0;i<ns;i++)for(const j of [0,nc]){const a=i*(nc+1)+j,b=a+nc+1;idx.push(a,b,a+layer,b,b+layer,a+layer);}
    const g=geo(pos,idx);const m=mesh(g,material);material.side=THREE.DoubleSide;deformables.push({obj:m,base:Float32Array.from(pos),flap:isFlap});return m;
  }
  function wingLine(z0,z1,c,side){const pts=[];for(let z=z0;z<=z1+.01;z+=(z1-z0)/40){const w=wingAt(z),ch=w.le-w.te;const th=5*(.105-.045*z/30)*ch*(.2969*Math.sqrt(c)-.126*c-.3516*c*c+.2843*c*c*c-.1036*c*c*c*c);pts.push(V(w.le-c*ch,w.y+th+.022*ch*Math.sin(c*Math.PI)+.018,z*side));}const l=line(pts,lineMat);deformables.push({obj:l,base:l.geometry.attributes.position.array.slice(),flap:false});}
  for(const side of [-1,1]){
    wingSurface(2.25,3.5,0,1,side);wingSurface(3.5,10,0,.76,side);wingSurface(10,10.3,0,1,side);wingSurface(10.3,18,0,.76,side);wingSurface(18,30.05,0,1,side);
    wingSurface(3.52,9.98,.765,1,side,true);wingSurface(10.32,17.98,.765,1,side,true);
    wingLine(2.5,29.6,.13,side);wingLine(3.5,27,.68,side);wingLine(18,28,.83,side);
    ellipsoid(-3.5,-1.12,side*2.45,9,1.0,1.0,wingMat);
    for(const z of [5.8,9.7,14.6]){const w=wingAt(z);const f=ellipsoid(w.te+.9,w.y-.28,z*side,2.1,.24,.24,wingMat);f.userData.flexZ=z;f.userData.baseY=f.position.y;}
  }
  function solidFin(points,halfWidth,material){const positions=[],idx=[];for(const s of [-1,1])for(const p of points)positions.push(p[0],p[1],s*halfWidth);const n=points.length;for(let i=1;i<n-1;i++)idx.push(0,i+1,i,n,n+i,n+i+1);for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+i,j,n+j,n+i);}return mesh(geo(positions,idx),material);}
  solidFin([[-16.3,2.1],[-19.8,3.45],[-26.4,11.25],[-28.5,11.5],[-29.1,9.9],[-28.6,1.1]],.19,blueMat);
  line([V(-27.5,10.7,.205),V(-27.05,3,.205)],lineMat);
  line([V(-27.5,10.7,-.205),V(-27.05,3,-.205)],lineMat);
  const tailCanvas=document.createElement('canvas');tailCanvas.width=512;tailCanvas.height=256;const tc=tailCanvas.getContext('2d');
  const tailTex=new THREE.CanvasTexture(tailCanvas);tailTex.colorSpace=THREE.SRGBColorSpace;
  function paintTail(){tc.clearRect(0,0,512,256);tc.fillStyle=palette.white.getStyle();tc.font='italic 500 150px Arial';tc.textAlign='center';tc.textBaseline='middle';tc.fillText('787',256,132);tailTex.needsUpdate=true;}
  paintTail();const tailLabelMat=new THREE.MeshBasicMaterial({map:tailTex,transparent:true,depthWrite:false});
  for(const side of [-1,1]){const m=mesh(new THREE.PlaneGeometry(5.1,2.55),tailLabelMat);m.position.set(-25.65,6.35,side*.205);if(side<0)m.rotation.y=Math.PI;}
  function stabilizer(side){const stations=[[1.5,-21.5,-29.3,1.25],[6,-24,-30,1.95],[11.7,-27.9,-30.9,2.65],[12.9,-29.3,-31,2.9]];const p=[],idx=[];for(let f=0;f<2;f++)for(const [z,le,te,y] of stations){p.push(le,y,side*z,lerp(le,te,.3),y+(f===0?.24:-.14),side*z,te,y,side*z);}for(let f=0;f<2;f++)for(let i=0;i<3;i++)for(let c=0;c<2;c++){const a=f*12+i*3+c,b=a+3;idx.push(a,b,a+1,a+1,b,b+1);}const m=mesh(geo(p,idx),wingMat);wingMat.side=THREE.DoubleSide;line(stations.map(([z,le,te,y])=>V(lerp(le,te,.76),y+.1,z*side)),lineMat);return m;}
  stabilizer(-1);stabilizer(1);
  const fans=[],engines=[];
  const nacelleSkin=mat(palette.white,.18,.28);
  function ringShell(profile,material,parent,chevron=false){const p=[],idx=[];const sides=64;for(let i=0;i<profile.length;i++){for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;let [x,r]=profile[i];if(chevron&&i===0)x-=.46*(.5+.5*Math.cos(a*16));p.push(x,r*Math.cos(a),r*Math.sin(a));}}for(let i=0;i<profile.length-1;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,a+1,b+1,a,b+1,b);}material.side=THREE.DoubleSide;return mesh(geo(p,idx),material,parent);}
  for(const side of [-1,1]){
    const eng=new THREE.Group();eng.position.set(3.65,-3.0,side*9.3);aircraft.add(eng);engines.push(eng);
    ringShell([[-2.9,1.39],[-2.1,1.65],[-.5,1.78],[1.55,1.75],[2.65,1.62]],nacelleSkin,eng,true);
    ringShell([[2.35,1.41],[2.63,1.43],[2.82,1.51],[2.78,1.57],[2.65,1.62]],silver,eng);
    ringShell([[.9,1.31],[1.6,1.38],[2.35,1.41]],darkMat,eng);
    ringShell([[-3.5,.77],[-2.6,.93],[-1.1,1.0]],fanMat,eng);
    const cone=mesh(new THREE.ConeGeometry(.77,1.6,40),silver,eng);cone.rotation.z=Math.PI/2;cone.position.x=-3.75;
    const fan=new THREE.Group();fan.position.x=1.8;eng.add(fan);fans.push(fan);
    const back=mesh(new THREE.CircleGeometry(1.36,48),darkMat,fan);back.rotation.y=Math.PI/2;back.position.x=-.15;
    const bladePositions=[],bladeIndices=[];
    for(let i=0;i<20;i++){const a=i/20*Math.PI*2;const offset=bladePositions.length/3;for(const [r,da,x] of [[.28,0,.02],[.65,.035,.05],[1.34,.19,-.02],[1.33,.39,-.14],[.65,.24,-.08],[.28,.26,0]])bladePositions.push(x,r*Math.cos(a+da),r*Math.sin(a+da));bladeIndices.push(...[0,1,5,1,2,4,2,3,4,1,4,5].map(j=>j+offset));}
    mesh(geo(bladePositions,bladeIndices),fanMat,fan);
    const spinner=mesh(new THREE.ConeGeometry(.39,.85,32),silver,fan);spinner.rotation.z=-Math.PI/2;spinner.position.x=.31;
    const spiral=[];for(let i=0;i<45;i++){const a=i/44*Math.PI*3,r=.018+i/44*.25;spiral.push(V(.73-r*.94,r*Math.cos(a),r*Math.sin(a)));}line(spiral,new THREE.LineBasicMaterial({color:palette.ink}),fan);
    const pylon=mesh(new THREE.BoxGeometry(3.7,1.7,.43),wingMat,eng);pylon.position.set(-.65,1.85,0);pylon.rotation.z=-.12;
  }
  const gearAssemblies=[],gearDoors=[];
  function wheel(parent,x,y,z,r,width){const tire=mesh(new THREE.CylinderGeometry(r,r,width,24,1),rubber,parent);tire.rotation.x=Math.PI/2;tire.position.set(x,y,z);for(const s of [-1,1]){const hub=mesh(new THREE.CylinderGeometry(r*.49,r*.49,.045,20),silver,parent);hub.rotation.x=Math.PI/2;hub.position.set(x,y,z+s*(width/2+.025));}return tire;}
  for(const side of [-1,1]){
    const g=new THREE.Group();g.position.set(-4.9,-1.81,side*4.25);aircraft.add(g);gearAssemblies.push({group:g,side,type:'main'});
    rod(V(0,0,0),V(0,-3.6,0),.19,silver,g);rod(V(0,-.8,0),V(.8,-2.4,-side*.25),.1,silver,g);rod(V(.8,-2.4,-side*.25),V(0,-3.4,0),.11,silver,g);
    const bogie=new THREE.Group();bogie.position.y=-3.7;g.add(bogie);rod(V(-.95,0,0),V(.95,0,0),.16,silver,bogie);
    for(const xx of [-.82,.82])for(const zz of [-.48,.48])wheel(bogie,xx,0,zz,.64,.4);
    const door=mesh(new THREE.BoxGeometry(3,.1,1.5),wingMat);door.position.set(-4.7,-2.4,side*3.8);gearDoors.push({mesh:door,side});
  }
  const noseGear=new THREE.Group();noseGear.position.set(23.3,-2.12,0);aircraft.add(noseGear);gearAssemblies.push({group:noseGear,side:0,type:'nose'});
  rod(V(0,0,0),V(0,-3.45,0),.13,silver,noseGear);rod(V(-1.25,0,0),V(0,-2.65,0),.08,silver,noseGear);
  for(const z of [-.3,.3])wheel(noseGear,0,-3.6,z,.43,.23);
  const noseDoor=mesh(new THREE.BoxGeometry(2.2,.08,.8),wingMat);noseDoor.position.set(23.3,-2.75,0);gearDoors.push({mesh:noseDoor,side:0});
  const navLights=[];
  for(const side of [-1,1]){const material=new THREE.MeshBasicMaterial({color:side<0?palette.red:palette.green});const m=ellipsoid(-14.42,2.07,30.03*side,.13,.095,.1,material);navLights.push(m);}
  const beaconMat=new THREE.MeshBasicMaterial({color:palette.red});const beacon=ellipsoid(2,3.05,0,.13,.1,.13,beaconMat);

  // Combine static details sharing materials. Moving groups retain their own transforms.
  function combineMeshes(parent, recursive=false, exclude=new Set()) {
    parent.updateMatrixWorld(true);
    const inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const candidates=[];
    if(recursive) parent.traverse(object=>{if(object.isMesh&&!object.isInstancedMesh&&!exclude.has(object))candidates.push(object);});
    else for(const object of parent.children){if(object.isMesh&&!object.isInstancedMesh&&!exclude.has(object))candidates.push(object);}
    const buckets=new Map();
    for(const object of candidates){const material=object.material;if(Array.isArray(material))continue;if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(object);}
    for(const [material,objects] of buckets){
      if(objects.length<2)continue;
      const positions=[],normals=[],uvs=[];
      for(const object of objects){
        const original=object.geometry;
        const geometry=original.index?original.toNonIndexed():original;
        const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
        const matrix=new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld);
        const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
        const vertex=new THREE.Vector3(),normal=new THREE.Vector3();
        for(let i=0;i<p.count;i++){
          vertex.fromBufferAttribute(p,i).applyMatrix4(matrix);positions.push(vertex.x,vertex.y,vertex.z);
          if(n)normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();else normal.set(0,1,0);
          normals.push(normal.x,normal.y,normal.z);uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
        }
        if(geometry!==original)geometry.dispose();
        object.removeFromParent();
      }
      const merged=new THREE.BufferGeometry();
      merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      merged.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      merged.computeBoundingSphere();mesh(merged,material,parent);
    }
  }
  for(const engine of engines)combineMeshes(engine);
  for(const fan of fans)combineMeshes(fan);
  for(const assembly of gearAssemblies)combineMeshes(assembly.group,true);
  const preserve=new Set([...deformables.map(d=>d.obj),...navLights,beacon,...gearDoors.map(d=>d.mesh)]);
  for(const part of aircraft.children)if(part.userData.flexZ)preserve.add(part);
  combineMeshes(aircraft,false,preserve);

  let elapsed=0,fanAngle=0,gearAmount=1,flapAngle=0,flexAmount=0;
  let lastFlex=-100,lastFlap=-100,firstFrame=true;
  function update(dt,controls={}) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);
    elapsed+=dt;
    const throttle=clamp(Number(controls.throttle)||0,0,1);
    const speed=Math.max(0,Number(controls.speed)||0);
    const airborne=Boolean(controls.airborne);
    const gearTarget=controls.gear===undefined?1:clamp(Number(controls.gear),0,1);
    const flapValue=Math.max(0,Number(controls.flaps)||0);
    const flapTarget=clamp(flapValue<=1?flapValue*30:flapValue,0,30);
    const flexTarget=airborne?clamp(speed/95,.35,1)*2.8:clamp(speed/90,0,1)*.65;
    const transition=firstFrame?1:1-Math.exp(-dt*2.2);
    gearAmount=lerp(gearAmount,gearTarget,firstFrame?1:1-Math.exp(-dt*1.1));
    flapAngle=lerp(flapAngle,flapTarget,transition);
    flexAmount=lerp(flexAmount,flexTarget,transition);
    const flex=flexAmount+(airborne?Math.sin(elapsed*1.8)*.06:0);
    if(Math.abs(flex-lastFlex)>.012||Math.abs(flapAngle-lastFlap)>.03){
      for(const d of deformables){
        const a=d.obj.geometry.attributes.position,b=d.base;
        for(let i=0;i<a.count;i++){
          const x=b[i*3],y=b[i*3+1],z=b[i*3+2];let xx=x,yy=y;
          if(d.flap){const w=wingAt(z),hinge=w.le-(w.le-w.te)*.76,angle=flapAngle*Math.PI/180;xx=hinge+(x-hinge)*Math.cos(angle)-(y-w.y)*Math.sin(angle)-.55*flapAngle/30;yy=w.y+(x-hinge)*Math.sin(angle)+(y-w.y)*Math.cos(angle)-.12*flapAngle/30;}
          yy+=flex*Math.pow(Math.abs(z)/30.05,2.5);a.setXYZ(i,xx,yy,z);
        }
        a.needsUpdate=true;
        if(d.obj.isMesh)d.obj.geometry.computeVertexNormals();
        d.obj.geometry.computeBoundingSphere();
      }
      for(const engine of engines)engine.position.y=-3+flex*Math.pow(9.3/30.05,2.5);
      for(const nav of navLights)nav.position.y=2.07+flex;
      for(const part of aircraft.children)if(part.userData.flexZ)part.position.y=part.userData.baseY+flex*Math.pow(part.userData.flexZ/30.05,2.5);
      lastFlex=flex;lastFlap=flapAngle;
    }
    for(const assembly of gearAssemblies){
      assembly.group.visible=gearAmount>.015;
      if(assembly.type==='main'){
        assembly.group.rotation.x=-assembly.side*(1-gearAmount)*Math.PI*.49;
        assembly.group.position.y=-1.81+(1-gearAmount)*.9;
      }else{
        assembly.group.rotation.z=-(1-gearAmount)*Math.PI*.49;
        assembly.group.position.y=-2.12+(1-gearAmount)*.5;
      }
    }
    for(const door of gearDoors){
      if(door.side){door.mesh.rotation.x=door.side*gearAmount*1.3;door.mesh.position.y=-2.4-gearAmount*.36;}
      else{door.mesh.rotation.z=-gearAmount*1.4;door.mesh.position.y=-2.75-gearAmount*.45;}
    }
    fanAngle=(fanAngle+dt*(3+throttle*38+speed*.035))%(Math.PI*2);
    for(const fan of fans)fan.rotation.x=fanAngle;
    beacon.visible=elapsed%1.4<.14;
    firstFrame=false;
  }
  function dispose(){
    const geometries=new Set(allGeometries),materials=new Set(),textures=new Set([liveryTexture,tailTex]);
    aircraft.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);if(material.map)textures.add(material.map);}}});
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    for(const texture of textures)texture.dispose();
    aircraft.removeFromParent();
  }
  update(0,{gear:true});
  return {group:aircraft,update,dispose};
}
