import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TYPE_NAMES,clamp,rad,distance,aspect,yawTo,objectDefaults,defaultProject,normalizeProject} from './core.js';
const $=id=>document.getElementById(id);
const STORE='block-studio-project-v1';let state=defaultProject(),history=[],future=[],view='orbit',drag=null,uid=Date.now();
const nodes=new Map(),labelNodes=new Map();let activeViewCamera;
const say=t=>$('status').textContent=t;
try{const raw=localStorage.getItem(STORE);if(raw)state=normalizeProject(JSON.parse(raw));}catch{say('自动存档不可用，已打开示例；可用“保存工程”备份。');}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(state));}catch{say('浏览器未允许本地存储，请下载工程备份。');}}
function checkpoint(){history.push(JSON.stringify(state));if(history.length>60)history.shift();future=[];updateHistory();}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(JSON.stringify(state));state=normalizeProject(JSON.parse(from.pop()));rebuild();say(redo?'已重做':'已撤销');}
function byId(id){return state.objects.find(o=>o.id===id);}
function selected(){return byId(state.selected);}
const scene=new THREE.Scene();scene.background=new THREE.Color('#eff0eb');
scene.add(new THREE.HemisphereLight(0xffffff,0x858e7c,2.5));
const sun=new THREE.DirectionalLight(0xfffcf3,3.2);sun.position.set(-7,18,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:55});sun.shadow.bias=-.0008;sun.shadow.normalBias=.025;scene.add(sun);
const stage=$('stage'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;stage.append(renderer.domElement);
const shotRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});shotRenderer.setPixelRatio(Math.min(devicePixelRatio,2));shotRenderer.shadowMap.enabled=true;shotRenderer.shadowMap.type=THREE.PCFSoftShadowMap;shotRenderer.outputColorSpace=THREE.SRGBColorSpace;$('preview').prepend(shotRenderer.domElement);
const orbitCam=new THREE.PerspectiveCamera(42,1,.1,200);orbitCam.position.set(18,20,23);
const orthoCam=new THREE.OrthographicCamera(-12,12,10,-10,.1,200);orthoCam.position.set(0,35,0);orthoCam.up.set(0,0,-1);orthoCam.lookAt(0,0,0);
activeViewCamera=orbitCam;
const controls=new OrbitControls(orbitCam,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.1;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=4;controls.maxDistance=85;controls.update();
const shotCam=new THREE.PerspectiveCamera(45,9/16,.05,150);shotCam.filmGauge=36;
const physical=new THREE.Group(),editorOnly=new THREE.Group();scene.add(physical,editorOnly);
const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.87,metalness:0});
const white=mat('#dedfd9'),wallmat=mat('#c4c8c0'),trim=mat('#d9ddd2'),dark=mat('#35463d');
function mesh(geo,m,parent,x=0,y=0,z=0){const v=new THREE.Mesh(geo,m);v.position.set(x,y,z);v.castShadow=true;v.receiveShadow=true;parent.add(v);return v;}
function box(w,h,d,m,p,x=0,y=h/2,z=0){return mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z);}
function cylinder(r1,r2,h,m,p,x=0,y=h/2,z=0,segments=12){return mesh(new THREE.CylinderGeometry(r1,r2,h,segments),m,p,x,y,z);}
function limb(a,b,r,p,m=white){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);const v=cylinder(r,r*.85,delta.length(),m,p);v.position.copy(va.add(vb).multiplyScalar(.5));v.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return v;}
const floor=mesh(new THREE.PlaneGeometry(24,20),mat('#e2e4dc'),physical);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.castShadow=false;
const grid=new THREE.GridHelper(24,24,0xaab2a5,0xc0c6ba);grid.position.y=.008;physical.add(grid);
const edgeMat=new THREE.LineBasicMaterial({color:0x85917d,transparent:true,opacity:.6});
const groundFrame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(20,.03,16)),edgeMat);groundFrame.position.y=.012;physical.add(groundFrame);
const selectionRing=new THREE.Mesh(new THREE.RingGeometry(.5,.55,48),new THREE.MeshBasicMaterial({color:0x648a3d,side:THREE.DoubleSide}));selectionRing.rotation.x=-Math.PI/2;selectionRing.position.y=.032;editorOnly.add(selectionRing);
const measureLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0x537838,dashSize:.18,gapSize:.12}));editorOnly.add(measureLine);
const frustum=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x70984c,transparent:true,opacity:.55}));editorOnly.add(frustum);
const distanceLabel=document.createElement('div');distanceLabel.className='label distance';$('labels').append(distanceLabel);
function disposeGroup(g){g.traverse(o=>{o.geometry?.dispose();if(o.userData.ownMaterial)o.material?.dispose();});g.removeFromParent();}
function buildNode(o){
 const g=new THREE.Group();g.userData.objectId=o.id;let labelHeight=o.height+.2;
 if(o.type==='actor'){
 const body=new THREE.Group();g.add(body);
 mesh(new THREE.SphereGeometry(.145,16,12),white,body,0,1.6,0);
 cylinder(.075,.08,.12,white,body,0,1.4,0);
 mesh(new THREE.CapsuleGeometry(.19,.3,4,12),white,body,0,1.14,0);
 mesh(new THREE.SphereGeometry(.18,12,8),white,body,0,.88,0).scale.set(1,.65,.7);
 for(const sign of [-1,1]){
 limb([sign*.12,.83,0],[sign*.14,.46,.01],.075,body);
 limb([sign*.14,.46,.01],[sign*.14,.09,-.015],.055,body);
 box(.13,.08,.25,white,body,sign*.14,.05,-.07);
 limb([sign*.22,1.34,0],[sign*.28,1.04,0],.055,body);
 limb([sign*.28,1.04,0],[sign*.29,.83,-.04],.045,body);
 mesh(new THREE.SphereGeometry(.05,10,8),white,body,sign*.29,.79,-.04);
 }
 // Nose and floor arrow indicate facing; local forward is -Z.
 mesh(new THREE.SphereGeometry(.045,8,6),wallmat,body,0,1.6,-.135).scale.set(.8,.7,1.3);
 body.scale.setScalar(o.height/1.75);
 const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,.04,0),.85,0x8b997c,.18,.12);g.add(arrow);
 }else if(o.type==='camera'){
 const cameraHead=new THREE.Group();g.add(cameraHead);g.userData.cameraHead=cameraHead;
 box(.42,.25,.32,dark,cameraHead,0,0,0);
 const lens=cylinder(.095,.115,.18,dark,cameraHead,0,0,-.24);lens.rotation.x=Math.PI/2;
 for(const sign of [-1,1]){const reel=cylinder(.1,.1,.09,dark,cameraHead,sign*.13,.18,0);reel.rotation.x=Math.PI/2;}
 const tripod=new THREE.Group();g.add(tripod);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;limb([0,-.13,0],[Math.sin(a)*.28,-o.y,Math.cos(a)*.28],.014,tripod,dark);}
 const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,.02,-.28),.7,0x66884d,.18,.1);g.add(arrow);labelHeight=.5;
 }else if(o.type==='wall'){box(o.width,o.height,o.depth,wallmat,g);}
 else if(o.type==='column'){
 box(o.width*1.35,.18,o.depth*1.35,trim,g);
 cylinder(o.width*.43,o.width*.5,Math.max(.05,o.height-.38),white,g,0,o.height/2,0);
 box(o.width*1.45,.2,o.depth*1.45,trim,g,0,o.height-.1,0);
 }else if(o.type==='door'){
 const t=Math.min(.22,o.width*.12);box(t,o.height,o.depth,trim,g,-o.width/2+t/2);
 box(t,o.height,o.depth,trim,g,o.width/2-t/2);
 box(o.width,t,o.depth*1.1,trim,g,0,o.height-t/2);
 const m=mat('#b2b8ad');const panel=box(Math.max(.05,o.width-2*t),Math.max(.05,o.height-t),.08,m,g,0,(o.height-t)/2,.03);panel.userData.ownMaterial=true;
 }else box(o.width,o.height,o.depth,white,g);
 g.position.set(o.x,o.type==='camera'?o.y:0,o.z);g.rotation.y=-rad(o.yaw); // +yaw turns toward +X
 g.userData.labelHeight=labelHeight;
 g.traverse(c=>{c.userData.objectId=o.id;});
 (o.type==='camera'?editorOnly:physical).add(g);nodes.set(o.id,g);
 const el=document.createElement('div');el.className='label';el.textContent=o.name;$('labels').append(el);labelNodes.set(o.id,el);
}
function rebuild(){
 for(const n of nodes.values())disposeGroup(n);nodes.clear();for(const el of labelNodes.values())el.remove();labelNodes.clear();
 state.objects.forEach(buildNode);$('ratio').value=state.ratio;refreshLists();renderProperties();updateMeasurements();resize();persist();updateHistory();
}
function syncNode(o){const g=nodes.get(o.id);if(!g)return;g.position.set(o.x,o.type==='camera'?o.y:0,o.z);g.rotation.y=-rad(o.yaw);const l=labelNodes.get(o.id);if(l)l.textContent=o.name;}
function pickObject(id){
 if(!byId(id))return;state.selected=id;const o=selected();if(o.type==='camera')state.activeCamera=id;
 refreshLists();renderProperties();persist();
}
function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function refreshLists(){
 $('objectCount').textContent=state.objects.length;
 $('objects').innerHTML=state.objects.map(o=>'<button class="object '+(o.id===state.selected?'active':'')+'" data-id="'+escapeText(o.id)+'"><span class="icon">'+(o.type==='camera'?'▣':o.type==='actor'?'♙':'□')+'</span><span>'+escapeText(o.name)+'</span><span class="kind">'+TYPE_NAMES[o.type]+'</span></button>').join('');
 $('shots').innerHTML=state.objects.filter(o=>o.type==='camera').map((o,i)=>'<div class="shot '+(o.id===state.activeCamera?'active':'')+'" data-id="'+escapeText(o.id)+'" tabindex="0" role="button"><span class="shot-num">'+String(i+1).padStart(2,'0')+'</span><div>'+escapeText(o.name)+'<small>'+o.focal+' mm · '+o.y.toFixed(2)+' m</small></div><span class="goto">↗</span></div>').join('')||'<div class="empty">添加摄影机以查看取景</div>';
 const actors=state.objects.filter(o=>o.type==='actor'),a=$('measureA').value,b=$('measureB').value;
 for(const id of ['measureA','measureB'])$(id).innerHTML=actors.map(o=>'<option value="'+escapeText(o.id)+'">'+escapeText(o.name)+'</option>').join('');
 if(actors.some(o=>o.id===a))$('measureA').value=a;
 $('measureB').value=actors.some(o=>o.id===b)?b:actors[1]?.id||actors[0]?.id||'';
}
function numberField(key,label,min,max,step=.1){const o=selected();return '<label class="field">'+label+'<input type="number" data-key="'+key+'" value="'+o[key]+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';}
function renderProperties(){
 const o=selected();$('typeBadge').textContent=o?' / '+TYPE_NAMES[o.type]:'';
 if(!o){$('properties').innerHTML='<p class="empty">选择一个对象以调整</p>';return;}
 let html='<label class="field">名称<input data-key="name" maxlength="60" value="'+escapeText(o.name)+'"></label><div class="grid2">'+numberField('x','X / 东西（米）',-50,50)+numberField('z','Z / 南北（米）',-50,50)+'</div>';
 if(o.type==='camera'){
 html+='<div class="grid2">'+numberField('y','机位高度（米）',0,30)+numberField('focal','焦距（mm）',12,200,1)+'</div>';
 html+='<label class="field">对准人物<select data-key="target"><option value="">手动角度</option>'+state.objects.filter(p=>p.type==='actor').map(p=>'<option value="'+escapeText(p.id)+'" '+(o.target===p.id?'selected':'')+'>'+escapeText(p.name)+'</option>').join('')+'</select></label>';
 if(o.target)html+=numberField('aimHeight','瞄准高度（距地面 / 米）',0,5,.05)+'<p class="hint">持续跟随目标；要自由调整角度，请切换到手动。</p>';
 else html+='<div class="grid2">'+numberField('yaw','水平角（°）',-360,360,1)+numberField('pitch','俯仰角（°）',-89,89,1)+'</div>';
 html+=numberField('roll','画面侧倾（°）',-180,180,1);
 }else{
 html+=numberField('yaw','朝向（° / 0° 朝北，90° 朝东）',-360,360,1);
 if(o.type==='actor')html+=numberField('height','人物身高（米）',.1,20,.05);
 else html+='<div class="grid2">'+numberField('width','宽度（米）',.1,40)+numberField('depth','深度（米）',.1,40)+'</div>'+numberField('height','高度（米）',.1,20);
 }
 $('properties').innerHTML=html;
}
$('properties').addEventListener('change',e=>{
 const input=e.target,key=input.dataset.key,o=selected();if(!key||!o)return;
 let value=input.value;
 if(input.type==='number'){value=Number(value);if(!input.value.trim()||!Number.isFinite(value)){renderProperties();return;}value=clamp(value,Number(input.min),Number(input.max));}
 if(key==='name')value=value.trim()||TYPE_NAMES[o.type];
 if(key==='target')value=value||null;
 checkpoint();
 if(key==='target'&&!value&&o.target){const t=byId(o.target);if(t){o.yaw=yawTo(o,t);o.pitch=Math.atan2(o.aimHeight-o.y,distance(o,t))*180/Math.PI;}}
 o[key]=value;
 if(['height','width','depth','y'].includes(key)){rebuild();}
 else{syncNode(o);refreshLists();renderProperties();updateMeasurements();persist();}
 say('已更新 '+o.name);
});
function add(type){
 if(state.objects.length>=300){say('最多支持 300 个对象');return;}
 checkpoint();const count=state.objects.filter(o=>o.type===type).length+1;
 const o=objectDefaults(type,'u'+(++uid),type==='camera'?'C'+count:TYPE_NAMES[type]+' '+count);
 // Use a unique ID; names can be edited independently.
 o.x=clamp(Math.round(controls.target.x),-10,10);o.z=clamp(Math.round(controls.target.z),-8,8);
 if(type==='camera'){o.z+=5;o.target=state.objects.find(p=>p.type==='actor')?.id||null;state.activeCamera=o.id;}
 if(type==='box'){o.width=1.5;o.height=1;o.depth=1;}
 state.objects.push(o);state.selected=o.id;rebuild();say('已添加 '+o.name);
}
function deleteSelected(){
 const o=selected();if(!o)return;checkpoint();state.objects=state.objects.filter(p=>p.id!==o.id);
 for(const p of state.objects)if(p.target===o.id)p.target=null;
 if(state.activeCamera===o.id)state.activeCamera=state.objects.find(p=>p.type==='camera')?.id||null;
 state.selected=state.objects[0]?.id||null;rebuild();say('已删除 '+o.name);
}
function duplicate(){
 const o=selected();if(!o||state.objects.length>=300)return;checkpoint();const copy={...o,id:'u'+(++uid),name:o.name+' 副本',x:clamp(o.x+1,-50,50),z:clamp(o.z+1,-50,50)};
 state.objects.push(copy);state.selected=copy.id;if(copy.type==='camera')state.activeCamera=copy.id;rebuild();say('已复制 '+o.name);
}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function rayAt(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,activeViewCamera);}
function planePoint(){return ray.ray.intersectPlane(ground,new THREE.Vector3());}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;rayAt(e);const hits=ray.intersectObjects([...nodes.values()].filter(n=>n.visible),true);if(!hits.length)return;
 const id=hits[0].object.userData.objectId,o=byId(id),p=planePoint();if(!o||!p)return;
 e.stopImmediatePropagation();controls.enabled=false;pickObject(id);
 drag={id,dx:o.x-p.x,dz:o.z-p.z,startX:e.clientX,startY:e.clientY,changed:false};renderer.domElement.setPointerCapture(e.pointerId);
},true);
renderer.domElement.addEventListener('pointermove',e=>{
 if(!drag)return;rayAt(e);const p=planePoint(),o=byId(drag.id);if(!p||!o)return;
 if(!drag.changed&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<3)return;
 if(!drag.changed){checkpoint();drag.changed=true;}
 const snap=$('snap').checked?.25:.01;
 o.x=clamp(Math.round((p.x+drag.dx)/snap)*snap,-50,50);o.z=clamp(Math.round((p.z+drag.dz)/snap)*snap,-50,50);syncNode(o);updateMeasurements();renderProperties();
});
function endDrag(){if(drag?.changed){persist();say('已移动 '+byId(drag.id)?.name);}drag=null;controls.enabled=true;}
renderer.domElement.addEventListener('pointerup',endDrag);renderer.domElement.addEventListener('pointercancel',endDrag);renderer.domElement.addEventListener('lostpointercapture',endDrag);
function setView(v){
 view=v;activeViewCamera=v==='top'?orthoCam:orbitCam;controls.object=activeViewCamera;controls.enableRotate=v==='orbit';
 if(v==='top'){orthoCam.position.set(0,35,0);orthoCam.up.set(0,0,-1);controls.target.set(0,0,0);}
 if(v==='orbit'){orbitCam.up.set(0,1,0);orbitCam.position.set(18,20,23);controls.target.set(0,0,0);}
 if(v==='front'){orbitCam.up.set(0,1,0);orbitCam.position.set(0,9,30);controls.target.set(0,1,0);}
 controls.update();resize();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
}
function updateShot(){
 const c=byId(state.activeCamera);if(!c||c.type!=='camera')return false;
 shotCam.aspect=aspect(state.ratio);shotCam.setFocalLength(c.focal);shotCam.position.set(c.x,c.y,c.z);shotCam.up.set(0,1,0);
 const target=byId(c.target);
 if(target){shotCam.lookAt(target.x,c.aimHeight,target.z);const g=nodes.get(c.id);if(g)g.rotation.y=-rad(yawTo(c,target));}
 else{const yaw=rad(c.yaw),pitch=rad(c.pitch);shotCam.lookAt(c.x+Math.sin(yaw)*Math.cos(pitch),c.y+Math.sin(pitch),c.z-Math.cos(yaw)*Math.cos(pitch));}
 const icon=nodes.get(c.id),head=icon?.userData.cameraHead;if(head){const pitch=target?Math.atan2(c.aimHeight-c.y,distance(c,target)):rad(c.pitch);head.rotation.x=pitch;head.rotation.z=-rad(c.roll);}
 shotCam.rotateZ(-rad(c.roll));shotCam.updateMatrixWorld();shotCam.updateProjectionMatrix();
 $('previewName').textContent=c.name;$('lensMeta').textContent=c.focal+' mm · '+state.ratio;return true;
}
const temp=new THREE.Vector3();
let lastFrustum='';
function updateFrustum(){
 frustum.visible=$('frustumOn').checked&&!!byId(state.activeCamera);
 if(!frustum.visible)return;
 const signature=shotCam.matrixWorld.elements.join(',')+':'+shotCam.fov+':'+state.ratio;
 if(signature===lastFrustum)return;lastFrustum=signature;
 const a=aspect(state.ratio),height=Math.tan(rad(shotCam.fov/2))*4,width=height*a;
 const center=shotCam.position.clone(),corners=[[-width,-height,-4],[width,-height,-4],[width,height,-4],[-width,height,-4]].map(p=>new THREE.Vector3(...p).applyMatrix4(shotCam.matrixWorld));
 const pts=[];for(let i=0;i<4;i++){pts.push(center,corners[i],corners[i],corners[(i+1)%4]);}
 frustum.geometry.dispose();frustum.geometry=new THREE.BufferGeometry().setFromPoints(pts);
}
function updateMeasurements(){
 const a=byId($('measureA').value),b=byId($('measureB').value),show=$('measureOn').checked&&a&&b&&a!==b;
 measureLine.visible=!!show;distanceLabel.hidden=!show;
 if(!a||!b||a===b){$('distanceValue').textContent='— m';return;}
 const d=distance(a,b);$('distanceValue').textContent=d.toFixed(2)+' m';distanceLabel.textContent=d.toFixed(2)+' m';
 measureLine.geometry.dispose();measureLine.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x,.05,a.z),new THREE.Vector3(b.x,.05,b.z)]);measureLine.computeLineDistances();
}
function projectPoint(p,camera,w,h){const projected=p.clone().project(camera);return{x:(projected.x*.5+.5)*w,y:(-.5*projected.y+.5)*h,visible:projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1.2&&Math.abs(projected.y)<1.2};}
function labelPosition(){
 const r=stage.getBoundingClientRect(),on=$('labelsOn').checked;
 for(const o of state.objects){const el=labelNodes.get(o.id),g=nodes.get(o.id);if(!el||!g)continue;
 const y=o.type==='camera'?o.y+.5:g.userData.labelHeight;
 const pos=projectPoint(new THREE.Vector3(o.x,y,o.z),activeViewCamera,r.width,r.height);
 el.hidden=!on||!pos.visible||!g.visible;el.style.left=pos.x+'px';el.style.top=pos.y+'px';el.classList.toggle('selected',o.id===state.selected);
 }
 const a=byId($('measureA').value),b=byId($('measureB').value);
 if(measureLine.visible&&a&&b){const pos=projectPoint(new THREE.Vector3((a.x+b.x)/2,.15,(a.z+b.z)/2),activeViewCamera,r.width,r.height);distanceLabel.hidden=!pos.visible;distanceLabel.style.left=pos.x+'px';distanceLabel.style.top=pos.y+'px';}
 const o=selected();selectionRing.visible=!!o&&nodes.get(o.id)?.visible;
 if(o)selectionRing.position.set(o.x,.035,o.z);
}
function resize(){
 const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);
 orbitCam.aspect=w/h;orbitCam.updateProjectionMatrix();// Orthographic extents remain independent of zoom
 orthoCam.left=-12*w/h;orthoCam.right=12*w/h;orthoCam.top=12;orthoCam.bottom=-12;orthoCam.updateProjectionMatrix();
 const r=aspect(state.ratio),pw=$('preview').clientWidth,ph=$('preview').clientHeight;
 const sw=Math.min(pw,ph*r),sh=sw/r;shotRenderer.setSize(Math.floor(sw),Math.floor(sh));$('thirds').style.width=sw+'px';$('thirds').style.height=sh+'px';
}
new ResizeObserver(resize).observe(stage);new ResizeObserver(resize).observe($('preview'));
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function save(){download('白模预演工程.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));say('工程 JSON 已下载');}
function drawCaption(ctx,text,x,y,scale=1){ctx.font='600 '+Math.round(13*scale)+'px "Microsoft YaHei",sans-serif';const w=ctx.measureText(text).width+12*scale;ctx.fillStyle='#fffffff2';ctx.fillRect(x-w/2,y-20*scale,w,23*scale);ctx.strokeStyle='#a5b599';ctx.strokeRect(x-w/2,y-20*scale,w,23*scale);ctx.fillStyle='#263c23';ctx.textAlign='center';ctx.fillText(text,x,y-4*scale);}
async function exportPNG(shot=false){
 if(shot&&!updateShot()){say('请先添加一个摄影机');return;}
 const w=shot?Math.round(aspect(state.ratio)>=1?1920:1080):2000,h=shot?Math.round(w/aspect(state.ratio)):Math.round(w*stage.clientHeight/stage.clientWidth);
 const out=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});out.setSize(w,h);out.shadowMap.enabled=true;out.shadowMap.type=THREE.PCFSoftShadowMap;out.outputColorSpace=THREE.SRGBColorSpace;
 const old=editorOnly.visible;editorOnly.visible=!shot;selectionRing.visible=false;
 out.render(scene,shot?shotCam:activeViewCamera);editorOnly.visible=old;
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(out.domElement,0,0);
 if(!shot&&$('labelsOn').checked){for(const o of state.objects){if(!nodes.get(o.id)?.visible)continue;const pos=projectPoint(new THREE.Vector3(o.x,o.type==='camera'?o.y+.5:nodes.get(o.id).userData.labelHeight,o.z),activeViewCamera,w,h);if(pos.visible)drawCaption(ctx,o.name,pos.x,pos.y,Math.max(1,w/1600));}}
 if(!shot&&measureLine.visible){const a=byId($('measureA').value),b=byId($('measureB').value);if(a&&b){const p=projectPoint(new THREE.Vector3((a.x+b.x)/2,.15,(a.z+b.z)/2),activeViewCamera,w,h);if(p.visible)drawCaption(ctx,distance(a,b).toFixed(2)+' m',p.x,p.y,1.2);}}
 canvas.toBlob(blob=>{if(blob)download(shot?'机位_'+byId(state.activeCamera).name+'.png':'白模空间站位图.png',blob);else say('图片导出失败');},'image/png');out.dispose();say(shot?'已导出纯净机位取景':'已导出站位图（含名称与距离）');
}
$('objects').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)pickObject(b.dataset.id);});
function shotClick(e){const b=e.target.closest('[data-id]');if(b)pickObject(b.dataset.id);}
$('shots').addEventListener('click',shotClick);$('shots').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();shotClick(e);}});
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('cameraAdd').onclick=()=>add('camera');$('duplicate').onclick=duplicate;$('delete').onclick=deleteSelected;$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('fit').onclick=()=>{orthoCam.zoom=1;setView(view);};
$('ratio').onchange=()=>{checkpoint();state.ratio=$('ratio').value;resize();persist();say('画幅已切换为 '+state.ratio);};
for(const id of ['measureA','measureB','measureOn'])$(id).onchange=updateMeasurements;
$('thirdsOn').onchange=()=>$('thirds').hidden=!$('thirdsOn').checked;
$('wallsOn').onchange=()=>{for(const o of state.objects)if(o.type==='wall')nodes.get(o.id).visible=$('wallsOn').checked;};
$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
$('save').onclick=save;$('import').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async()=>{
 const f=$('fileInput').files[0];if(!f)return;
 try{if(f.size>2*1024*1024)throw Error('工程不能超过 2 MB');const next=normalizeProject(JSON.parse(await f.text()));checkpoint();state=next;rebuild();say('已导入 '+f.name);}catch(e){say('导入失败：'+e.message);}
 $('fileInput').value='';
};
$('reset').onclick=()=>{if(!confirm('重新载入示例？当前工程可先保存，操作也可撤销。'))return;checkpoint();state=defaultProject();rebuild();say('已重新载入大厅示例');};
$('exportMap').onclick=()=>exportPNG(false);$('exportShot').onclick=()=>exportPNG(true);
window.addEventListener('keydown',e=>{
 if(e.target.closest('input,select,textarea,[contenteditable]')||$('helpDialog').open)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}
 const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
 if(move&&selected()){e.preventDefault();checkpoint();const o=selected(),step=e.shiftKey?1:.25;o.x=clamp(o.x+move[0]*step,-50,50);o.z=clamp(o.z+move[1]*step,-50,50);syncNode(o);renderProperties();updateMeasurements();persist();}
});
function animate(){
 requestAnimationFrame(animate);controls.update();
 for(const o of state.objects)if(o.type==='wall')nodes.get(o.id).visible=$('wallsOn').checked;
 const hasCamera=updateShot();updateFrustum();labelPosition();
 editorOnly.visible=true;renderer.render(scene,activeViewCamera);
 editorOnly.visible=false;if(hasCamera){shotRenderer.render(scene,shotCam);}else{shotRenderer.clear();$('previewName').textContent='无机位';$('lensMeta').textContent='请添加摄影机';}
 editorOnly.visible=true;
}
rebuild();$('loading').remove();animate();say('大厅示例已就绪 · 选择或拖动对象开始预演');
