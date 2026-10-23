import {WORLD,DRINKS,staffDefinition} from './content.js';

export async function createRenderer(canvas){
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const manifest=await fetch('assets/manifest.json').then(r=>{if(!r.ok)throw new Error('图集清单读取失败');return r.json();});
  const images={};
  await Promise.all(Object.entries(manifest.assets).filter(([id])=>id!=='zone-studies').map(async([id,a])=>{
    const img=new Image();img.src=a.src;await img.decode();images[id]=img;
  }));
  let latest=null,hover=null,night=0,zoom=1;
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
  const effects=[],seen=new Set();
  function frame(atlas,index){return manifest.assets[atlas].frames[index];}
  function art(target,atlas,index,x,y,height,width=null){
    const f=frame(atlas,index);if(!f||!images[atlas])return;
    const [sx,sy,sw,sh]=f.rect,h=height,w=width??sw/sh*h;
    target.drawImage(images[atlas],sx,sy,sw,sh,Math.round(x-w/2),Math.round(y-h),Math.round(w),Math.round(h));
  }
  function icon(target,index,x,y,size){const f=frame('items-atlas',index),[sx,sy,sw,sh]=f.rect;
    const scale=Math.min(size/sw,size/sh);target.drawImage(images['items-atlas'],sx,sy,sw,sh,x-sw*scale/2,y-sh*scale/2,sw*scale,sh*scale);}
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
  function draw(s,time,lighting='auto'){
    latest=s;resize(s.player);const n=lighting==='night'?1:lighting==='day'?0:Math.max(0,Math.min(1,(s.elapsed-250)/80));night=n;
    ctx.clearRect(0,0,WORLD.width,WORLD.height);ctx.globalAlpha=1;ctx.drawImage(images['tavern-day'],0,0,WORLD.width,WORLD.height);
    if(n>0){ctx.globalAlpha=n;ctx.drawImage(images['tavern-night'],0,0,WORLD.width,WORLD.height);ctx.globalAlpha=1;}
    const objects=[];
    // Quiet decor belongs below the feet-sorted objects.
    art(ctx,'furniture-atlas',14,768,805,130,155);
    if(s.upgrades.plants){objects.push({y:620,draw:()=>art(ctx,'furniture-atlas',4,190,620,115)});objects.push({y:620,draw:()=>art(ctx,'furniture-atlas',4,1345,620,115)});}
    for(const t of s.tables){
      for(const offset of [-105,105])objects.push({y:t.y-30,draw:()=>art(ctx,'furniture-atlas',2,t.x+offset,t.y+50,81)});
      objects.push({y:t.y+52,draw:()=>tableDraw(t,hover?.type==='table'&&hover.id===t.id)});
      if(t.guest){
        const moving=t.guest.path.length>0,row=moving?1+Math.floor(time/180)%2:0;
        const reverse=moving&&t.guest.path[0].y<t.guest.y-10;
        objects.push({y:t.guest.y,draw:()=>art(ctx,'customers-atlas',(reverse?3:row)*4+t.guest.variant,t.guest.x,t.guest.y,86)});
        if(t.guest.party===2){
          const seated=['waiting','preparing','served'].includes(t.status),x=seated?t.x+105:t.guest.x+28,y=seated?t.y+25:t.guest.y+20;
          objects.push({y,draw:()=>art(ctx,'customers-atlas',row*4+(t.guest.variant+1)%4,x,y,85)});
        }
      }
    }
    for(const w of s.staff){
      const def=staffDefinition(w.id),moving=w.path.length>0,row=moving?(w.path[0].y<w.y-10?3:1+Math.floor(time/150)%2):0;
      objects.push({y:w.y,draw:()=>{
        ctx.fillStyle='#15252355';ctx.beginPath();ctx.ellipse(w.x,w.y-3,21,8,0,0,Math.PI*2);ctx.fill();
        art(ctx,'staff-atlas',row*4+def.column,w.x,w.y+(moving?Math.sin(time/80)*2:0),77);
        if(w.job?.stage==='deliver')icon(ctx,10,w.x+29,w.y-33,34);
      }});
    }
    if(s.player){
      const p=s.player,moving=!!p.path?.length,row=p.carrying?3:moving?1+Math.floor(time/160)%2:0,direction=Math.max(0,Math.min(3,Math.floor(p.direction||0)));
      objects.push({y:p.y,draw:()=>{
        ctx.beginPath();ctx.ellipse(p.x,p.y-2,22,8,0,0,Math.PI*2);ctx.fillStyle='#b8913d35';ctx.fill();ctx.strokeStyle='#e4c575';ctx.lineWidth=2;ctx.stroke();
        art(ctx,'player-atlas',row*4+direction,p.x,p.y,88);
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
    if(s.player?.job?.stage==='prepare'){
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
    for(const e of s.events){if(seen.has(e.id))continue;seen.add(e.id);if(e.type==='served'){const t=s.tables.find(t=>t.id===e.table);effects.push({x:t.x,y:t.y-50,text:`+${DRINKS[e.drink].price}`,born:time});}}
    for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=(time-e.born)/1000;if(age>2.5){effects.splice(i,1);continue;}ctx.globalAlpha=Math.min(1,2.5-age);ctx.fillStyle='#ecdb98';ctx.strokeStyle='#26372b';ctx.lineWidth=4;ctx.font='bold 28px Georgia';ctx.textAlign='center';ctx.strokeText(e.text,e.x,e.y-age*25);ctx.fillText(e.text,e.x,e.y-age*25);ctx.textAlign='left';ctx.globalAlpha=1;}
    if(n>.1){
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
      const f=frame(atlas,index);if(!f)return;const [sx,sy,sw,sh]=f.rect,scale=Math.min(c.width/sw,c.height/sh)*.92;
      target.drawImage(images[atlas],sx,sy,sw,sh,(c.width-sw*scale)/2,(c.height-sh*scale)/2,sw*scale,sh*scale);
    });
  }
  return {draw,hitTest,paint,project,get camera(){return {...camera,zoom};},get night(){return night;}};
}
