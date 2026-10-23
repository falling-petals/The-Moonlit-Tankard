import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,createEmployee} from '../src/engine.js';
import {createInteractions} from '../src/interactions.js';

const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(requestReply=async()=>({speech:'今天这阵忙完，一起看看窗外吧。',memory:'',suggestion:null})){
  let state=createGame(),time=200000;state.phase='open';state.elapsed=150;
  state.staff.push(createEmployee('tuantuan',1));
  state.staff[0].x=500;state.staff[0].y=500;state.staff[1].x=550;state.staff[1].y=500;
  const waits=[],calls=[];
  const api=createInteractions({getState:()=>state,getConfig:()=>({key:'test-only',auto:true}),now:()=>time,
    delay:ms=>new Promise(resolve=>waits.push({ms,resolve})),requestReply:async(...args)=>{calls.push(args);return requestReply(...args);}});
  return {api,calls,waits,get state(){return state;},replace:()=>{state=createGame();},advance:ms=>{time+=ms;}};
}
test('distant or player-chatting employees do not chat',async()=>{
  const h=setup();h.state.staff[1].x=1000;h.api.tick();await flush();assert.equal(h.calls.length,0);
  h.state.staff[1].x=550;h.state.staff[0].chatWith='player';h.api.tick();await flush();assert.equal(h.calls.length,0);
});
test('nearby idle employees speak in sequence and remember their actual exchange',async()=>{
  const h=setup();h.api.tick();await flush();assert.equal(h.calls.length,1);
  assert.ok(h.state.staff[0].bubble);assert.equal(h.state.staff[1].bubble,'');
  assert.equal(h.waits.length,1);assert.ok(h.waits[0].ms>=2500&&h.waits[0].ms<=4000);
  h.advance(3200);h.waits[0].resolve();await flush();assert.equal(h.calls.length,2);
  assert.equal(h.state.staff[0].bubble,'');assert.ok(h.state.staff[1].bubble);
  assert.equal(h.state.staff[0].relationships.tuantuan,1);
});
test('failed conversations never increase relationships',async()=>{
  const h=setup(async()=>{throw Error('offline');});await h.api.colleague('qingya');
  assert.equal(h.state.staff[0].relationships.tuantuan,undefined);
});
test('abort and replacement reject stale replies and cannot clear newer requests',async()=>{
  const pending=[];const h=setup(()=>new Promise(resolve=>pending.push(resolve)));
  const old=h.api.ask('qingya','你好');h.api.abort();h.replace();
  const fresh=h.api.ask('qingya','新的一天');pending[0]({speech:'旧回复',memory:'旧记忆'});await old;
  assert.equal(h.api.status.busy,true);assert.equal(h.state.staff[0].bubble,'');
  pending[1]({speech:'新回复',memory:'新记忆'});await fresh;assert.equal(h.state.staff[0].bubble,'新回复');
});
test('guest responses require a nearby employee serving that table',async()=>{
  const h=setup();const t=h.state.tables[0];t.status='waiting';t.worker='qingya';
  h.state.staff[0].x=1200;h.state.events.push({id:'new',type:'guest-request',table:t.id,drink:'tea',text:'热茶'});
  h.state.staff[1].chatWith='player';h.api.tick();await flush();assert.equal(h.calls.length,0);
});
test('guest request waits for its assigned employee to reach the guest',async()=>{
  const h=setup();const t=h.state.tables[0];t.status='preparing';t.worker='qingya';
  h.state.staff[0].job={table:t.id,stage:'deliver'};h.state.staff[0].x=1200;
  h.state.staff[1].x=t.x;h.state.staff[1].y=t.y+100;
  h.state.events.push({id:'waiting',type:'guest-request',table:t.id,drink:'tea',text:'热茶'});
  h.api.tick();await flush();assert.equal(h.calls.length,0);
  h.state.staff[0].x=t.x;h.state.staff[0].y=t.y+100;
  h.api.tick();await flush();assert.equal(h.calls.length,1);assert.ok(h.state.staff[0].bubble);
});
test('player replies retain full text, memory and suggestions',async()=>{
  const speech='长一点的玩家答复。'.repeat(12);const h=setup(async()=>({speech,memory:'记住玩家偏好',suggestion:'recipe'}));
  assert.equal(await h.api.ask('qingya','我喜欢花茶'),true);
  assert.equal(h.state.staff[0].bubble,speech);assert.deepEqual(h.state.staff[0].memories,['记住玩家偏好']);
  assert.equal(h.state.staff[0].suggestion,'recipe');assert.equal(h.state.staff[0].conversation[0].role,'player');
});
test('abort between social turns prevents the second request',async()=>{
  const h=setup();const chatting=h.api.colleague('qingya');await flush();h.api.abort();
  h.waits[0].resolve();await chatting;assert.equal(h.calls.length,1);assert.equal(h.state.staff[0].socialUntil,0);
});
test('second turn quotes its own first utterance and clears first bubble',async()=>{
  const h=setup();const chatting=h.api.colleague('qingya');await flush();
  h.api.status.lastReply='无关的全局文本';h.waits[0].resolve();await chatting;
  assert.ok(h.calls[1][3].includes('今天这阵忙完'));assert.ok(!h.calls[1][3].includes('无关的全局文本'));
  assert.equal(h.state.staff[0].bubble,'');
});
