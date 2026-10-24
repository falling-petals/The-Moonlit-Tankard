import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer} from '../src/render.js';
import {createGame} from '../src/engine.js';
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
