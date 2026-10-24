import {WORLD,DRINKS,staffDefinition} from './content.js';

export async function createRenderer(canvas){
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const manifest=await fetch('assets/manifest.json').then(r=>{if(!r.ok)throw new Error('图集清单读取失败');return r.json();});
  const images={};
  await Promise.all(Object.entries(manifest.assets).filter(([id])=>id!=='zone-studies').map(async([id,a])=>{
    const img=new Image();img.src=a.src;
    try {await img.decode();images[id]=img;}catch(error){if(id!=='event-atlas')throw error;}
  }));
  let latest=null,hover=null,night=0,zoom=1;
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const camera={scale:1,x:0,y:0,width:WORLD.width,height:WORLD.height};
  const stations=[{id:'inventory',x:230,y:380},{id:'ledger',x:590,y:355},{id:'hire',x:1310,y:390},{id:'upgrades',x:1110,y:355},{id:'events',x:190,y:540}];
  function resize(player){
    const bounds=canvas.getBoundingClientRect(),width=Math.max(1,bounds.width),height=Math.max(1,bounds.height),dpr=window.devicePixelRatio||1;
    const pw=Math.round(width*dpr),ph=Math.round(height*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const scale=Math.max(width/WORLD.width,height/WORLD.height)*zoom;
    const targetX=player?.x??WORLD.width/2;
    const targetY=player?.y??WORLD.height/2;
    Object.assign(camera,{width,height,scale,x:Math.max(width/scale/2,Math.min(WORLD.width-width/scale/2,targetX)),y:Math.max(height/scale/2,Math.min(WORLD.height-height/scale/2,targetY))});
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(width/2-camera.x*scale),dpr*(height/2-camera.y*scale));
    ctx.imageSmoothingEnabled=false;
  }
  // CSS coordinates relative to the canvas, suitable for overlay hotspots.
  function project(point){return {x:(point.x-camera.x)*camera.scale+camera.width/2,y:(point.y-camera.y)*camera.scale+camera.height/2};}
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(1,Math.min(1.3,zoom-e.deltaY*.001));},{passive:false});
  const effects=[],particles=[],seen=new Set();let effectState=null,effectDay=null,effectElapsed=0;
  function frame(atlas,index){return manifest.assets[atlas]?.frames?.[index];}
  function art(target,atlas,index,x,y,height,width=null){
    const f=frame(atlas,index);if(!f||!images[atlas])return;
    const [sx,sy,sw,sh]=f.rect,h=height,w=width??sw/sh*h;
    target.drawImage(images[atlas],sx,sy,sw,sh,Math.round(x-w/2),Math.round(y-h),Math.round(w),Math.round(h));
  }
  function icon(target,index,x,y,size){const f=frame('items-atlas',index);if(!f||!images['items-atlas'])return;const [sx,sy,sw,sh]=f.rect;
    const scale=Math.min(size/sw,size/sh);target.drawImage(images['items-atlas'],sx,sy,sw,sh,x-sw*scale/2,y-sh*scale/2,sw*scale,sh*scale);}
  function eventIcon(index,x,y,size){art(ctx,'event-atlas',index,x,y+size/2,size);}
  function rounded(x,y,w,h,r=9){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function pill(x,y,text,{fill='#152b2aeb',color='#f0e6d3',size=18}={}){
    ctx.font=`500 ${size}px "Microsoft YaHei",sans-serif`;const width=ctx.measureText(text).width+26;
    rounded(x-width/2,y,width,32);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle='#d8c19865';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,x,y+23);ctx.textAlign='left';
  }
  function speech(x,y,text){
    ctx.font='20px "Microsoft YaHei",sans-serif';const chars=[...text.slice(0,30)],lines=[];let line='';
    for(const c of chars){if(ctx.measureText(line+c).width>210){lines.push(line);line=c;}else line+=c;}if(line)lines.push(line);
    const h=lines.length*28+22,w=235,left=Math.max(12,Math.min(WORLD.width-w-12,x-w/2));
    const below=project({x,y:y-h}).y<130,top=below?y+140:y-h;
    rounded(left,top,w,h,10);ctx.fillStyle='#fff2dbf5';ctx.fill();ctx.strokeStyle='#ad9875';ctx.stroke();
    const tail=below?top:top+h;ctx.beginPath();ctx.moveTo(x-7,tail);ctx.lineTo(x,tail+(below?-9:9));ctx.lineTo(x+7,tail);ctx.fill();
    ctx.fillStyle='#293c36';lines.forEach((l,i)=>ctx.fillText(l,left+13,top+30+i*28));
  }
  function tableDraw(t,selected){
    if(selected){ctx.strokeStyle='#b5ddcf';ctx.lineWidth=3;ctx.setLineDash([9,6]);rounded(t.x-140,t.y-100,280,180,18);ctx.stroke();ctx.setLineDash([]);}
    art(ctx,'furniture-atlas',t.shape,t.x,t.y+50,134);
    if(t.status==='dirty'){ctx.fillStyle='#b48f6b';ctx.fillRect(t.x-22,t.y-7,9,6);ctx.fillRect(t.x+17,t.y+2,7,5);icon(ctx,0,t.x+30,t.y-15,29);}
    if(['served','leaving'].includes(t.status)&&t.order){icon(ctx,DRINKS[t.order.drink].icon,t.x-20,t.y-24,37);if(t.order.quantity===2)icon(ctx,DRINKS[t.order.drink].icon,t.x+28,t.y-13,36);}
  }
  function partyDraw(s,time,reduced){
    if(s.progression?.party?.status!=='active')return;
    const pulse=reduced?1:.88+Math.sin(time/650)*.12;
    // Lamps stay at the edges so faces, tables and the player's route stay clear.
    for(const [x,y,color] of [[180,420,'#f18e7b'],[1340,435,'#72d6dc'],[1360,800,'#f18e7b']]){
      ctx.fillStyle=color;
      for(let layer=3;layer>0;layer--){ctx.globalAlpha=.055*pulse;ctx.beginPath();ctx.ellipse(x,y,65+layer*30,30+layer*20,0,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;
    }
    eventIcon(13,1335,790,65);eventIcon(12,1400,752,48);
    const count=reduced?6:24;
    for(let i=0;i<count;i++){
      const drift=reduced?0:time*.025,x=1240+(i*31)%190,y=625+(i*47+drift)%195;
      ctx.fillStyle=['#ef9e87','#90d7cf','#e7c576'][i%3];ctx.fillRect(x,y,3+(i%2)*2,5);
    }
  }
  function destinationDraw(p,time,reduced){
    if(!p?.path?.length)return;
    const end=p.path.at(-1),pulse=reduced?1:1+Math.sin(time/180)*.1;
    ctx.save();ctx.strokeStyle='#efdc9c';ctx.fillStyle='#efdc9c66';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(end.x,end.y,17*pulse,7*pulse,0,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.ellipse(end.x,end.y,4,2,0,0,Math.PI*2);ctx.fill();
    // A handful of ground dots communicates the path without tracing the room.
    const points=[p,...p.path];let dots=0;
    for(let i=1;i<points.length&&dots<18;i++){
      const a=points[i-1],b=points[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
      for(let d=32;d<distance&&dots<18;d+=38,dots++){
        ctx.beginPath();ctx.ellipse(a.x+(b.x-a.x)*d/distance,a.y+(b.y-a.y)*d/distance,2,1.4,0,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }
  function workGesture(w,time,reduced){
    if(w.path?.length||w.job?.suspended||!w.job)return;
    const preparing=w.job.stage==='prepare',cleaning=w.job.kind==='clean';if(!preparing&&!cleaning)return;
    const swing=reduced?0:Math.sin(time/115)*5,x=w.x+24+swing,y=w.y-35;
    ctx.strokeStyle=cleaning?'#8bcfc4':'#e8d5a6';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(w.x+10,w.y-42);ctx.lineTo(x,y);ctx.stroke();
    if(cleaning){ctx.fillStyle='#a8d4c3';ctx.fillRect(x-7,y-2,15,7);}
    else {eventIcon(15,x,y,22);if(!reduced){ctx.strokeStyle='#eee4cf90';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,y-15);ctx.lineTo(x-5,y-21+swing*.4);ctx.stroke();}}
  }
  function collectEffects(s,time,reduced){
    if(effectState!==s||effectDay!==s.day||s.elapsed<effectElapsed){
      effects.length=0;particles.length=0;seen.clear();for(const e of s.events)seen.add(e.id);effectState=s;effectDay=s.day;
    }
    effectElapsed=s.elapsed;
    for(const e of s.events){
      if(seen.has(e.id))continue;seen.add(e.id);
      const table=s.tables.find(t=>t.id===e.table);let x=table?.x??WORLD.bar.x,y=(table?.y??WORLD.bar.y)-50,text='',count=0;
      if(e.type==='served'){
        const amount=e.amount??e.total??((DRINKS[e.drink]?.price??0)*(e.quantity??table?.order?.quantity??1));
        const deferred=Number.isFinite(e.deferred)?Math.max(0,e.deferred):0;
        text=deferred?`记账 +${deferred} G${amount>deferred?` · 小费 +${amount-deferred}`:''}`:`+${amount} G`;count=deferred?(amount>deferred?3:0):10;
      }else if(e.type==='cameo-paid'){x=235;y=590;text=`全场买单 +${e.amount??e.total??0} G`;count=54;}
      else if(e.type==='combo-tier'){x=s.player?.x??768;y=(s.player?.y??600)-110;text=`${e.count??e.tier??s.progression?.combo?.count??3} COMBO`;count=24;}
      if(!text)continue;
      effects.push({x,y,text,born:time,large:e.type!=='served'});if(effects.length>24)effects.shift();
      if(!reduced)for(let i=0;i<count&&particles.length<120;i++){
        const angle=i*2.399963,velocity=35+(i*17)%105;
        particles.push({x,y,born:time,vx:Math.cos(angle)*velocity,vy:-65-Math.abs(Math.sin(angle))*velocity,size:3+i%3});
      }
    }
    if(seen.size>180){seen.clear();for(const e of s.events)seen.add(e.id);}
  }
  function effectsDraw(time,reduced){
    if(reduced)particles.length=0;
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i],age=(time-p.born)/1000;if(age>1.3){particles.splice(i,1);continue;}
      const x=p.x+p.vx*age,y=p.y+p.vy*age+100*age*age;
      ctx.globalAlpha=Math.max(0,1-age/1.3);ctx.fillStyle=i%3?'#edc96b':'#fff0b6';ctx.fillRect(x,y,p.size,p.size);ctx.globalAlpha=1;
    }
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i],age=(time-e.born)/1000;if(age>2.5){effects.splice(i,1);continue;}
      ctx.globalAlpha=Math.min(1,(2.5-age)*2);ctx.fillStyle=e.large?'#fff0b6':'#ecdb98';ctx.strokeStyle='#26372b';ctx.lineWidth=4;
      ctx.font=`bold ${e.large?29:25}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';const y=e.y-(reduced?0:age*25);
      ctx.strokeText(e.text,e.x,y);ctx.fillText(e.text,e.x,y);ctx.textAlign='left';ctx.globalAlpha=1;
      if(e.large)eventIcon(14,e.x,e.y+35,44);
    }
  }
  function draw(s,time,lighting='auto'){
    latest=s;resize(s.player);const reduced=Boolean(motion?.matches),n=lighting==='night'?1:lighting==='day'?0:Math.max(0,Math.min(1,(s.elapsed-250)/80));night=n;
    collectEffects(s,time,reduced);
    ctx.clearRect(0,0,WORLD.width,WORLD.height);ctx.globalAlpha=1;ctx.drawImage(images['tavern-day'],0,0,WORLD.width,WORLD.height);
    if(n>0){ctx.globalAlpha=n;ctx.drawImage(images['tavern-night'],0,0,WORLD.width,WORLD.height);ctx.globalAlpha=1;}
    const objects=[];
    // Quiet decor belongs below the feet-sorted objects.
    art(ctx,'furniture-atlas',14,768,805,130,155);
    partyDraw(s,time,reduced);destinationDraw(s.player,time,reduced);
    if(s.upgrades.plants){objects.push({y:620,draw:()=>art(ctx,'furniture-atlas',4,190,620,115)});objects.push({y:620,draw:()=>art(ctx,'furniture-atlas',4,1345,620,115)});}
    for(const t of s.tables){
      for(const offset of [-105,105])objects.push({y:t.y-30,draw:()=>art(ctx,'furniture-atlas',2,t.x+offset,t.y+50,81)});
      objects.push({y:t.y+52,draw:()=>tableDraw(t,hover?.type==='table'&&hover.id===t.id)});
      if(t.guest){
        const moving=t.guest.path.length>0,row=moving?1+(reduced?0:Math.floor(time/180)%2):0;
        const reverse=moving&&t.guest.path[0].y<t.guest.y-10;
        objects.push({y:t.guest.y,draw:()=>art(ctx,'customers-atlas',(reverse?3:row)*4+t.guest.variant,t.guest.x,t.guest.y,86)});
        if(t.guest.party===2){
          const seated=['waiting','preparing','served'].includes(t.status),x=seated?t.x+105:t.guest.x+28,y=seated?t.y+25:t.guest.y+20;
          objects.push({y,draw:()=>art(ctx,'customers-atlas',row*4+(t.guest.variant+1)%4,x,y,85)});
        }
      }
    }
    const cameo=s.progression?.cameo;
    if(cameo?.status==='active'){
      const elapsed=s.elapsed-(cameo.startsAt??cameo.startAt??120),left=(cameo.endsAt??180)-s.elapsed;
      const entering=elapsed<4,exiting=left<4,travel=entering?Math.max(0,elapsed/4):exiting?Math.max(0,left/4):1;
      const x=200+35*travel,y=700-60*travel,index=entering||exiting?(reduced?1:1+Math.floor(time/180)%2):0;
      objects.push({y,draw:()=>{
        ctx.fillStyle='#15252355';ctx.beginPath();ctx.ellipse(x,y-3,23,8,0,0,Math.PI*2);ctx.fill();
        art(ctx,'event-atlas',index,x,y,84);eventIcon(4,x+40,y-43,29);
        pill(x,y-157,'黄仁勋 · 全场买单',{color:'#f7d987',size:15});
        if(cameo.pot>0)pill(x,y-122,`待结账 ${cameo.pot} G · ${cameo.orders??0} 桌`,{color:'#eee4cf',size:13});
      }});
    }
    for(const w of s.staff){
      const def=staffDefinition(w.id),moving=w.path.length>0,row=moving?(w.path[0].y<w.y-10?3:1+Math.floor(time/150)%2):0;
      objects.push({y:w.y,draw:()=>{
        ctx.fillStyle='#15252355';ctx.beginPath();ctx.ellipse(w.x,w.y-3,21,8,0,0,Math.PI*2);ctx.fill();
        art(ctx,'staff-atlas',row*4+def.column,w.x,w.y+(moving&&!reduced?Math.sin(time/80)*2:0),77);
        workGesture(w,time,reduced);
        if(w.job?.stage==='deliver')icon(ctx,10,w.x+29,w.y-33,34);
      }});
    }
    if(s.player){
      const p=s.player,moving=!!p.path?.length,row=p.carrying?3:moving?1+Math.floor(time/160)%2:0,direction=Math.max(0,Math.min(3,Math.floor(p.direction||0)));
      objects.push({y:p.y,draw:()=>{
        ctx.beginPath();ctx.ellipse(p.x,p.y-2,22,8,0,0,Math.PI*2);ctx.fillStyle='#b8913d35';ctx.fill();ctx.strokeStyle='#e4c575';ctx.lineWidth=2;ctx.stroke();
        art(ctx,'player-atlas',row*4+direction,p.x,p.y,88);
        workGesture(p,time,reduced);
      }});
    }
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    for(const t of s.tables){
      const labels={empty:'空闲',arriving:'入座中',waiting:'待接单',preparing:'制作中',served:'享用中',leaving:'慢走',dirty:'待收桌'};
      if((hover?.type==='table'&&hover.id===t.id)||(s.player&&Math.hypot(s.player.x-t.x,s.player.y-t.y)<210))pill(t.x,t.y-111,`${t.id.slice(1).padStart(2,'0')} · ${labels[t.status]}`,{fill:t.status==='empty'?'#18332bd9':'#233c38ed',color:t.status==='empty'?'#d1dec6':'#f7e5bd',size:17});
      if(['waiting','preparing'].includes(t.status)&&t.order){
        const x=t.x+63,y=t.y-87;rounded(x,y,75,45,8);ctx.fillStyle='#fff0d2ed';ctx.fill();icon(ctx,DRINKS[t.order.drink].icon,x+21,y+22,31);ctx.fillStyle='#384339';ctx.font='bold 21px Georgia';ctx.fillText('×'+t.order.quantity,x+40,y+30);
      }
    }
    if(s.player?.job?.stage==='prepare'&&!s.player.job.suspended&&!s.player.path?.length){
      const p=s.player,width=66,x=p.x-width/2,y=p.y-101;
      rounded(x-4,y-4,width+8,16,5);ctx.fillStyle='#20372fe8';ctx.fill();ctx.fillStyle='#e6c57e';ctx.fillRect(x,y,Math.max(2,width*(1-p.job.remaining/14)),7);
    }
    for(const w of s.staff){
      const def=staffDefinition(w.id);
      if(w.bubble&&w.bubbleUntil>Date.now()&&w.chatWith!=='player')speech(w.x,w.y-98,w.bubble);
      else if(hover?.type==='staff'&&hover.id===w.id)pill(w.x,w.y-104,`${def.name} · 点击交谈`);
      if(w.job?.stage==='prepare'){
        const x=w.x-25,y=w.y-90;ctx.fillStyle='#112a29';ctx.fillRect(x,y,50,5);ctx.fillStyle=def.color;ctx.fillRect(x,y,Math.max(3,50*(1-w.job.remaining/14)),5);
      }
    }
    effectsDraw(time,reduced);
    if(n>.1&&!reduced){
      ctx.strokeStyle=`rgba(127,209,232,${n*.28})`;ctx.lineWidth=1.5;
      for(let i=0;i<65;i++){const y=(i*83+time*.20)%1024,x=i%3===0?15+(i*31)%65:i%3===1?1450+(i*17)%85:100+(i*97)%1330;if(i%3===2&&y<950)continue;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+18);ctx.stroke();}
    }
  }
  function hitTest(clientX,clientY){
    if(!latest)return null;
    const rect=canvas.getBoundingClientRect(),x=(clientX-rect.left-camera.width/2)/camera.scale+camera.x,y=(clientY-rect.top-camera.height/2)/camera.scale+camera.y;
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    const worker=latest.staff.find(w=>Math.hypot(w.x-x,w.y-38-y)<45);if(worker)return {type:'staff',id:worker.id,x:worker.x,y:worker.y};
    const station=stations.find(p=>Math.hypot(p.x-x,p.y-y)<48);if(station)return {type:'station',...station};
    const table=latest.tables.find(t=>Math.abs(t.x-x)<140&&Math.abs(t.y-10-y)<105);
    return table?{type:'table',id:table.id,x:table.x,y:table.y+100}:{type:'ground',x,y};
  }
  canvas.addEventListener('pointermove',e=>{hover=hitTest(e.clientX,e.clientY);canvas.style.cursor=hover?.type==='ground'?'crosshair':hover?'pointer':'default';});
  canvas.addEventListener('pointerleave',()=>hover=null);
  function paint(container=document){
    container.querySelectorAll('canvas[data-art]').forEach(c=>{
      const target=c.getContext('2d'),atlas=c.dataset.art,index=Number(c.dataset.frame||0);target.clearRect(0,0,c.width,c.height);target.imageSmoothingEnabled=false;
      const f=frame(atlas,index);if(!f||!images[atlas])return;const [sx,sy,sw,sh]=f.rect,scale=Math.min(c.width/sw,c.height/sh)*.92;
      target.drawImage(images[atlas],sx,sy,sw,sh,(c.width-sw*scale)/2,(c.height-sh*scale)/2,sw*scale,sh*scale);
    });
  }
  return {draw,hitTest,paint,project,get camera(){return {...camera,zoom};},get night(){return night;}};
}
