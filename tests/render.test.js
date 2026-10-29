import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer} from '../src/render.js';
import {createGame} from '../src/engine.js';
test('renderer uses authored side/back motion frames, omits reserve preloads and falls back when a motion image fails',async()=>{
  const original={fetch:globalThis.fetch,Image:globalThis.Image,window:globalThis.window};
  const frames=Array.from({length:20},(_,i)=>({rect:[i*10,0,8,10],anchor:[4,10]}));
  const asset=src=>({src,frames,referenceHeight:10});
  const assets={'tavern-day':asset('day'),'tavern-night':asset('night'),'crew-deepseek-atlas':asset('legacy'),'crew-deepseek-motion-v2-atlas':asset('motion'),'crew-kimi-motion-v2-atlas':asset('reserve')};
  const loaded=[],draws=[];globalThis.fetch=async()=>({ok:true,json:async()=>({assets})});
  globalThis.Image=class{async decode(){loaded.push(this.src);if(this.src==='broken')throw new Error('missing motion');}};
  globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:true})};
  const ctx=new Proxy({measureText:text=>({width:text.length*10}),drawImage:(...args)=>draws.push(args)},{get:(o,k)=>k in o?o[k]:(()=>{})});
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800}),addEventListener(){}};
  try{
    const renderer=await createRenderer(canvas),s=createGame(),w=s.staff[0];w.x=300;w.y=600;
    for(const [point,index] of [[{x:300,y:400},4],[{x:100,y:600},8],[{x:500,y:600},12]]){
      w.path=[point];draws.length=0;renderer.draw(s,800);assert.equal(draws.find(d=>d[0].src==='motion')[1],index*10);
    }
    assert.ok(!loaded.includes('reserve'));assert.ok(!loaded.includes('legacy'));
    assets['crew-deepseek-motion-v2-atlas'].src='broken';await createRenderer(canvas);assert.ok(loaded.includes('legacy'));
  }finally{Object.assign(globalThis,original);}
});
test('cover camera keeps the player visible at every edge in narrow and ultrawide windows',async()=>{
  const original={fetch:globalThis.fetch,Image:globalThis.Image,window:globalThis.window};
  const ids=['tavern-day','tavern-night','player-atlas','staff-atlas','customers-atlas','furniture-atlas','items-atlas'];
  const manifest={assets:Object.fromEntries(ids.map(id=>[id,{src:id,frames:Array.from({length:16},()=>({rect:[0,0,100,100]}))}]))};
  globalThis.fetch=async()=>({ok:true,json:async()=>manifest});globalThis.Image=class{async decode(){}};globalThis.window={devicePixelRatio:2};
  try{
    for(const [width,height] of [[390,844],[4000,1000],[1280,800]]){
      const ctx=new Proxy({measureText:text=>({width:text.length*10})},{get:(o,k)=>k in o?o[k]:(()=>{})});
      const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width,height}),addEventListener(){}};
      const renderer=await createRenderer(canvas),s=createGame();
      for(const position of [{x:230,y:380},{x:1310,y:390},{x:768,y:900}]){
        Object.assign(s.player,position);renderer.draw(s,0);const p=renderer.project(s.player);
        assert.ok(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height,`player visible in ${width}x${height}: ${JSON.stringify(p)}`);
      }
      assert.equal(canvas.width,width*2);assert.equal(canvas.height,height*2);
    }
  }finally{Object.assign(globalThis,original);}
});

test('real revenue effects, event atlas and reduced motion remain safe across state changes',async()=>{
  const original={fetch:globalThis.fetch,Image:globalThis.Image,window:globalThis.window};
  const ids=['tavern-day','tavern-night','player-atlas','staff-atlas','customers-atlas','furniture-atlas','items-atlas','event-atlas'];
  const manifest={assets:Object.fromEntries(ids.map(id=>[id,{src:id,frames:Array.from({length:16},(_,i)=>({rect:[i*100,0,100,100]}))}]))};
  const labels=[],art=[];
  globalThis.fetch=async()=>({ok:true,json:async()=>manifest});globalThis.Image=class{async decode(){}};
  globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:true})};
  const ctx=new Proxy({measureText:text=>({width:text.length*10}),fillText:text=>labels.push(text),drawImage:(...args)=>art.push(args)},{get:(o,k)=>k in o?o[k]:(()=>{})});
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800}),addEventListener(){}};
  try {
    const renderer=await createRenderer(canvas),s=createGame();
    s.progression={party:{status:'active'},cameo:{status:'active',startsAt:120,endsAt:180,pot:0}};s.elapsed=140;
    renderer.draw(s,0);
    assert.ok(art.some(a=>a[0]?.src==='event-atlas'),'event sprite is drawn');
    assert.ok(labels.includes('黄仁勋 · 全场买单'));
    s.events.push({id:'revenue',type:'served',table:'t1',drink:'ale',amount:67});renderer.draw(s,100);
    assert.ok(labels.includes('+67 G'),'actual revenue appears');
    assert.ok(!labels.includes('+24'),'base price is not substituted');
    s.events.push({id:'deferred',type:'served',table:'t1',drink:'ale',amount:42,deferred:40});renderer.draw(s,150);
    assert.ok(labels.includes('记账 +40 G · 小费 +2'),'deferred payment is visibly separate from cash');
    s.events.push({id:'bill',type:'cameo-paid',amount:180});renderer.draw(s,200);
    assert.ok(labels.includes('全场买单 +180 G'));
    labels.length=0;renderer.draw({...s},300);
    assert.ok(!labels.some(t=>t.includes('+180')),'restored events do not replay');
  } finally {Object.assign(globalThis,original);}
});

