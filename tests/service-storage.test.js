import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,createEmployee,act,advance} from '../src/engine.js';
import {STAFF} from '../src/content.js';
import {parseGame,publicSave} from '../src/storage.js';

const occupied=(s,status='ready')=>{
  const t=s.tables[0];Object.assign(t,{status,patience:110,patienceMax:130,worker:null,
    request:{id:'warm',fulfilled:true},order:{drink:'ale',quantity:2,paid:false,ready:true},
    guest:{id:1,variant:0,party:2,x:315,y:495,path:[],companion:{x:525,y:495}}});return t;
};

test('old four-table three-product saves retain balances, employees and recipes during expansion migration',()=>{
  const s=createGame();s.gold=1739;s.day=5;s.staff[0].memories=['店主喜欢少糖'];
  s.progression.collection=['honeyAle'];s.progression.draws=1;s.progression.equipped='honeyAle';
  s.tables=s.tables.slice(0,4);for(const t of s.tables){delete t.enabled;delete t.request;delete t.patienceMax;}
  for(const k of Object.keys(s.stock))if(!['ale','citrus','tea'].includes(k)){delete s.stock[k];delete s.menu[k];}
  const r=parseGame(s);assert.equal(r.gold,1739);assert.equal(r.day,5);assert.equal(r.tables.length,6);
  assert.equal(r.tables.filter(t=>t.enabled).length,4);assert.equal(r.stock.coffee,0);assert.equal(r.menu.coffee,false);
  assert.deepEqual(r.staff[0].memories,s.staff[0].memories);assert.equal(r.progression.equipped,'honeyAle');
});

test('a saved ready dish and companion restore and player delivery charges stock and receipt only once',()=>{
  const s=createGame();act(s,{type:'open'});s.arrivalIn=999;occupied(s);s.stock.ale=10;
  s.staff[0].chatWith='player';const r=parseGame(publicSave(s));r.staff[0].chatWith='player';
  assert.deepEqual(r.tables[0].guest.companion,{x:525,y:495});assert.equal(r.tables[0].status,'ready');
  assert.equal(act(r,{type:'player-pickup',table:'t1'}).ok,true);advance(r,30);
  const carrying=parseGame(publicSave(r));carrying.staff[0].chatWith='player';assert.ok(carrying.player.carrying);
  act(carrying,{type:'player-deliver',table:'t1'});advance(carrying,30);
  assert.equal(carrying.stats.served,1);assert.equal(carrying.stock.ale,10);const gold=carrying.gold;
  act(carrying,{type:'player-deliver',table:'t1'});assert.equal(carrying.gold,gold);
});

test('legacy closed patrons are cleared without paying wages or receipts again',()=>{
  const s=createGame();act(s,{type:'open'});act(s,{type:'close'});const gold=s.gold,wages=s.stats.wages;
  occupied(s,'served');s.tables[0].order.paid=true;
  const r=parseGame(s);assert.equal(r.gold,gold);assert.equal(r.stats.wages,wages);
  assert.ok(r.tables.every(t=>t.status==='empty'&&!t.guest&&!t.order));act(r,{type:'close'});assert.equal(r.gold,gold);
});

test('a prepared player pickup can be suspended and reloaded without reverting to raw stock',()=>{
  const s=createGame();act(s,{type:'open'});s.arrivalIn=999;occupied(s);s.stock.ale=10;s.staff[0].chatWith='player';
  act(s,{type:'player-pickup',table:'t1'});act(s,{type:'move-player',x:768,y:800});
  const r=parseGame(publicSave(s));assert.equal(r.player.job.suspended,true);act(r,{type:'cancel-player'});
  assert.equal(r.tables[0].status,'ready');assert.equal(r.stock.ale,10);assert.equal(r.player.job,null);
});

test('unrecognized demands and inconsistent ready-dish saves reject rather than loading corrupted work',()=>{
  for(const mode of ['request','ready','stock']){
    const s=createGame();occupied(s);
    if(mode==='request')s.tables[0].request.id='invented';
    if(mode==='ready')s.tables[0].order.ready=false;
    if(mode==='stock')delete s.stock.coffee;
    assert.throws(()=>parseGame(s),/存档格式/);
  }
});

test('new nested request and companion data use whitelists and exclude credentials',()=>{
  const s=createGame(),t=occupied(s),secret='NEVER_EXPORT_NESTED_KEY';
  t.request.apiKey=secret;t.guest.companion.apiKey=secret;
  const raw=publicSave(s);assert.equal(raw.includes(secret),false);assert.doesNotThrow(()=>parseGame(raw));
});

test('four-person legacy roster retains IDs and memories; fire and rehire preserves them',()=>{
 const s=createGame();s.version=3;s.gold=100000;s.staff=STAFF.filter(d=>d.area==='floor').slice(0,4).map((d,i)=>createEmployee(d.id,i));s.staff[3].memories=['rainy evenings'];delete s.reserve;
 const r=parseGame(s);assert.equal(r.staff.length,4);assert.deepEqual(r.reserve,[]);act(r,{type:'fire-staff',id:'xianyue'});r.reserve[0].apiKey='RESERVE_SECRET';assert.equal(publicSave(r).includes('RESERVE_SECRET'),false);const before=r.gold;assert.equal(act(r,{type:'hire',id:'xianyue'}).ok,true);assert.equal(r.gold,before-4800);assert.deepEqual(r.staff.find(w=>w.id==='xianyue').memories,['rainy evenings']);assert.doesNotThrow(()=>parseGame(publicSave(r)));
});
