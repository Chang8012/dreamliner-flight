import * as THREE from './vendor/three.module.js';
import {createAircraft} from './aircraft.js';
import {createFlight} from './flight.js';
import {createWorld} from './world.js';

const $=id=>document.getElementById(id);
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const DEG=180/Math.PI;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys=new Set();
const touch={pitch:0,roll:0,brake:false};
const flight=createFlight(),state=flight.state;
let mode='menu',startMode='runway',cameraMode=0,soundEnabled=false;
let gateIndex=0,elapsed=0,airborneOnce=false,noticeUntil=0,lastWarning='';
let pausedForHelp=false,screenW=innerWidth,screenH=innerHeight;
let audio=null,accumulator=0,frameTime=0,uiClock=0,menuTime=0;
let renderer,aircraft,world,scene,camera,camLook=V();
const nextPosition=V(),yawQ=new THREE.Quaternion(),pitchQ=new THREE.Quaternion(),rollQ=new THREE.Quaternion();
const desiredCamera=V(),desiredLook=V(),axisY=V(0,1,0),axisZ=V(0,0,1),axisX=V(1,0,0);
const gateData=[[0,180,0],[1800,400,0],[3700,600,-600],[4300,700,-2700],[2900,650,-4400],[200,520,-4700],[-2400,400,-4100],[-4000,300,-2400],[-4100,220,-300],[-2600,130,0]];
const gates=[];
let lastPos=V();
let highest=0;

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#b7d9e3');
  scene.fog=new THREE.FogExp2('#b7d9e3',.000075);
  camera=new THREE.PerspectiveCamera(53,screenW/screenH,1,28000);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.setSize(screenW,screenH);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('scene').append(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#f3fcff','#577e77',2));
  const sun=new THREE.DirectionalLight('#fff4dc',3.5);
  sun.position.set(600,950,400);scene.add(sun);
  const fill=new THREE.DirectionalLight('#b9dfed',.7);fill.position.set(-400,140,-700);scene.add(fill);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(24000,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#699fbd')},bottom:{value:new THREE.Color('#d0e4e7')}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPos;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(vPos).y,0.0,1.0);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.0);}'}));
  scene.add(sky);
  world=createWorld(THREE,scene);
  aircraft=createAircraft(THREE);scene.add(aircraft.group);
  createGates();
  flight.reset('air');syncAircraft(0);
  updateCamera(1,true);
  $('loading').hidden=true;
  document.body.dataset.mode='menu';
  window.addEventListener('resize',resize);
  setupControls();
  requestAnimationFrame(loop);
  window.__flightGame={state,start,terrainHeight:world.terrainHeight,get mode(){return mode},get gateIndex(){return gateIndex},get aircraft(){return aircraft.group},get camera(){return camera},setPaused};
}

function createGates(){
  const torus=new THREE.TorusGeometry(200,4.8,8,80);
  const beads=new THREE.TorusGeometry(212,1,4,80);
  for(let i=0;i<gateData.length;i++){
    const g=new THREE.Group();g.position.fromArray(gateData[i]);
    const previous=i===0?V(-1300,110,0):V(...gateData[i-1]);
    const normal=g.position.clone().sub(previous).normalize();
    g.quaternion.setFromUnitVectors(V(0,0,1),normal);
    const mat=new THREE.MeshBasicMaterial({color:'#c3ffdf',transparent:true,opacity:.9,fog:true});
    const ring=new THREE.Mesh(torus,mat);g.add(ring);
    const outer=new THREE.Mesh(beads,new THREE.MeshBasicMaterial({color:'#e4fff0',transparent:true,opacity:.35}));g.add(outer);
    const center=new THREE.Mesh(new THREE.OctahedronGeometry(10),new THREE.MeshBasicMaterial({color:'#b8eed8',transparent:true,opacity:.6}));g.add(center);
    scene.add(g);gates.push({group:g,normal,mat,center,passed:false});
  }
}

function start(which='runway'){
  startMode=which;flight.reset(which);gateIndex=0;elapsed=0;highest=0;airborneOnce=which==='air';
  keys.clear();touch.pitch=touch.roll=0;touch.brake=false;
  for(const g of gates){g.passed=false;g.group.visible=true;}
  mode='flying';document.body.dataset.mode=mode;
  $('menu').hidden=true;$('menu-footer').hidden=true;$('hud').hidden=false;$('overlay').hidden=true;
  $('guide').close();cameraMode=0;updateViewLabel();
  lastPos.set(state.x,state.y,state.z);syncAircraft(0);updateCamera(1,true);updateUI();
  showNotice(which==='runway'?'按住 Shift 加油门，达到 135 KT 后按 W 抬头':'W / S 控制俯仰，A / D 转弯，朝绿色航点飞行',8);
  if(soundEnabled)ensureAudio();
}

function showMenu(){
  mode='menu';document.body.dataset.mode=mode;keys.clear();touch.pitch=touch.roll=0;
  flight.reset('air');aircraft.group.visible=true;
  $('menu').hidden=false;$('menu-footer').hidden=false;$('hud').hidden=true;$('overlay').hidden=true;
  $('flight-label').textContent='海岛飞行 · 09 跑道';
  syncAircraft(0);updateCamera(1,true);
}

function setPaused(paused){
  if(paused&&mode==='flying'){
    mode='paused';keys.clear();touch.pitch=touch.roll=0;touch.brake=false;
    showOverlay('FLIGHT PAUSED','稍作停留','调整呼吸，准备下一段航程。',true);
  }else if(!paused&&mode==='paused'){
    mode='flying';$('overlay').hidden=true;
  }
  document.body.dataset.mode=mode;
}

function showOverlay(eyebrow,title,body,resume=false){
  $('overlay-eyebrow').textContent=eyebrow;$('overlay-title').textContent=title;$('overlay-body').textContent=body;
  $('resume').hidden=!resume;$('overlay').hidden=false;
  $('result-stats').hidden=resume;
  if(!resume)$('result-stats').innerHTML='<span><b>'+gateIndex+'/'+gates.length+'</b>航点完成</span><span><b>'+formatTime(elapsed)+'</b>飞行时长</span>';
}

function finish(success,reason=''){
  if(mode!=='flying')return;
  mode=success?'complete':'crashed';keys.clear();touch.pitch=touch.roll=0;touch.brake=false;
  document.body.dataset.mode=mode;
  showOverlay(success?'WELCOME HOME':'FLIGHT ENDED',success?'漂亮的降落。':'再飞一次。',success?'所有航点已完成，飞机已在 09 跑道安全停稳。':reason,false);
  if(success)beep(660,.15);
}

function showNotice(text,seconds=4,warning=false){
  $('notice').textContent=text;$('notice').classList.toggle('warning',warning);$('notice').classList.add('show');noticeUntil=performance.now()+seconds*1000;
}

function getInput(){return{
  pitch:clamp((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+touch.pitch,-1,1),
  roll:clamp((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.roll,-1,1),
  yaw:(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0),
  throttleDelta:(keys.has('ShiftLeft')||keys.has('ShiftRight')?1:0)-(keys.has('KeyX')?1:0),
  brake:keys.has('Space')||touch.brake
};}

function simulate(dt){
  const input=getInput();lastPos.set(state.x,state.y,state.z);
  flight.step(dt,input,world.terrainHeight);elapsed+=dt;
  const ground=world.terrainHeight(state.x,state.z),alt=state.y-ground-6.15;
  highest=Math.max(highest,alt);
  if(!state.onGround)airborneOnce=true;
  const onRunway=Math.abs(state.z)<32.5&&state.x>-1700&&state.x<1700;
  if(state.crashed){finish(false,state.crashReason+'。放缓操作，再试一次。');return;}
  if(state.onGround&&ground<=-7.5){finish(false,'触及水面。留意离地高度，保持足够的空速。');return;}
  if(state.landed&&!onRunway){finish(false,'降落在跑道外。下次对准标记为 09 的跑道，保持机翼水平。');return;}
  if(state.onGround&&state.speed>55&&!onRunway&&!state.landed){finish(false,'滑跑偏离跑道。用 A / D 或 Q / E 修正方向，在 135 KT 左右抬头。');return;}
  if(state.landed&&onRunway&&state.speed<4&&gateIndex===gates.length){finish(true);return;}
  if(gateIndex<gates.length&&!state.onGround){
    const gate=gates[gateIndex],pos=gate.group.position;
    const before=lastPos.clone().sub(pos).dot(gate.normal),after=V(state.x,state.y,state.z).sub(pos).dot(gate.normal);
    if((before<0&&after>=0)||(before>0&&after<=0)){const u=-before/(after-before);const hit=lastPos.clone().lerp(V(state.x,state.y,state.z),u);if(hit.distanceTo(pos)<197){gate.passed=true;gate.group.visible=false;gateIndex++;beep(600+gateIndex*45,.1);showNotice(gateIndex===gates.length?'航点全部完成！对准 09 跑道，放起落架并减速降落。':'航点 '+gateIndex+' / '+gates.length+' 完成',4);}}
  }
  if(Math.abs(state.x)>9500||Math.abs(state.z)>9500)showWarning('已接近飞行区域边缘，请返回机场');
  else if(!state.onGround&&state.speed<64-state.flaps*7)showWarning('空速过低：加油门，适当压低机头');
  else if(!state.onGround&&alt<65&&state.verticalSpeed<-7)showWarning('下降过快：抬头并增加油门');
  else lastWarning='';
}

function showWarning(text){if(lastWarning!==text){lastWarning=text;showNotice(text,4,true);}}

function syncAircraft(dt){
  aircraft.group.position.set(state.x,state.y,state.z);
  yawQ.setFromAxisAngle(axisY,state.heading);pitchQ.setFromAxisAngle(axisZ,state.pitch);rollQ.setFromAxisAngle(axisX,state.roll);
  aircraft.group.quaternion.copy(yawQ).multiply(pitchQ).multiply(rollQ);
  aircraft.group.visible=cameraMode!==2||mode==='menu';
  aircraft.update(dt,{throttle:state.throttle,speed:state.speed,gear:state.gear,flaps:state.flaps,airborne:!state.onGround});
}

function updateCamera(dt,snap=false){
  const p=aircraft.group.position;
  if(mode==='menu'){
    const drift=reduced?0:Math.sin(menuTime*.14)*10;
    desiredCamera.set(p.x+87+drift,p.y+33,p.z+86-drift);
    desiredLook.set(p.x-25,p.y-6,p.z+22);
    camera.fov=screenW<650?61:53;
  }else{
    yawQ.setFromAxisAngle(axisY,state.heading);
    if(cameraMode===0){desiredCamera.set(-105,34,0).applyQuaternion(yawQ).add(p);desiredLook.set(65,3,0).applyQuaternion(yawQ).add(p);}
    if(cameraMode===1){desiredCamera.set(22,24,125).applyQuaternion(yawQ).add(p);desiredLook.copy(p).add(V(0,3,0));}
    if(cameraMode===2){desiredCamera.set(27.5,2.5,0).applyQuaternion(aircraft.group.quaternion).add(p);desiredLook.set(250,2.5,0).applyQuaternion(aircraft.group.quaternion).add(p);}
    const floor=world.terrainHeight(desiredCamera.x,desiredCamera.z)+5;
    desiredCamera.y=Math.max(floor,desiredCamera.y);
    camera.fov=screenW<650?67:58;
  }
  const blend=snap?1:1-Math.exp(-dt*(cameraMode===2?14:4));
  camera.position.lerp(desiredCamera,blend);camLook.lerp(desiredLook,blend);camera.lookAt(camLook);camera.updateProjectionMatrix();
}

function updateGates(time){for(let i=0;i<gates.length;i++){const g=gates[i];g.group.visible=mode!=='menu'&&!g.passed&&i<=gateIndex+1;g.mat.opacity=i===gateIndex?.82+Math.sin(time*2)*.12:.16;g.center.visible=i===gateIndex;g.center.rotation.y=time*.45;g.center.rotation.x=time*.3;}}

function updateTargetLabel(){
  const target=gateIndex<gates.length?gates[gateIndex].group.position:V(-1450,18,0);
  nextPosition.copy(target).project(camera);
  const visible=nextPosition.z>-1&&nextPosition.z<1&&Math.abs(nextPosition.x)<.85&&Math.abs(nextPosition.y)<.78;
  $('gate-label').hidden=!visible;
  $('direction-cue').hidden=visible;
  const dist=Math.hypot(target.x-state.x,target.y-state.y,target.z-state.z);
  const range=dist>=1000?(dist/1000).toFixed(1)+' km':Math.round(dist)+' m';
  if(visible){$('gate-label').style.left=clamp((nextPosition.x*.5+.5)*screenW,60,screenW-120)+'px';$('gate-label').style.top=clamp((-.5*nextPosition.y+.5)*screenH+18,190,screenH-140)+'px';$('gate-number').textContent=gateIndex<gates.length?String(gateIndex+1).padStart(2,'0'):'09';$('gate-distance').textContent=range;}
  else{
    const wanted=Math.atan2(-(target.z-state.z),target.x-state.x);
    const delta=Math.atan2(Math.sin(wanted-state.heading),Math.cos(wanted-state.heading));
    $('cue-arrow').textContent=Math.abs(delta)<.25?'↑':delta>0?'←':'→';
    $('cue-label').textContent=(gateIndex<gates.length?'下一航点':'返回跑道')+' · '+range;
  }
}

function updateUI(){
  const alt=Math.max(0,state.y-world.terrainHeight(state.x,state.z)-6.15);
  $('airspeed').textContent=String(Math.round(state.speed*1.94384)).padStart(3,'0');
  $('altitude').textContent=String(Math.round(alt)).padStart(3,'0');
  $('vertical-speed').textContent=(state.verticalSpeed>=0?'+':'')+state.verticalSpeed.toFixed(1);
  const hdg=((90-state.heading*DEG)%360+360)%360;
  $('heading-value').textContent=String(Math.round(hdg)%360).padStart(3,'0')+'°';
  $('throttle-value').textContent=Math.round(state.throttle*100)+'%';
  $('throttle').value=Math.round(state.throttle*100);
  $('gear').setAttribute('aria-pressed',String(state.gear));$('gear').querySelector('b').textContent=state.gear?'放下':'收起';
  $('flaps').setAttribute('aria-pressed',String(state.flaps>0));$('flaps').querySelector('b').textContent=state.flaps>0?'放下':'收起';
  $('brake').setAttribute('aria-pressed',String(keys.has('Space')||touch.brake));
  $('mission-count').textContent=String(gateIndex).padStart(2,'0')+' / '+gates.length;
  $('mission-bar').style.width=(gateIndex/gates.length*100)+'%';
  $('elapsed').textContent=formatTime(elapsed);
  $('flight-label').textContent='787-9 · '+(state.onGround?'地面滑跑':'海岛飞行');
  let title='飞向绿色圆环 · 航点 '+(gateIndex+1);
  if(gateIndex===gates.length)title='返回 09 跑道 · 平稳降落并刹停';
  else if(state.onGround&&!airborneOnce)title=state.speed<69?'加油门，达到 135 KT':'按 W / ↑ 抬头，准备起飞';
  else if(airborneOnce&&state.landed)title='继续起飞，完成剩余航点';
  $('mission-title').textContent=title;
  $('speed-note').textContent=state.onGround?(state.speed<69?'起飞参考 135 KT':'可以抬头'):(state.speed<65?'低速 · 增加油门':'保持平稳飞行');
  $('attitude-world').style.transform='rotate('+(-state.roll*DEG)+'deg) translateY('+(state.pitch*DEG*1.3)+'px)';
  updateTargetLabel();drawMap();
}

function formatTime(t){const n=Math.floor(t);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}

function drawMap(){
  const c=$('map'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);
  const px=x=>w*.5+x/12000*w,py=z=>h*.5+z/12000*h;
  ctx.fillStyle='#1d4b54';ctx.beginPath();ctx.ellipse(px(-200),py(-500),w*.35,h*.3,-.14,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#b3e2dd12';ctx.lineWidth=1;
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*w/5,0);ctx.lineTo(i*w/5,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*h/5);ctx.lineTo(w,i*h/5);ctx.stroke();}
  ctx.strokeStyle='#c8e9df33';ctx.setLineDash([3,4]);ctx.beginPath();gateData.forEach((p,i)=>i?ctx.lineTo(px(p[0]),py(p[2])):ctx.moveTo(px(p[0]),py(p[2])));ctx.lineTo(px(-1450),py(0));ctx.stroke();ctx.setLineDash([]);
  for(let i=0;i<gateData.length;i++){const p=gateData[i];ctx.fillStyle=i<gateIndex?'#608f87':i===gateIndex?'#bcffdb':'#749b9e';ctx.beginPath();ctx.arc(px(p[0]),py(p[2]),i===gateIndex?3.6:2,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#eff4db';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px(-1700),py(0));ctx.lineTo(px(1700),py(0));ctx.stroke();
  const x=clamp(px(state.x),7,w-7),y=clamp(py(state.z),7,h-7);
  ctx.save();ctx.translate(x,y);ctx.rotate(-state.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-2,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.restore();
}

function toggleGear(){if(mode!=='flying')return;if(state.onGround){showNotice('离地后再收起起落架',3);return;}state.gear=!state.gear;showNotice('起落架'+(state.gear?'已放下':'已收起'),2);updateUI();}
function toggleFlaps(){if(mode!=='flying')return;state.flaps=state.flaps>0?0:1;showNotice('襟翼'+(state.flaps>0?'已放下':'已收起'),2);updateUI();}
function cycleView(){cameraMode=(cameraMode+1)%3;updateViewLabel();}
function updateViewLabel(){$('view').innerHTML=['追踪视角','机外侧视','驾驶视角'][cameraMode]+' <kbd>C</kbd>';}

function setupControls(){
  document.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',()=>start(b.dataset.start)));
  $('home').addEventListener('click',e=>{e.preventDefault();if(mode!=='menu'){setPaused(true);showNotice('可在暂停菜单返回主菜单',3);}});
  $('pause').addEventListener('click',()=>setPaused(mode==='flying'));
  $('resume').addEventListener('click',()=>setPaused(false));
  $('restart').addEventListener('click',()=>start(startMode));
  $('back-menu').addEventListener('click',showMenu);
  $('gear').addEventListener('click',toggleGear);$('flaps').addEventListener('click',toggleFlaps);$('view').addEventListener('click',cycleView);
  $('throttle').addEventListener('input',()=>{if(mode==='flying'){state.throttle=Number($('throttle').value)/100;updateUI();}});
  $('brake').addEventListener('pointerdown',e=>{if(mode!=='flying')return;touch.brake=true;$('brake').setPointerCapture(e.pointerId);});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('brake').addEventListener(ev,()=>touch.brake=false);
  $('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound').textContent='声音 '+(soundEnabled?'开':'关');$('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').setAttribute('aria-label',soundEnabled?'关闭声音':'开启声音');if(soundEnabled)ensureAudio();});
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch{showNotice('当前浏览器不支持全屏',3);}});
  $('help').addEventListener('click',()=>{pausedForHelp=mode==='flying';if(pausedForHelp)setPaused(true);$('guide').showModal();});
  const closeGuide=()=>{$('guide').close();};
  $('close-guide').addEventListener('click',closeGuide);$('guide-ok').addEventListener('click',closeGuide);
  $('guide').addEventListener('close',()=>{if(pausedForHelp){pausedForHelp=false;setPaused(false);}});
  const gameCodes=['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyX','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyG','KeyF','KeyC','KeyP','Escape','KeyR'];
  window.addEventListener('keydown',e=>{
    if($('guide').open)return;
    if(!gameCodes.includes(e.code)||mode==='menu')return;
    if(e.ctrlKey&&['KeyR','KeyW','KeyF'].includes(e.code))return;
    if(e.target.tagName==='INPUT'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
    e.preventDefault();
    if(!e.repeat){if(e.code==='Escape'||e.code==='KeyP'){setPaused(mode==='flying');return;}if(e.code==='KeyR'){start(startMode);return;}if(e.code==='KeyG')toggleGear();if(e.code==='KeyF')toggleFlaps();if(e.code==='KeyC')cycleView();}
    if(mode==='flying')keys.add(e.code);
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();touch.pitch=touch.roll=0;touch.brake=false;if(mode==='flying')setPaused(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='flying')setPaused(true);});
  const pad=$('touch-pad');let activePointer=null;
  const move=e=>{const b=pad.getBoundingClientRect(),radius=b.width*.34;let x=(e.clientX-b.left-b.width/2)/radius,y=(e.clientY-b.top-b.height/2)/radius;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}touch.roll=x;touch.pitch=-y;$('stick').style.transform='translate('+x*radius+'px,'+y*radius+'px)';};
  pad.addEventListener('pointerdown',e=>{if(mode!=='flying'||activePointer!==null)return;activePointer=e.pointerId;pad.setPointerCapture(e.pointerId);move(e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===activePointer)move(e);});
  const release=()=>{activePointer=null;touch.roll=touch.pitch=0;$('stick').style.transform='translate(0,0)';};
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(ev,release);
}

function ensureAudio(){
  if(audio){audio.context.resume().catch(()=>{});return;}
  try{
    const context=new (window.AudioContext||window.webkitAudioContext)();
    const gain=context.createGain(),filter=context.createBiquadFilter(),osc=context.createOscillator(),osc2=context.createOscillator();
    gain.gain.value=0;filter.type='lowpass';filter.frequency.value=250;osc.type='sawtooth';osc2.type='sine';osc.frequency.value=46;osc2.frequency.value=91;osc.connect(filter);osc2.connect(filter);filter.connect(gain);gain.connect(context.destination);osc.start();osc2.start();audio={context,gain,filter,osc,osc2};
  }catch{soundEnabled=false;$('sound').textContent='声音 关';}
}
function updateAudio(){if(!audio)return;const playing=soundEnabled&&mode==='flying';const t=audio.context.currentTime;audio.gain.gain.setTargetAtTime(playing?.018+state.throttle*.014:0,t,.15);audio.osc.frequency.setTargetAtTime(32+state.throttle*60,t,.2);audio.osc2.frequency.setTargetAtTime(64+state.throttle*120,t,.2);audio.filter.frequency.setTargetAtTime(130+state.throttle*260+state.speed,t,.2);}
function beep(freq,duration){if(!audio||!soundEnabled)return;const a=audio.context,o=a.createOscillator(),g=a.createGain();o.frequency.value=freq;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.045,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.start();o.stop(a.currentTime+duration);}

function resize(){screenW=$('scene').clientWidth;screenH=$('scene').clientHeight;camera.aspect=screenW/screenH;camera.updateProjectionMatrix();renderer.setSize(screenW,screenH);}
let last=0;
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1000||0,.05);last=now;frameTime+=dt;
  if(mode==='menu'){menuTime+=dt;state.y=260+(reduced?0:Math.sin(menuTime*.6)*1.5);syncAircraft(reduced?0:dt);}
  if(mode==='flying'){simulate(dt);syncAircraft(dt);}
  updateCamera(dt);updateGates(frameTime);
  if(mode==='flying'||mode==='menu')world.update(dt,frameTime);
  if(mode!=='menu'){uiClock+=dt;if(uiClock>.08){updateUI();uiClock=0;}}
  if(now>noticeUntil)$('notice').classList.remove('show');
  updateAudio();renderer.render(scene,camera);
}

try{init();}catch(error){console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent='三维画面未能启动。请使用支持 WebGL 的现代浏览器并开启硬件加速，然后刷新页面。';}
