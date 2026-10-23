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
