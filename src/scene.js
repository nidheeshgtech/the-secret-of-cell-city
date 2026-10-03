import * as T from 'three';
import { findRoute, moveWithCollision, isWalkable } from './navigation.js';
export function createCity(host,labels,stops,events={}){
 const scene=new T.Scene();scene.background=new T.Color('#b5dce0');scene.fog=new T.Fog('#c4dedc',48,110);
 const camera=new T.PerspectiveCamera(57,1,.12,180);camera.position.set(0,5.8,40);
 let renderer;try{renderer=new T.WebGLRenderer({antialias:true});}catch{
 host.innerHTML='<div class="webgl-fallback">3D needs WebGL. You can still follow the story and complete every challenge.</div>';
 return {available:false,setProgress(){},travel(i){events.arrive?.(i)},setPaused(){},setStory(){},setSpeaker(){},overview(){},follow(){},zoom(){},celebrate(){},reveal(){},setEmergency(){},repair(){},reset(){},interact(){},demonstrate(){},setInput(){},getPosition(){return{x:0,z:32}}};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.appendChild(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Animated Cell City field trip following the teacher and students.');renderer.domElement.tabIndex=0;
 scene.add(new T.HemisphereLight('#fff7dc','#8ca487',2.4));const sun=new T.DirectionalLight('#fff0d2',3.1);sun.position.set(-24,45,25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:110});sun.shadow.normalBias=.045;scene.add(sun);
 const materials=new Map();function mat(c,opts={}){const key=c+JSON.stringify(opts);if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:c,roughness:.75,...opts}));return materials.get(key);}
 function mesh(geo,c,x,y,z,parent=scene,opts={}){const m=new T.Mesh(geo,mat(c,opts));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function box(w,h,d,c,x,y,z,p=scene){return mesh(new T.BoxGeometry(w,h,d),c,x,y,z,p);}
 function sphere(r,c,x,y,z,p=scene){return mesh(new T.SphereGeometry(r,16,12),c,x,y,z,p);}
 function cyl(r1,r2,h,c,x,y,z,p=scene,n=32){return mesh(new T.CylinderGeometry(r1,r2,h,n),c,x,y,z,p);}
 function torus(r,t,c,x,y,z,p=scene){const m=mesh(new T.TorusGeometry(r,t,8,48),c,x,y,z,p);m.rotation.x=Math.PI/2;return m;}
 let seed=42;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
 const scenery=new T.Group();scene.add(scenery);const cityLayer=new T.Group();scene.add(cityLayer);
 const ground=mesh(new T.PlaneGeometry(280,280),'#c3d5b0',0,-1.2,0,scenery);ground.rotation.x=-Math.PI/2;
 const base=cyl(33,32,1.25,'#b4b79a',0,-.48,0,cityLayer);base.scale.z=.86;const grass=cyl(32.6,32.6,.18,'#99b778',0,.24,0,cityLayer);grass.scale.z=.86;
 box(5,.45,12,'#e4dbc1',0,.1,30,cityLayer);box(3.8,.07,14,'#ecdfbd',0,.36,29,cityLayer);
 const boundary=mesh(new T.CylinderGeometry(32.1,32.1,4.3,96,1,true,.11,Math.PI*2-.22),'#a8d8c8',0,2.5,0,cityLayer,{transparent:true,opacity:.17,side:T.DoubleSide,depthWrite:false});boundary.scale.z=.86;
 for(let a=.11;a<Math.PI*2-.11;a+=.12){const x=Math.sin(a)*32,z=Math.cos(a)*27.52;cyl(.1,.1,1.5,'#ede4c9',x,1.05,z,cityLayer,8);const rail=box(3.9,.13,.13,'#c1d2ac',x,1.6,z,cityLayer);rail.rotation.y=-a;}
 const locations=stops.map((s,i)=>({x:s.x*2.5,z:i===0?27:s.z*2.5}));
 const destinations=locations.map((s,i)=>({x:s.x,z:s.z+(i===0?3.6:i===8?1.7:4.6)}));
 const obstacles=[];const roads=new Set();
 function road(points,width=1.05,color='#e4d3ac'){
  const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
  const m=mesh(new T.TubeGeometry(curve,Math.max(50,points.length*20),width,8,false),color,0,.39,0,cityLayer);m.scale.y=.075;
  const samples=curve.getPoints(500);for(const p of samples)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)roads.add(`${Math.round(p.x/.65)+x},${Math.round(p.z/.65)+z}`);
  return curve;
 }
 const roadPoints=[[0,33],[0,24],[-8,22],[-15,19],[-17.5,14.6],[-22.7,11],[-24,3],[-20,-.4],[-14,-3],[-8,-7.9],[0,-10.4],[7.5,-10.4],[16,-8],[20,-2.9],[23,3],[17.5,14.6],[13,20],[7.5,19.6],[2.8,14],[0,8],[0,2.3]];
 const route=road(roadPoints,1.3);road([[-20,-.4],[-12,2],[-6,5],[0,8],[9,6],[17.5,14.6]],1.05);road([[-8,-7.9],[-5,-4],[-5,3],[0,8]],.85);
 function tree(x,z,s=1){cyl(.13*s,.21*s,1.8*s,'#8a7050',x,.9*s+.32,z,cityLayer,8);sphere(.9*s,'#668e57',x,2.5*s,z,cityLayer);sphere(.65*s,'#83a563',x-.48*s,2.2*s,z+.2,cityLayer);sphere(.6*s,'#9bb775',x+.38*s,2.9*s,z,cityLayer);obstacles.push({x,z,w:.5*s,d:.5*s});}
 for(let i=0;i<76;i++){const a=rnd()*Math.PI*2,r=28.8+rnd()*2.5,x=Math.sin(a)*r,z=Math.cos(a)*r*.84;if(Math.abs(x)<4&&z>19)continue;tree(x,z,.85+rnd()*.7);}
 for(let i=0;i<180;i++){const a=rnd()*Math.PI*2,r=4+rnd()*25,x=Math.cos(a)*r,z=Math.sin(a)*r*.83;if(locations.some(s=>Math.hypot(x-s.x,z-s.z)<5)||roads.has(`${Math.round(x/.65)},${Math.round(z/.65)}`))continue;sphere(.09,['#e7cf76','#f4f1d6','#dc9c8d'][i%3],x,.48,z,cityLayer);}
 function sign(text,x,y,z,width=3.2,color='#355e4c',parent=cityLayer){const cv=document.createElement('canvas');cv.width=768;cv.height=128;const ctx=cv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,768,128);ctx.strokeStyle='#dfd9ae';ctx.lineWidth=7;ctx.strokeRect(7,7,754,114);ctx.fillStyle='#fff7db';ctx.font='600 35px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.toUpperCase(),384,67,728);const tx=new T.CanvasTexture(cv);tx.colorSpace=T.SRGBColorSpace;const board=new T.Mesh(new T.PlaneGeometry(width,width/6),new T.MeshBasicMaterial({map:tx,side:T.DoubleSide}));board.position.set(x,y,z);parent.add(board);return board;}
 const buildings=[];
 function group(s){const i=buildings.length,g=new T.Group();g.position.set(locations[i].x,.36,locations[i].z);g.scale.setScalar(1.8);cityLayer.add(g);buildings.push(g);return g;}
 function windowRow(g,w,y,z,color='#b8dad4'){for(let x=-w/2+.35;x<w/2;x+=.6){box(.3,.43,.05,color,x,y,z,g);box(.34,.05,.09,'#f9f1da',x,y-.23,z,g);}}
 function house(g,w,h,d,wall,roof){box(w,h,d,wall,0,h/2,0,g);const r=cyl(w*.78,w*.78,.2,roof,0,h+.03,0,g,4);r.rotation.y=Math.PI/4;r.scale.z=d/w;windowRow(g,w,h*.62,d/2+.04);box(.4,.7,.06,'#6f8d83',0,.35,d/2+.05,g);}
 let g=group(stops[0]);box(.55,2.6,.65,'#f3e8c9',-1.5,1.3,0,g);box(.55,2.6,.65,'#f3e8c9',1.5,1.3,0,g);box(3.6,.55,.8,'#4f8970',0,2.5,0,g);box(2.7,.16,.3,'#e8c778',0,1.2,0,g);for(let x=-1.15;x<1.3;x+=.3)box(.055,1.9,.055,'#769b88',x,1,0,g);sphere(.23,'#e6d398',-1.5,2.95,0,g);sphere(.23,'#e6d398',1.5,2.95,0,g);
 g=group(stops[1]);box(3.6,.2,2.6,'#759b66',0,.1,0,g);for(let x=-1.1;x<=1.1;x+=1.1){box(.6,.15,2,'#c2a978',x,.3,0,g);for(let z=-.6;z<=.6;z+=.6){sphere(.32,'#84af4b',x,.62,z,g);sphere(.22,'#b0ca63',x+.12,.8,z,g);}}const greenhouse=mesh(new T.SphereGeometry(1.35,24,16,0,Math.PI*2,0,Math.PI/2),'#bbdccc',0,.35,-.25,g,{transparent:true,opacity:.28,depthWrite:false});torus(1.35,.055,'#e8f1d4',0,.35,-.25,g);
 g=group(stops[2]);house(g,2.9,1.5,2,'#f0d5b2','#b97058');box(3.2,.24,2.3,'#cd8568',0,1.9,0,g);box(2.6,.25,1.9,'#db9a7f',0,2.25,-.1,g);box(2,.24,1.5,'#e7b394',0,2.6,-.2,g);for(let i=0;i<4;i++)box(.35,.35,.35,'#bc9163',-1.7+i*.45,.2,1.5,g);box(1.3,.3,.08,'#faf0d6',0,1.35,1.07,g);
 g=group(stops[3]);for(let i=0;i<4;i++){const t=torus(1.25,.18,i%2?'#e5c281':'#cfab71',0,.45+i*.26,0,g);t.scale.x=1.3;t.scale.y=.46;t.rotation.z=i*.1;}sphere(.27,'#f6e7bb',1.5,1.4,0,g);
 g=group(stops[4]);house(g,2.6,1.1,1.8,'#f1e5c8','#ae7760');for(let x=-.85;x<=.85;x+=.8){cyl(.4,.4,.12,'#d7b982',x,.45,1.5,g);sphere(.2,'#c8997b',x,.7,1.5,g);sphere(.13,'#f3d6a1',x+.15,.83,1.5,g);}box(2,.15,.4,'#929f84',0,.7,1.2,g);for(let i=0;i<5;i++)sphere(.1,['#9bb9a5','#d99c87','#d5bf78'][i%3],i*.32-.65,.88,1.2,g);
 g=group(stops[5]);house(g,2.8,1.3,2,'#edcf95','#c38849');for(let x of [-.7,.65]){cyl(.43,.6,2.3,'#dea463',x,1.15,-.4,g);cyl(.55,.43,.2,'#f4d6a1',x,2.4,-.4,g);torus(.43,.07,'#af7b46',x,2.52,-.4,g);}box(.65,.85,.1,'#f6dda1',0,1,1.06,g);const bolt=box(.14,.5,.13,'#ca8e37',0,1.1,1.14,g);bolt.rotation.z=-.4;
 g=group(stops[6]);cyl(1.6,1.6,.3,'#d8d9c2',0,.2,0,g);const water=mesh(new T.CylinderGeometry(1.4,1.4,1.9,48),'#83c5ce',0,1.2,0,g,{transparent:true,opacity:.78,metalness:.2,roughness:.22});torus(1.45,.1,'#f1e5cb',0,2.2,0,g);cyl(1.42,1.42,.05,'#a7dae0',0,2.14,0,g);for(let a=0;a<6;a++){let angle=a*Math.PI/3;box(.12,2,.12,'#e4e3c9',Math.cos(angle)*1.47,1.2,Math.sin(angle)*1.47,g);}box(.4,.6,.9,'#b0c6ba',1.7,.4,0,g);
 g=group(stops[7]);house(g,2,1.25,1.8,'#cdc4d7','#8f869f');for(let x of [-.65,.2,1.05]){cyl(.28,.3,.6,['#86a18a','#d7b778','#9c93b6'][Math.round((x+.65)/.85)],x,.3,1.35,g);cyl(.32,.32,.08,'#f0e6d2',x,.65,1.35,g);}cyl(.27,.4,1,'#a49aab',-.6,1.7,-.4,g);
 // The nucleus is a real walk-in control room with an open entrance.
 g=group(stops[8]);cyl(2.4,2.5,.14,'#e9ddc6',0,.06,0,g);
 const nucleusWalls=mesh(new T.CylinderGeometry(2.15,2.15,3,32,1,true,.48,Math.PI*2-.96),'#cbbad7',0,1.5,0,g,{side:T.DoubleSide});
 const roof=mesh(new T.SphereGeometry(2.3,32,20,0,Math.PI*2,0,Math.PI/2),'#aa95bd',0,3,0,g);
 torus(2.2,.1,'#e9d9b3',0,3,0,g);cyl(.09,.12,1,'#d7bb73',0,5.4,0,g);sphere(.24,'#f3d989',0,5.95,0,g);
 const screens=[];for(let i=0;i<6;i++){const panel=new T.Group();panel.position.set((i%3-1)*1.17,1.35+Math.floor(i/3)*.95,-1.5);g.add(panel);box(1.02,.72,.12,'#455d5b',0,0,0,panel);const screen=box(.89,.58,.05,['#99cc91','#ddc297','#b3aecb','#e3c16f','#92c9d0','#ada2c5'][i],0,0,.08,panel);screen.material=screen.material.clone();screen.userData.base=screen.material.color.clone();screens.push(screen);for(let j=0;j<3;j++)box(.09,.1+j*.08,.015,'#e7f4d5',-.25+j*.24,-.1,.12,panel);}
 ['GARDEN','DELIVERY','PROTEINS','ENERGY','STORAGE','RECYCLING'].forEach((title,i)=>sign(title,(i%3-1)*1.17,1.74+Math.floor(i/3)*.95,-1.35,.9,'#455d5b',g));
 box(2.4,.65,.7,'#789d94',0,.37,-.6,g);sign('DNA • CITY CONTROL',0,2.4,-1.35,2.8,'#586572',g);
 const dimensions=[[0,0],[6.5,4.8],[5.6,4.3],[5.2,2.1],[4.8,4.9],[5.4,4.1],[5.5,5.5],[4,4.6]];
 locations.forEach((l,i)=>{if(i>0&&i<8)obstacles.push({x:l.x,z:l.z,w:dimensions[i][0],d:dimensions[i][1]});});
 obstacles.push({x:-3,z:27,w:1.1,d:1.6},{x:3,z:27,w:1.1,d:1.6},{x:-3.3,z:0,w:1.5,d:7.4},{x:3.3,z:0,w:1.5,d:7.4},{x:0,z:-3.4,w:7,d:1.5});
 const gatePanels=buildings[0].children.filter((m,i)=>i>=3&&m.geometry?.type==='BoxGeometry');gatePanels.forEach(m=>m.userData.baseY=m.position.y);
 const signNames=['CELL CITY • WELCOME','PHOTOSYNTHESIS GARDEN','CELL CITY POST OFFICE','ER TRANSPORT NETWORK','RIBOSOME PROTEIN FARM','CELL CITY POWER STATION','VACUOLE RESERVOIR','LYSOSOME RECYCLING','NUCLEUS • CONTROL CENTRE'];
 locations.forEach((l,i)=>{sign(signNames[i],l.x,i===8?5.4:i===0?4.9:3.75,l.z+(i===8?4.1:i===0?.8:2.6),i===8?6.5:5);});
 // Friendly organelle residents animate while speaking.
 const faces=locations.map((l,i)=>{const f=new T.Group();f.position.set(l.x,i===8?4.7:2.9,l.z+(i===0?.8:i===8?4.1:2.8));cityLayer.add(f);for(let x of [-.2,.2]){sphere(.105,'#fff9de',x,.08,0,f);sphere(.049,'#354d43',x,.08,.09,f);}const mouth=box(.17,.04,.05,'#536c52',0,-.13,.02,f);return{group:f,mouth};});
 // Street furniture and warm lights make the roads feel inhabited.
 const lamps=[];for(let i=0;i<15;i++){const p=route.getPointAt((i+.3)/15),x=p.x+2,z=p.z;cyl(.07,.12,2.8,'#5e7764',x,1.7,z,cityLayer,8);const bulb=sphere(.23,'#fff0bb',x,3.18,z,cityLayer);bulb.material=new T.MeshStandardMaterial({color:'#fff0bb',emissive:'#f9d578',emissiveIntensity:1.4});lamps.push(bulb);if(i%3===1){box(1.5,.16,.55,'#9c7755',x+1,.9,z,cityLayer);box(1.5,.48,.1,'#ba9262',x+1,1.25,z-.26,cityLayer);for(let dx of [-.5,.5])box(.1,.6,.4,'#596e57',x+1+dx,.6,z,cityLayer);}}
 const couriers=[];for(let i=0;i<4;i++){const cart=new T.Group();box(.6,.35,.85,['#c59465','#8daaa1','#d4b369','#ab91b2'][i],0,.3,0,cart);box(.45,.35,.45,'#ead6a6',0,.63,0,cart);for(const x of [-.32,.32])for(const z of [-.3,.3]){const wheel=cyl(.14,.14,.08,'#586257',x,.15,z,cart,12);wheel.rotation.z=Math.PI/2;}cityLayer.add(cart);couriers.push(cart);}
 const parcels=[];for(let i=0;i<5;i++)parcels.push(box(.35,.35,.35,'#cfaa76',0,.9,0,cityLayer));
 const beads=[];for(let i=0;i<8;i++)beads.push(sphere(.14,['#d9977c','#a5bf83','#a6b5d0'][i%3],0,1.9,0,cityLayer));
 const steam=[];for(let i=0;i<10;i++){const p=sphere(.24,'#fffbe5',0,0,0,cityLayer);p.material=new T.MeshStandardMaterial({color:'#fffbe5',transparent:true,opacity:.35,depthWrite:false});steam.push(p);}
 const debris=[];for(let i=0;i<7;i++)debris.push(box(.22,.22,.22,'#a59985',0,.6,0,cityLayer));
 const solar=mesh(new T.ConeGeometry(2,7,24,1,true),'#fff0a1',locations[1].x,4.6,locations[1].z,cityLayer,{transparent:true,opacity:.1,depthWrite:false,side:T.DoubleSide});
 const molecule=sphere(.28,'#9edee1',0,1.3,29,cityLayer);molecule.material=molecule.material.clone();molecule.visible=false;let moleculeTime=0,moleculeAllowed=true;
 const waterStream=mesh(new T.CylinderGeometry(.08,.08,2.1,12),'#a8dfe4',locations[6].x+1,3.7,locations[6].z,cityLayer,{transparent:true,opacity:.65});
 // Consistent cast: teacher, four pupils, articulated limbs and backpacks.
 const people=[];const actorColors=['#eee8cf','#dc8f76','#75abb4','#a68dbd','#d6af61'];
 const names=['Dr. Maya','Aria','Ben','Zoya','Leo'];
 function person(i){const root=new T.Group(),body=new T.Group();root.add(body);scene.add(root);const h=i===0?1.74:1.38,skin=['#b87d57','#d4a17b','#805940','#a57453','#d3a278'][i],shirt=actorColors[i];
  cyl(.22,.27,h*.35,shirt,0,h*.56,0,body,10);sphere(.23,skin,0,h*.86,0,body);const hair=sphere(.235,['#483629','#65452e','#322e29','#3b2e29','#90693f'][i],0,h*.92,-.015,body);hair.scale.y=.72;
  if(i===0||i===3){sphere(.15,'#483629',.12,h*.86,-.19,body);box(.36,.08,.035,'#636951',0,h*.88,.205,body);}for(const x of [-.08,.08])sphere(.027,'#343930',x,h*.87,.21,body);
  const limbs=[];for(const x of [-.135,.135]){const leg=new T.Group();leg.position.set(x,h*.4,0);body.add(leg);box(.13,h*.32,.15,i===0?'#5a766c':'#466172',0,-h*.16,0,leg);box(.15,.09,.24,'#454d43',0,-h*.32,.04,leg);limbs.push(leg);}
  for(const x of [-.29,.29]){const arm=new T.Group();arm.position.set(x,h*.69,0);body.add(arm);box(.12,h*.23,.14,shirt,0,-h*.11,0,arm);sphere(.073,skin,0,-h*.26,0,arm);limbs.push(arm);}
  if(i){box(.32,.38,.17,['','#b56856','#d3b064','#668e7c','#668c9b'][i],0,h*.57,-.21,body);box(.25,.12,.035,'#e6d5ad',0,h*.53,-.31,body);}else{box(.24,.34,.07,'#65856b',-.3,h*.44,.08,body);}
  root.position.set(0,.42,32+i*.47);root.rotation.y=Math.PI;return {root,body,limbs,h,name:names[i],walk:0};}
 for(let i=0;i<5;i++)people.push(person(i));const leader=people[0].root;
 const marker=torus(.95,.065,'#f8db81',0,.49,30.6,cityLayer);
 const beacon=mesh(new T.CylinderGeometry(.05,.5,6,12,1,true),'#ffe6a0',0,3.3,30.6,cityLayer,{transparent:true,opacity:.17,depthWrite:false});
 const labelEls=stops.map((s,i)=>{const el=document.createElement('button');el.className='city-label';el.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${s.place}`;el.onclick=()=>events.select?.(i);labels.appendChild(el);return el;});
 const actorLabel=document.createElement('div');actorLabel.className='actor-label';labels.appendChild(actorLabel);
 // Cell diagram replaces the city at the story's final reveal.
 const diagramLabels=[];const diagram=new T.Group();diagram.visible=false;scene.add(diagram);const cell=sphere(1,'#c9d9ab',0,.5,0,diagram);cell.scale.set(30,.9,24);cell.material=new T.MeshStandardMaterial({color:'#c9d9ab',transparent:true,opacity:.86});const cellRim=torus(29,.35,'#789b6a',0,.7,0,diagram);cellRim.scale.y=.81;
 const vac=sphere(1,'#83c5d2',6,1.4,0,diagram);vac.scale.set(13,.75,14);const nuc=sphere(4,'#a992bc',-9,2,0,diagram);nuc.scale.y=.35;sphere(1.4,'#806393',-9,3,0,diagram);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;const org=sphere(1,i%2?'#bb9657':'#6b9a56',Math.cos(a)*23,1.6,Math.sin(a)*18,diagram);org.scale.set(i%2?2.3:2.6,.6,1.2);org.rotation.y=a;for(let j=0;j<3;j++){const fold=torus(.65,.09,i%2?'#8b6b39':'#a6c281',0,.4,(j-1)*.45,org);fold.scale.x=.45;}}
 // Folded ER, Golgi sacs and small particles complete the labelled biology model.
 for(let i=0;i<4;i++){const fold=torus(5+i*.7,.18,'#c5b17c',-9,1.6,0,diagram);fold.scale.y=.7;}
 for(let i=0;i<4;i++){const sac=sphere(1,'#d4a085',-16+i*.25,1.6,9+i*.65,diagram);sac.scale.set(2.7,.25,.45);}
 for(let i=0;i<22;i++){const a=rnd()*Math.PI*2,r=6+rnd()*3;sphere(.18,'#8b8494',-9+Math.cos(a)*r,2,Math.sin(a)*r,diagram);}
 sphere(1.15,'#b599c3',-20,1.7,-8,diagram);
 const modelLabels=[['Cell membrane',-22,-13],['Chloroplast',-23,1],['Golgi apparatus',-15,14],['Endoplasmic reticulum',-10,-8],['Ribosomes',-18,-3],['Mitochondrion',17,-14],['Vacuole',7,2],['Lysosome / lytic vacuole',-21,-9],['Nucleus',-9,1]];
 modelLabels.forEach(([name,x,z])=>{const el=document.createElement('div');el.className='diagram-label';el.textContent=name;el.hidden=true;labels.appendChild(el);diagramLabels.push({el,x,z});});
 sign('A CELL • MANY PARTS, ONE LIVING SYSTEM',0,2,27,17,'#456c57',diagram).rotation.x=-Math.PI/2;
 let burst=0;const sparks=Array.from({length:18},(_,i)=>{const m=sphere(.065,['#e8c56d','#a5c983','#e9b099'][i%3],0,0,0);m.visible=false;return m;});
 let mode='follow',paused=true,story=false,done=0,active=0,travelPath=[],travelIndex=-1,near=-1,arrived=-1,heading=Math.PI,yaw=0,pitch=.32,distance=8.6,drag=null,emergency=false,broken=new Set(),speaker=0,revealTime=0;
 let followYaw=0,followCamera=false,freeLookUntil=0;
 const history=[leader.position.clone()];let worldTime=0,lastStatus=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clearDrag(){drag=null;}
 const dampAngle=(from,to,amount)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*amount;
 window.addEventListener('blur',clearDrag);document.addEventListener('visibilitychange',clearDrag);
 renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(!drag||story||paused||mode==='reveal')return;yaw-=(e.clientX-drag.x)*.006;pitch=T.MathUtils.clamp(pitch+(e.clientY-drag.y)*.004,.07,.9);freeLookUntil=worldTime+1.1;drag={x:e.clientX,y:e.clientY};});renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('pointercancel',()=>drag=null);
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=T.MathUtils.clamp(distance+e.deltaY*.007,4,13);},{passive:false});
 function interact(){if(!paused&&!story&&near>=0&&near<=done)events.arrive?.(near);}
 function toggleMap(){if(mode==='reveal')return;mode=mode==='map'?'follow':'map';events.mode?.(mode);}
 function travel(i){active=i;mode='follow';story=false;clearDrag();arrived=-1;travelIndex=i;const d=destinations[i];marker.position.set(d.x,.49,d.z);beacon.position.set(d.x,3.3,d.z);travelPath=findRoute(leader.position,d,obstacles,done>0,roads);if(!travelPath.length&&Math.hypot(leader.position.x-d.x,leader.position.z-d.z)>1.2){events.blocked?.();return false;}events.mode?.('guided');return true;}
 function updateActor(actor,dx,dz,dt,t){const speed=Math.hypot(dx,dz)/Math.max(dt,.001);actor.walk=T.MathUtils.lerp(actor.walk,Math.min(speed/2,1),1-Math.exp(-dt*10));if(speed>.05){const targetAngle=Math.atan2(dx,dz);actor.root.rotation.y+=Math.atan2(Math.sin(targetAngle-actor.root.rotation.y),Math.cos(targetAngle-actor.root.rotation.y))*Math.min(1,dt*10);}const wave=reduced?0:Math.sin(t*9)*actor.walk*.58;actor.limbs[0].rotation.x=wave;actor.limbs[1].rotation.x=-wave;actor.limbs[2].rotation.x=-wave;actor.limbs[3].rotation.x=wave;actor.body.position.y=reduced?0:Math.abs(Math.sin(t*9))*.035*actor.walk;}
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);resize();
 const temp=new T.Vector3(),look=new T.Vector3(),camGoal=new T.Vector3();const clock=new T.Clock();const raycaster=new T.Raycaster();
 const cameraWalls=obstacles.filter(o=>o.w>1).map(o=>{const b=new T.Mesh(new T.BoxGeometry(o.w,4.5,o.d));b.position.set(o.x,2.3,o.z);b.updateMatrixWorld();return b;});
 function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);if(!paused)worldTime+=dt;const t=worldTime;const old=leader.position.clone();let dx=0,dz=0;
 if(!paused&&!story&&mode!=='reveal'){
  if(travelPath.length){const p=travelPath[0],len=Math.hypot(p.x-leader.position.x,p.z-leader.position.z);if(len<.13)travelPath.shift();else{const amount=Math.min(len,dt*3.5);dx=(p.x-leader.position.x)/len*amount;dz=(p.z-leader.position.z)/len*amount;}}
  moveWithCollision(leader.position,dx,dz,obstacles,done>0);leader.position.y=.42;
 }
 const actualX=leader.position.x-old.x,actualZ=leader.position.z-old.z;updateActor(people[0],actualX,actualZ,dt,t);
 if(Math.hypot(actualX,actualZ)>.001){heading=leader.rotation.y;followYaw=Math.atan2(-actualX,-actualZ);followCamera=true;if(history[0].distanceTo(leader.position)>.1){history.unshift(leader.position.clone());if(history.length>180)history.pop();}}
 if(followCamera&&!drag&&worldTime>=freeLookUntil&&mode==='follow')yaw=dampAngle(yaw,followYaw,reduced?1:1-Math.exp(-dt*4.8));
 people.slice(1).forEach((actor,j)=>{const before=actor.root.position.clone();let target;
  if(story){const angle=(j-1.5)*.4;target=new T.Vector3(leader.position.x+Math.sin(angle)*2.3,.42,leader.position.z+1.7+Math.cos(angle)*.2);}
  else{target=(history[Math.min(history.length-1,(j+1)*9)]||leader.position).clone();const side=(j%2?1:-1)*.4;target.x+=Math.cos(heading)*side;target.z-=Math.sin(heading)*side;}
  if(!paused){const delta=target.sub(actor.root.position),len=Math.hypot(delta.x,delta.z);if(len>.13){const speed=Math.min(len,dt*(story?2.3:3.8));moveWithCollision(actor.root.position,delta.x/len*speed,delta.z/len*speed,obstacles,done>0,.23);}}
  updateActor(actor,actor.root.position.x-before.x,actor.root.position.z-before.z,dt,t+j*.2);if(story){const l=locations[active];actor.root.rotation.y=Math.atan2(l.x-actor.root.position.x,l.z-actor.root.position.z);}
 });
 people.forEach(p=>{p.limbs[2].rotation.z=0;p.limbs[3].rotation.z=0;});
 if(story){const l=locations[active];leader.rotation.y=Math.atan2(l.x-leader.position.x,l.z-leader.position.z);if(speaker>=0&&speaker<5&&!reduced)people[speaker].limbs[3].rotation.z=-.65-Math.sin(t*3)*.15;}
 let best=-1,bestDist=3;destinations.forEach((p,i)=>{const d=Math.hypot(leader.position.x-p.x,leader.position.z-p.z);if(d<bestDist){best=i;bestDist=d;}});near=best;
 if(!paused&&!story&&travelIndex>=0&&!travelPath.length&&near===travelIndex&&arrived!==travelIndex){arrived=travelIndex;travelIndex=-1;events.arrive?.(arrived);}
 if(!paused&&!story&&mode!=='reveal'&&near===done&&near!==arrived&&bestDist<1.5){arrived=near;travelIndex=-1;travelPath=[];events.arrive?.(near);}
 if(moleculeTime>0){moleculeTime-=dt;molecule.visible=true;molecule.position.set(-1,1.4+Math.sin(t*4)*.1,29-(1.8-moleculeTime)*(moleculeAllowed?2.4:-1.2));}else molecule.visible=false;
 gatePanels.forEach(p=>{p.position.y=T.MathUtils.lerp(p.position.y,p.userData.baseY+(done>0?2.2:0),dt*2);});
 roof.visible=Math.hypot(leader.position.x,leader.position.z)>9&&mode!=='reveal';nucleusWalls.material.transparent=true;nucleusWalls.material.opacity=active===8 && story ? .6 : 1;
 couriers.forEach((cart,i)=>{const u=(t*.009+i/4)%1,p=route.getPointAt(u);cart.position.copy(p);cart.position.y=.45;cart.lookAt(route.getPointAt(Math.min(.999,u+.003)).add(new T.Vector3(0,.45,0)));cart.visible=!broken.has(2);});
 parcels.forEach((p,i)=>{p.position.set(locations[2].x-2.4+((t*.6+i*.9)%4.8),1.2,locations[2].z+2.9);p.visible=!broken.has(2);});
 beads.forEach((p,i)=>{p.position.set(locations[4].x-1.5+((t*.45+i*.42)%3),1.97,locations[4].z+2.2);p.visible=!broken.has(4);});
 steam.forEach((p,i)=>{const phase=(t*.45+i*.27)%3;p.position.set(locations[5].x+(i%2?.65:-.7)*1.8,4.8+phase,locations[5].z-.7);p.scale.setScalar(.7+phase*.45);p.material.opacity=(1-phase/3)*.27;p.visible=!broken.has(5);});
 debris.forEach((p,i)=>{const phase=(t*.6+i*.38)%2.8;p.position.set(locations[7].x+phase-1.4,.7,locations[7].z+3);p.rotation.x=t;p.scale.setScalar(phase>1.8?.4:1);p.visible=!broken.has(7);});
 screens.forEach((p,i)=>{const failed=broken.has([1,2,4,5,6,7][i]);p.material.color.copy(failed?new T.Color('#b76b59'):p.userData.base);p.material.emissive.set(failed?'#a12815':'#34522c');p.material.emissiveIntensity=failed?(reduced?.2:.2+.15*Math.sin(t*5)):.15;});
 if(burst>0)burst-=dt;sparks.forEach((p,i)=>{p.visible=burst>0;if(p.visible){const a=i/18*Math.PI*2,r=(2-burst)*1.8;p.position.set(leader.position.x+Math.cos(a)*r,1+(2-burst)*1.8,leader.position.z+Math.sin(a)*r);p.scale.setScalar(Math.max(.1,burst));}});
 lamps.forEach((p,i)=>p.material.emissiveIntensity=broken.has(5)?.05:done>5?1.7+.2*Math.sin(t+i):.65);solar.visible=!broken.has(1);solar.material.opacity=reduced?.08:.08+Math.sin(t)*.025;waterStream.scale.y=1+Math.sin(t*2)*.03;
 faces.forEach((f,i)=>f.mouth.scale.y=story&&speaker===5&&active===i?1+Math.abs(Math.sin(t*9))*3:1);marker.visible=mode!=='reveal'&&!story;beacon.visible=marker.visible;marker.rotation.z=t*.5;
 if(emergency&&!reduced)sun.intensity=2.2+Math.sin(t*4)*.4;else sun.intensity=3.1;
 if(mode==='map'){camGoal.set(29,63,46);look.set(0,0,0);}
 else if(mode==='reveal'){revealTime+=dt;camGoal.set(0,68,24);look.set(0,0,0);if(revealTime>2.2){cityLayer.visible=false;diagram.visible=true;people.forEach(p=>p.root.visible=false);}}
 else{const facing=followCamera?followYaw:yaw;if(story){const loc=locations[active];look.set(leader.position.x*.65+loc.x*.35,1.7,leader.position.z*.65+loc.z*.35);camGoal.set(leader.position.x+Math.sin(yaw)*10+Math.cos(yaw)*2.1,5.2,leader.position.z+Math.cos(yaw)*10-Math.sin(yaw)*2.1);}else{look.set(leader.position.x-Math.sin(facing)*1.3,1.5,leader.position.z-Math.cos(facing)*1.3);camGoal.set(leader.position.x+Math.sin(yaw)*distance,3.1+Math.sin(pitch)*distance*.35,leader.position.z+Math.cos(yaw)*distance);}
  const direction=camGoal.clone().sub(look),len=direction.length();raycaster.set(look,direction.normalize());raycaster.far=len;const hit=raycaster.intersectObjects(cameraWalls,false)[0];if(hit&&hit.distance>1)camGoal.copy(look).addScaledVector(direction,Math.max(1.2,hit.distance-.3));
 }
 camera.position.lerp(camGoal,reduced?1:1-Math.exp(-dt*5));temp.lerp(look,reduced?1:1-Math.exp(-dt*7));camera.lookAt(temp);
 diagramLabels.forEach(({el,x,z})=>{el.hidden=!diagram.visible;const v=new T.Vector3(x,3,z).project(camera);el.style.transform=`translate(-50%,-50%) translate(${(v.x*.5+.5)*host.clientWidth}px,${(-v.y*.5+.5)*host.clientHeight}px)`;});
 labelEls.forEach((el,i)=>{const l=locations[i],d=Math.hypot(leader.position.x-l.x,leader.position.z-l.z),v=new T.Vector3(l.x,i===8?10:6,l.z).project(camera);el.hidden=mode==='reveal'||(mode!=='map'&&(d>15||story))||v.z<0||v.z>1;el.style.transform=`translate(-50%,-50%) translate(${(v.x*.5+.5)*host.clientWidth}px,${(-v.y*.5+.5)*host.clientHeight}px)`;});
 const who=people[Math.max(0,Math.min(4,speaker))],v=who.root.position.clone().add(new T.Vector3(0,who.h+.35,0)).project(camera);actorLabel.hidden=mode==='map'||mode==='reveal'||!story||speaker===5||v.z<0||v.z>1;actorLabel.textContent=who.name;actorLabel.style.transform=`translate(-50%,-50%) translate(${(v.x*.5+.5)*host.clientWidth}px,${(-v.y*.5+.5)*host.clientHeight}px)`;
 if(t-lastStatus>.15){lastStatus=t;host.dataset.x=leader.position.x.toFixed(2);host.dataset.z=leader.position.z.toFixed(2);host.dataset.cameraX=camera.position.x.toFixed(2);host.dataset.cameraZ=camera.position.z.toFixed(2);host.dataset.mode=mode;host.dataset.travel=String(travelIndex);events.status?.({x:leader.position.x,z:leader.position.z,near,mode,guided:travelPath.length>0,distance:Math.hypot(leader.position.x-destinations[active].x,leader.position.z-destinations[active].z)});}
 renderer.render(scene,camera);
 }
 requestAnimationFrame(frame);
 return {available:true,setProgress(n,a){done=n;active=a;labelEls.forEach((el,i)=>{el.classList.toggle('locked',i>done);el.classList.toggle('visited',i<done);el.classList.toggle('current',i===active);el.disabled=i>done;});},travel,interact,setPaused(value){paused=value;clearDrag();},setStory(value){story=value;clearDrag();if(value){travelPath=[];travelIndex=-1;mode='follow';}},setSpeaker(name){speaker=['teacher','aria','ben','zoya','leo','organelle'].indexOf(name);},overview:toggleMap,follow(){mode='follow';followYaw=leader.rotation.y+Math.PI;followCamera=true;},zoom(f){distance=T.MathUtils.clamp(distance*f,4,13);},celebrate(){burst=2;},setEmergency(value){emergency=value;broken=value?new Set([5,2,4,0,7,1]):new Set();},repair(i){broken.delete(i);},demonstrate(i,part=0){if(i===0){moleculeTime=1.8;moleculeAllowed=part!==2;molecule.material.color.set(moleculeAllowed?'#87d9df':'#bd7867');}if(i===6){water.scale.y=Math.min(1.1,.7+part*.15);}if(i===1){solar.material.opacity=.22;}},reveal(){clearDrag();travelPath=[];mode='reveal';story=true;emergency=false;broken.clear();revealTime=0;},reset(){done=0;active=0;mode='follow';paused=false;story=false;travelIndex=-1;travelPath=[];arrived=-1;leader.position.set(0,.42,32);people.forEach((p,i)=>{p.root.visible=true;p.root.position.set(0,.42,32+i*.47)});history.splice(0,history.length,leader.position.clone());cityLayer.visible=true;diagram.visible=false;emergency=false;broken.clear();yaw=0;followYaw=0;followCamera=false;},getPosition(){return{x:leader.position.x,z:leader.position.z}}};
}
