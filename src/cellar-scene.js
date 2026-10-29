import {findPath,nearestWalkable} from './navigation.js';
import {createCharacterAnimator,directionFromVector,characterEmotion} from './character-animation.js';
import {staffDefinition} from './content.js';

export const CELLAR_MAP={width:816,height:530,stairs:{x:625,y:196},producer:{x:488,y:308},pickup:{x:458,y:390},storage:{x:448,y:190}};
export const CELLAR_NAV={bounds:{x:0,y:0,width:816,height:530},obstacles:[
  {x:0,y:0,width:167,height:530},
  {x:167,y:0,width:427,height:170},
  {x:676,y:0,width:140,height:530},
  {x:516,y:250,width:160,height:280},
  {x:263,y:216,width:126,height:248},
]};
export function cellarPath(actor,destination){return findPath(actor,destination,CELLAR_NAV);}
export function moveCellarActor(actor,dt,pace=62){
  let distance=dt*pace;
  while(actor.path?.length&&distance>0){const p=actor.path[0],dx=p.x-actor.x,dy=p.y-actor.y,d=Math.hypot(dx,dy);actor.direction=directionFromVector(dx,dy,actor.direction??'down');if(d<=distance){actor.x=p.x;actor.y=p.y;actor.path.shift();distance-=d;}else{actor.x+=dx/d*distance;actor.y+=dy/d*distance;distance=0;}}
}
export function approachCellarPerson(manager,person){
  if(manager.path?.length)return false;
  if(Math.hypot(person.x-manager.x,person.y-manager.y)<65)return true;
  const goal=nearestWalkable({x:person.x,y:person.y+43},CELLAR_NAV);manager.goal=goal;manager.path=goal?cellarPath(manager,goal):[];return false;
}
const mouseSpots=[{x:216,y:414},{x:445,y:468},{x:468,y:237},{x:228,y:228}];
const pixel=(atlas,size,extra='')=>`<canvas width="${size*2}" height="${size*2}" data-art="${atlas}" data-frame="0" aria-hidden="true" ${extra}></canvas>`;
export function createCellarScene({host,getState,getRenderer,onChat,onExit,onDrive,onEndChat}){
  const canvas=host.querySelector('#cellar-scene'),ctx=canvas.getContext('2d'),layer=host.querySelector('.cellar-actors'),animator=createCharacterAnimator();
  const manager={id:'cellar-player',...CELLAR_MAP.stairs,path:[],direction:'down'},actors=new Map(),mice=new Map();
  let stopped=false,request=0,previous=performance.now(),lastPaint=0,targetChat=null,targetExit=false,lastCaught=getState().cellar.tom.caught,lastHelper=getState().cellar.helperBusy??0,frameTransform={scale:1,x:0,y:0};
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const project=p=>({x:frameTransform.x+p.x*frameTransform.scale,y:frameTransform.y+p.y*frameTransform.scale});
  const unproject=(x,y)=>({x:(x-frameTransform.x)/frameTransform.scale,y:(y-frameTransform.y)/frameTransform.scale});
  function route(actor,p){const goal=nearestWalkable(p,CELLAR_NAV);if(!goal)return;if(actor.goal&&Math.hypot(actor.goal.x-goal.x,actor.goal.y-goal.y)<4)return;actor.goal=goal;actor.path=cellarPath(actor,goal);}
  function createActor(id,point){
    const def=id==='tom'?{name:'Tom',atlas:'crew-tom-atlas'}:staffDefinition(id),button=document.createElement('button');
    button.className='cellar-actor'+(id==='tom'?' cellar-tom':'');button.dataset.cellarActor=id;
    if(id!=='tom')button.dataset.staff=id;
    button.type='button';button.setAttribute('aria-label',id==='tom'?'Tom · 捕鼠伙伴':'和'+def.name+'交谈');button.title=def.name;
    button.innerHTML=pixel(def.atlas,72)+`<span class="cellar-actor-name">${def.name}</span><span class="cellar-map-speech" hidden></span>`;layer.append(button);
    const actor={id,...point,path:[],direction:'down',button,goal:null,catchUntil:0};actors.set(id,actor);getRenderer().paint(button);return actor;
  }
  function sync(time){
    const s=getState(),c=s.cellar,ids=new Set(c.workers.map(w=>w.id));if(c.tom.hired)ids.add('tom');
    for(const [id,a] of actors)if(!ids.has(id)){a.button.remove();actors.delete(id);}
    for(const w of c.workers)if(!actors.has(w.id))createActor(w.id,w.id==='wenxin'?CELLAR_MAP.producer:CELLAR_MAP.storage);
    if(c.tom.hired&&!actors.has('tom'))createActor('tom',{x:215,y:484});
    const alive=new Set(c.pests.mice.map(m=>m.id)),removed=[];
    for(const [id,m] of mice)if(!alive.has(id)){removed.push(m);m.button.remove();mice.delete(id);}
    for(const [i,m] of c.pests.mice.entries())if(!mice.has(m.id)){
      const button=document.createElement('button');button.type='button';button.className='cellar-map-mouse';button.dataset.cellarMouse=m.id;button.setAttribute('aria-label','驱赶老鼠');button.title='点击驱赶';button.innerHTML=pixel('crew-mouse-atlas',24);layer.append(button);
      mice.set(m.id,{...mouseSpots[i%4],id:m.id,button,path:[],direction:'left',goal:null,seed:i});getRenderer().paint(button);
    }
    if(c.tom.caught>lastCaught){const a=actors.get('tom');if(a){a.catchUntil=time+2200;if(removed[0])route(a,removed[0]);}}lastCaught=c.tom.caught;
    if((c.helperBusy??0)>lastHelper){const a=actors.get('gemini');if(a){a.catchUntil=time+2200;if(removed.at(-1))route(a,removed.at(-1));}}lastHelper=c.helperBusy??0;
    return s;
  }
  function place(actor,size=49){const p=project(actor),scale=frameTransform.scale;actor.button.style.left=p.x+'px';actor.button.style.top=p.y+'px';actor.button.style.width=size*scale+'px';actor.button.style.height=(size+9)*scale+'px';actor.button.style.zIndex=String(Math.round(actor.y));}
  function pose(actor,frame,emotion=''){
    const c=actor.button.querySelector('canvas');if(c.dataset.motionFrame!==String(frame)||c.dataset.emotion!==emotion){c.dataset.motionFrame=String(frame);c.dataset.emotion=emotion;getRenderer().paint(actor.button);}
    c.dataset.sceneX=actor.x.toFixed(1);c.dataset.sceneY=actor.y.toFixed(1);
  }
  function draw(time){
    if(stopped)return;request=requestAnimationFrame(draw);if(time-lastPaint<30)return;
    const dt=Math.min(.1,(time-previous)/1000);previous=time;lastPaint=time;const s=sync(time),c=s.cellar,active=s.phase==='open'&&!s.paused,scale=Math.min(innerWidth/816,innerHeight/530),dpr=devicePixelRatio||1;
    if(canvas.width!==Math.round(innerWidth*dpr)||canvas.height!==Math.round(innerHeight*dpr)){canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);}
    frameTransform={scale,x:(innerWidth-816*scale)/2,y:(innerHeight-530*scale)/2};
    host.style.setProperty('--cellar-scene-scale',String(scale));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#10171c';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.translate(frameTransform.x,frameTransform.y);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;getRenderer().drawCellarMap(ctx);
    if(!s.paused)moveCellarActor(manager,dt,100);
    for(const [id,a] of actors){
      const w=c.workers.find(w=>w.id===id),chatting=w?.chatWith==='player';
      if(active&&!chatting){
        if(a.catchUntil<=time){
          if(id==='tom'){if(!a.path.length){const rat=[...mice.values()][0],patrol=mouseSpots[Math.floor(s.elapsed/7)%4];route(a,rat??patrol);}}
          else {const latest=c.activity.findLast(v=>v.staff===id&&v.day===s.day),age=latest?s.elapsed-latest.at:Infinity;
            route(a,age<2?CELLAR_MAP.pickup:age<6?CELLAR_MAP.stairs:id==='wenxin'?CELLAR_MAP.producer:CELLAR_MAP.storage);}
        }
        moveCellarActor(a,dt,id==='tom'?78:62);
      }
      if(w){w.x=a.x;w.y=a.y;}
      const preparing=active&&c.activity.some(v=>v.staff===id&&v.day===s.day&&s.elapsed-v.at<2);
      a.chatWith=chatting?'player':null;
      const emotion=chatting?characterEmotion(w):a.catchUntil>time?'working':preparing?'working':w?characterEmotion(w):'neutral';
      const p=animator.pose(a,time,{paused:!active||chatting,reduced:reduced(),facePoint:chatting?manager:null,emotion});pose(a,p.frame);place(a,id==='tom'?42:49);
      const speech=a.button.querySelector('.cellar-map-speech'),speaking=!!w?.bubble&&w.bubbleUntil>Date.now()&&!chatting;speech.hidden=!speaking;if(speaking)speech.textContent=w.bubble.slice(0,45);
      a.button.classList.toggle('is-working',Boolean(preparing));a.button.classList.toggle('is-pouncing',id==='tom'&&c.tom.cooldown>10&&active);a.button.classList.toggle('is-assisting',id==='gemini'&&(c.helperBusy??0)>0&&active);
    }
    for(const m of mice.values()){
      if(active&&!reduced()){if(!m.path.length)route(m,mouseSpots[(m.seed+Math.floor(s.elapsed/6))%4]);moveCellarActor(m,dt,18);}
      const sprite=m.button.querySelector('canvas'),frame=active&&!reduced()?1+Math.floor(time/190)%2:0;
      if(sprite.dataset.frame!==String(frame)){sprite.dataset.frame=String(frame);getRenderer().paint(m.button);}place(m,18);
    }
    const directions={down:0,up:1,left:2,right:3},moving=manager.path.length&&!s.paused,row=moving&&!reduced()?1+Math.floor(time/160)%2:0;
    ctx.fillStyle='#dfb66a5c';ctx.beginPath();ctx.ellipse(manager.x,manager.y,12,4,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e8c17c';ctx.lineWidth=1;ctx.stroke();getRenderer().drawSprite(ctx,'player-atlas',row*4+directions[manager.direction??'down'],manager.x,manager.y,49);
    canvas.dataset.playerX=manager.x.toFixed(1);canvas.dataset.playerY=manager.y.toFixed(1);
    if(targetChat){const a=actors.get(targetChat);if(!a)targetChat=null;else if(approachCellarPerson(manager,a)){const id=targetChat;targetChat=null;onChat(id);}}
    if(targetExit&&!manager.path.length&&Math.hypot(manager.x-CELLAR_MAP.stairs.x,manager.y-CELLAR_MAP.stairs.y)<40){targetExit=false;onExit();}
  }
  function click(event){
    const mouse=event.target.closest('[data-cellar-mouse]');if(mouse){event.stopPropagation();cancelInteraction();onEndChat?.();onDrive(mouse.dataset.cellarMouse);return;}
    const actor=event.target.closest('[data-cellar-actor]');if(actor){event.stopPropagation();if(actor.dataset.cellarActor==='tom')return;onEndChat?.();targetChat=actor.dataset.cellarActor;targetExit=false;manager.goal=null;const a=actors.get(targetChat);route(manager,{x:a.x,y:a.y+43});return;}
    if(event.target!==canvas)return;onEndChat?.();targetChat=null;const r=canvas.getBoundingClientRect(),point=unproject(event.clientX-r.left,event.clientY-r.top);
    targetExit=point.x>594&&point.x<676&&point.y<185;manager.goal=null;route(manager,targetExit?CELLAR_MAP.stairs:point);
  }
  function cancelInteraction(){targetChat=null;targetExit=false;manager.path=[];manager.goal=null;}
  host.addEventListener('click',click);request=requestAnimationFrame(draw);
  return {project,cancelInteraction,dispose(){stopped=true;cancelAnimationFrame(request);host.removeEventListener('click',click);}};
}