test('an optional event atlas decoding failure preserves the existing room',async()=>{
  const original={fetch:globalThis.fetch,Image:globalThis.Image,window:globalThis.window};
  globalThis.fetch=async()=>({ok:true,json:async()=>({assets:{'event-atlas':{src:'missing'},'tavern-day':{src:'day'},'tavern-night':{src:'night'}}})});
  globalThis.Image=class{async decode(){if(this.src==='missing')throw new Error('missing');}};globalThis.window={devicePixelRatio:1};
  const ctx=new Proxy({},{get:()=>()=>{}}),canvas={getContext:()=>ctx,addEventListener(){}};
  try {await assert.doesNotReject(createRenderer(canvas));}finally{Object.assign(globalThis,original);}
});

test('locked furniture stays absent, waiting rings track patience, and ready drinks appear at the pass',async()=>{
  const original={fetch:globalThis.fetch,Image:globalThis.Image,window:globalThis.window};
  const ids=['tavern-day','tavern-night','player-atlas','staff-atlas','customers-atlas','furniture-atlas','items-atlas'];
  globalThis.fetch=async()=>({ok:true,json:async()=>({assets:Object.fromEntries(ids.map(id=>[id,{src:id,frames:Array.from({length:16},(_,i)=>({rect:[i*100,0,100,100]}))}]))})});
  globalThis.Image=class{async decode(){}};globalThis.window={devicePixelRatio:1};
  const art=[],arcs=[],labels=[];
  const ctx=new Proxy({measureText:t=>({width:t.length*10}),drawImage:(...a)=>art.push(a),arc:(...a)=>arcs.push(a),fillText:t=>labels.push(t)},{get:(o,k)=>k in o?o[k]:(()=>{})});
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1536,height:1024}),addEventListener(){}};
  try{
    const r=await createRenderer(canvas),s=createGame();s.tables.forEach((t,i)=>t.enabled=i===0);
    const t=s.tables[0];Object.assign(t,{status:'ready',patience:25,patienceMax:100,order:{drink:'ale',quantity:2},guest:{x:t.x-105,y:t.y+25,path:[],variant:0,party:1}});
    r.draw(s,0);
    assert.equal(art.filter(a=>a[0]?.src==='furniture-atlas').length,4,'only one table, two chairs, and floor decor');
    const ring=arcs.find(a=>a[2]===15&&a[3]===-Math.PI/2);assert.ok(ring);assert.equal(ring[4],0);
    assert.ok(art.some(a=>a[0]?.src==='items-atlas'&&a[6]<350),'ready drink tray at the bar');
    assert.ok(!labels.some(t=>String(t).includes('待接单')||String(t).includes('空闲')),'no persistent table status labels');
    const locked=s.tables[1],hit=r.hitTest(locked.x,locked.y);assert.equal(hit.type,'ground','locked expansion slots never steal movement clicks');
    assert.equal(r.hitTest(t.x,t.y).type,'ground','tabletop is not a target');
    assert.equal(r.hitTest(t.guest.x,t.guest.y-42).type,'guest');
    assert.equal(r.hitTest(t.guest.x+40,t.guest.y-104).type,'guest','only the visible order bubble is clickable');
    t.status='dirty';t.guest=null;r.draw(s,100);
    assert.equal(r.hitTest(t.x+95,t.y+82).type,'service','small cleaning icon retains manual service');
    assert.equal(r.hitTest(t.x+120,t.y+82).type,'ground');
  }finally{Object.assign(globalThis,original);}
});
