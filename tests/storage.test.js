import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, advance } from '../src/engine.js';
import { publicSave, loadGame } from '../src/storage.js';
import {isWalkable} from '../src/navigation.js';

test('a save restores active work without losing orders and excludes extra credentials',()=>{
  const s=createGame();act(s,{type:'open'});advance(s,20);
  s.apiKey='SECRET_SHOULD_NOT_EXPORT';s.config={key:'SECRET_SHOULD_NOT_EXPORT'};
  s.staff[0].memories.push('靠窗的座位留给安静的客人');
  const raw=publicSave(s);assert.equal(raw.includes('SECRET_SHOULD_NOT_EXPORT'),false);
  const restored=loadGame(raw);
  assert.equal(restored.elapsed,s.elapsed);assert.equal(restored.staff[0].memories[0],'靠窗的座位留给安静的客人');
  assert.deepEqual(restored.tables,s.tables);assert.equal(restored.phase,'open');
});

test('broken, old, negative and malformed saves recover to a valid fresh game',()=>{
  for(const raw of ['invalid',JSON.stringify({version:999}),JSON.stringify({version:1,gold:-100}),JSON.stringify({version:1,staff:'bad'})]){
    const s=loadGame(raw);assert.equal(s.phase,'ready');assert.ok(s.gold>=0);assert.equal(s.staff[0].id,'qingya');
  }
});

test('missing runtime fields and inconsistent occupied tables cannot crash startup',()=>{
  const missing=createGame();missing.gold=123;delete missing.reputation;
  const inconsistent=createGame();inconsistent.gold=123;inconsistent.tables[0].status='arriving';inconsistent.tables[0].guest=null;
  const badSpeed=createGame();badSpeed.gold=123;badSpeed.speed='fast';
  for(const bad of [missing,inconsistent,badSpeed]){
    const recovered=loadGame(JSON.stringify(bad));assert.equal(recovered.gold,360);assert.equal(recovered.reputation,4.2);
    assert.doesNotThrow(()=>{act(recovered,{type:'open'});advance(recovered,2);});
  }
});

// Player state and legacy navigation migrations are intentionally independent of UI state.
test('legacy version one adds a player and moves blocked staff to reachable floor',()=>{
  const s=createGame();s.gold=222;delete s.player;s.staff[0].x=790;s.staff[0].y=215;
  const restored=loadGame(JSON.stringify(s));assert.equal(restored.gold,222);assert.equal(restored.player.id,'player');assert.ok(isWalkable(restored.staff[0]));
});
test('player delivery and carrying roundtrip while temporary social locks clear',()=>{
  const s=createGame();s.player={id:'player',x:768,y:800,path:[{x:420,y:570}],direction:2,job:{kind:'order',table:'t1',stage:'deliver',remaining:0,consumed:true},carrying:{table:'t1',drink:'ale',quantity:1},target:{kind:'table',id:'t1'},interaction:null,completed:2};
  Object.assign(s.tables[0],{status:'preparing',worker:'player',order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});
  s.staff[0].chatWith='player';s.staff[0].socialUntil=99999;
  const raw=publicSave(s);assert.ok(!raw.includes('socialUntil'));assert.ok(!raw.includes('chatWith'));
  const r=loadGame(raw);assert.deepEqual(r.player,s.player);assert.equal(r.tables[0].worker,'player');assert.equal(r.staff[0].chatWith,null);assert.equal(r.staff[0].socialUntil,0);
});
test('contradictory player locks and carrying are rejected',()=>{
  for(const mode of ['lock','carrying']){const s=createGame();s.gold=222;s.player={id:'player',x:768,y:800,path:[],direction:0,job:null,carrying:null,target:null,interaction:null,completed:0};
  if(mode==='lock')s.tables[0].worker='player';else s.player.carrying={table:'t1',drink:'ale',quantity:1};assert.equal(loadGame(JSON.stringify(s)).gold,360);}
});
test('nested credential properties never enter public saves',()=>{
  const s=createGame();const secret='NESTED_CREDENTIAL';s.staff[0].apiKey=secret;s.staff[0].path=[{x:768,y:800,apiKey:secret}];s.tables[0].apiKey=secret;s.stock.apiKey=secret;s.events.push({id:'x',type:'x',credentials:secret});
  s.player={id:'player',x:768,y:800,path:[],direction:0,job:null,carrying:null,target:null,interaction:null,completed:0,apiKey:secret};assert.equal(publicSave(s).includes(secret),false);
});


test('legacy active bar job is rerouted around furniture without losing its table lock',()=>{
  const s=createGame();delete s.player;s.gold=222;const w=s.staff[0];Object.assign(w,{x:790,y:215,path:[{x:790,y:215}],job:{kind:'order',table:'t1',stage:'bar',remaining:12}});
  Object.assign(s.tables[0],{status:'preparing',worker:w.id,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});
  const r=loadGame(JSON.stringify(s));assert.equal(r.gold,222);assert.equal(r.tables[0].worker,w.id);assert.ok(isWalkable(r.staff[0]));assert.ok(r.staff[0].path.every(p=>isWalkable(p)));assert.deepEqual(r.staff[0].path.at(-1),{x:790,y:185});
});
