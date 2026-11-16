export const TYPES=['actor','camera','wall','column','door','box'];
export const RATIOS=['9:16','16:9','1:1','4:3','2.39:1'];
export const TYPE_NAMES={actor:'人物',camera:'摄影机',wall:'墙体',column:'立柱',door:'门框',box:'方块'};
export const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export const rad=d=>d*Math.PI/180;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const aspect=r=>{const [w,h]=r.split(':').map(Number);return w/h;};
export const yawTo=(a,b)=>Math.atan2(b.x-a.x,-(b.z-a.z))*180/Math.PI;
export function objectDefaults(type,id,name){return {id,type,name,x:0,y:type==='camera'?1.6:0,z:0,yaw:0,pitch:0,roll:0,height:type==='actor'?1.75:3,width:2,depth:.3,focal:35,target:null,aimHeight:1.35};}
export function defaultProject(){
 let n=0; const make=(t,name,props)=>({...objectDefaults(t,'o'+(++n),name),...props});
 return {version:1,ratio:'9:16',selected:'o10',activeCamera:'o10',objects:[
 make('actor','人物 1',{x:-2,z:2,yaw:20}),make('actor','人物 2',{x:2,z:-1,yaw:-45}),make('actor','人物 3',{x:2.2,z:1.1,yaw:-65}),make('actor','人物 4',{x:-4.2,z:-2.5,yaw:35}),make('actor','人物 5',{x:0,z:-6,yaw:180}),
 make('wall','北侧墙',{x:0,z:-8,width:20,height:4.6,depth:.22}),make('wall','西侧墙',{x:-10,z:0,width:16,height:4.6,depth:.22,yaw:90}),make('door','北侧石门',{x:0,z:-7.75,width:3,height:3.8,depth:.4}),
 make('column','立柱 1',{x:-8.4,z:-5.5,width:.65,depth:.65,height:3.8}),
 make('camera','C1',{x:0,y:1.6,z:-3.8,target:'o5',focal:35}),
 make('camera','C2',{x:8,y:1.5,z:6.5,target:'o3',focal:50}),
 make('camera','C3',{x:6,y:1.55,z:3.8,target:'o3',focal:35}),
 make('camera','C4',{x:6.2,y:1.8,z:.5,target:'o2',focal:50}),
 make('camera','C5',{x:1.2,y:1.6,z:4.8,target:'o3',focal:35}),
 make('camera','C6',{x:-1.4,y:1.5,z:5.8,target:'o1',focal:50}),
 make('camera','C7',{x:2.3,y:1.65,z:-3.2,target:'o2',focal:35}),
 ...[-1,4.8].map((z,i)=>make('column','立柱 '+(i+2),{x:-8.4,z,width:.65,depth:.65,height:3.8})),
 ...[-5.5,-.5,5].map((z,i)=>make('column','立柱 '+(i+4),{x:8.7,z,width:.65,depth:.65,height:3.8}))
 ]};
}
export function normalizeProject(input){
 if(!input||input.version!==1||!Array.isArray(input.objects)||input.objects.length>300)throw Error('工程格式不正确，或对象超过 300 个。');
 const ids=new Set(); const objects=input.objects.map(o=>{
 if(!o||!TYPES.includes(o.type)||typeof o.id!=='string'||!o.id||ids.has(o.id))throw Error('对象类型或 ID 无效/重复。');
 ids.add(o.id); const d=objectDefaults(o.type,o.id,typeof o.name==='string'?o.name.slice(0,60):TYPE_NAMES[o.type]);
 const limits={x:[-50,50],y:[0,30],z:[-50,50],yaw:[-360,360],pitch:[-89,89],roll:[-180,180],height:[.1,20],width:[.1,40],depth:[.1,40],focal:[12,200],aimHeight:[0,5]};
 for(const [k,[min,max]] of Object.entries(limits)){if(o[k]!==undefined){if(typeof o[k]!=='number'||!Number.isFinite(o[k]))throw Error('坐标或尺寸必须为有效数字。');d[k]=clamp(o[k],min,max);}}
 d.target=typeof o.target==='string'?o.target:null;return d;});
 for(const o of objects)if(o.target&&!objects.some(t=>t.id===o.target&&t.type==='actor'))o.target=null;
 const cam=objects.find(o=>o.id===input.activeCamera&&o.type==='camera')||objects.find(o=>o.type==='camera');
 return {version:1,ratio:RATIOS.includes(input.ratio)?input.ratio:'9:16',objects,activeCamera:cam?.id||null,selected:ids.has(input.selected)?input.selected:objects[0]?.id||null};
}
