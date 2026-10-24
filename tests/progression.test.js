import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,act} from '../src/engine.js';
import {RECIPES,parseProgression,publicProgression,drinkInfo} from '../src/progression.js';
import {parseGame,publicSave} from '../src/storage.js';

const run=(s,n)=>advance(s,n);
function service(s,{patience=140}={}){
  const t=s.tables[0],w=s.staff[0];
  Object.assign(t,{status:'preparing',worker:w.id,patience,patienceMax:150,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});
  w.job={kind:'order',table:t.id,stage:'deliver',remaining:0};w.path=[];w.chatWith=null;
  run(s,.25);return s.events.filter(e=>e.type==='served').at(-1);
}
function quiet(s){act(s,{type:'open'});s.arrivalIn=999;s.staff[0].chatWith='player';}

test('recipe draws spend inspiration, refund duplicates and continue deterministic RNG after reload',()=>{
  const s=createGame();assert.equal(act(s,{type:'draw-recipe'}).ok,true);
  assert.equal(s.progression.inspiration,20);assert.equal(s.progression.draws,1);assert.equal(s.progression.collection.length,1);
  const clone=structuredClone(s),a=act(s,{type:'draw-recipe'}),b=act(clone,{type:'draw-recipe'});
  assert.deepEqual(a,b);assert.equal(s.rng,clone.rng);
});

test('fifth common draw guarantees rare or epic, and duplicates return only four inspiration',()=>{
  const s=createGame();s.progression.inspiration=100;s.progression.draws=4;s.progression.pity=4;
  s.progression.collection=Object.keys(RECIPES);
  const result=act(s,{type:'draw-recipe'});assert.equal(result.ok,true);assert.notEqual(result.rarity,'common');
  assert.equal(result.duplicate,true);assert.equal(s.progression.inspiration,94);assert.equal(s.progression.pity,0);
  s.progression.inspiration=9;const rng=s.rng;assert.equal(act(s,{type:'draw-recipe'}).ok,false);assert.equal(s.rng,rng);
});
test('migration and nested whitelist reject corrupt progression and never export extra keys',()=>{
  const legacy=parseProgression(undefined,{phase:'closed',elapsed:150});assert.equal(legacy.inspiration,30);assert.equal(legacy.cameo.paid,true);
  const s=createGame();s.progression.combo.apiKey='secret';s.progression.cameo.apiKey='secret';s.progression.apiKey='secret';
  assert.equal(JSON.stringify(publicProgression(s.progression)).includes('secret'),false);
  const valid=publicProgression(s.progression);assert.deepEqual(parseProgression(valid),valid);
  for(const mutate of [p=>p.combo.count=-1,p=>p.collection=['unknown'],p=>p.cameo.pot=1001,p=>p.inspiration=NaN,p=>p.party.rewarded=true]){
    const p=structuredClone(valid);mutate(p);assert.equal(parseProgression(p),null);
  }
});
test('strategy and equipped recipe change actual preparation and payment only before opening',()=>{
  const q=createGame(),p=createGame();assert.equal(act(p,{type:'set-strategy',id:'premium'}).ok,true);
  act(q,{type:'draw-recipe'});const recipe=q.progression.collection[0];assert.equal(act(q,{type:'equip-recipe',id:recipe}).ok,true);
  assert.equal(q.progression.equipped,recipe);assert.equal(Object.keys(q.stock).length,9);
  assert.ok(drinkInfo(q,'ale').brew<drinkInfo(p,'ale').brew);
  for(const s of [q,p]){quiet(s);service(s);}
  assert.ok(p.stats.revenue>q.stats.revenue);assert.equal(act(p,{type:'set-strategy',id:'quick'}).ok,false);
  assert.equal(act(q,{type:'equip-recipe',id:recipe}).ok,false);
  const waiting=createGame();quiet(waiting);Object.assign(waiting.tables[0],{status:'waiting',patience:100,order:{drink:'ale',quantity:1,paid:false}});
  waiting.staff[0].chatWith=null;run(waiting,.25);assert.ok(waiting.staff[0].job.remaining<12);
});
test('timely paid services build combo, improve actual income and reward each daily tier once',()=>{
  const s=createGame();quiet(s);const first=service(s),base=s.stats.revenue;
  service(s);service(s);assert.equal(s.progression.combo.count,3);assert.equal(s.progression.combo.tier,3);
  assert.ok(s.stats.revenue-base>base*2);assert.equal(s.progression.inspiration,41);
  for(let i=0;i<7;i++)service(s);
  assert.equal(s.progression.combo.tier,10);assert.deepEqual(s.progression.combo.rewarded,[3,6,10]);
  const reward=s.progression.inspiration;service(s);assert.equal(s.progression.inspiration,reward);
  s.staff[0].chatWith='player';s.tables[0].status='empty';s.tables[0].guest=null;s.tables[0].order=null;run(s,56);
  assert.equal(s.progression.combo.count,0);service(s);service(s);service(s);assert.equal(s.progression.inspiration,reward);
  assert.equal(first.type,'served');
});
test('a guest leaving impatiently breaks the current service combo',()=>{
  const s=createGame();quiet(s);service(s);service(s);const t=s.tables[1];
  Object.assign(t,{status:'waiting',patience:.1,order:{drink:'tea',quantity:1,paid:false},guest:{x:1000,y:500,path:[],variant:0,id:2,party:1}});
  s.staff[0].chatWith='player';run(s,.25);assert.equal(s.progression.combo.count,0);
});
test('party costs once, schedules early, boosts actual payout, rewards three orders only on completion',()=>{
  const s=createGame();assert.equal(act(s,{type:'start-party'}).ok,true);assert.equal(s.gold,300);assert.equal(s.stats.purchases,60);
  assert.equal(s.progression.party.startAt,300);assert.equal(act(s,{type:'event'}).ok,false);
  quiet(s);s.elapsed=299.75;run(s,.25);assert.equal(s.progression.party.status,'active');
  const partySale=service(s);assert.equal(partySale.revenue,30);service(s);service(s);assert.equal(s.progression.party.served,3);assert.equal(s.progression.party.rewarded,false);
  s.staff[0].chatWith='player';s.tables[0].status='empty';s.tables[0].guest=null;s.tables[0].order=null;
  const before=s.progression.inspiration;s.elapsed=419.75;run(s,.25);
  assert.equal(s.progression.party.status,'complete');assert.equal(s.progression.party.rewarded,true);assert.equal(s.progression.inspiration,before+12);
  run(s,1);assert.equal(s.progression.inspiration,before+12);
  const late=createGame();quiet(late);late.elapsed=481;const gold=late.gold;assert.equal(act(late,{type:'start-party'}).ok,false);assert.equal(late.gold,gold);
});
test('cameo holds real drink receipts and pays the full bill once at exit or early close',()=>{
  const s=createGame();quiet(s);s.elapsed=119.75;run(s,.25);assert.equal(s.progression.cameo.status,'active');
  const gold=s.gold;service(s);const bill=s.stats.revenue;
  assert.equal(s.progression.cameo.pot,bill);assert.equal(s.gold-gold,s.stats.tips);assert.equal(s.progression.cameo.orders,1);
  s.staff[0].chatWith='player';s.tables[0].status='empty';s.tables[0].guest=null;s.tables[0].order=null;s.elapsed=179.75;run(s,.25);
  assert.equal(s.gold,gold+bill+s.stats.tips);assert.equal(s.stats.revenue,bill);assert.equal(s.progression.cameo.paid,true);
  assert.equal(s.events.filter(e=>e.type==='cameo-paid').length,1);assert.equal(s.events.find(e=>e.type==='cameo-paid').amount,bill);
  const restored=structuredClone(s);run(restored,1);assert.equal(restored.gold,s.gold);
  const early=createGame();quiet(early);early.elapsed=119.75;run(early,.25);service(early);act(early,{type:'close'});
  assert.equal(early.progression.cameo.paid,true);assert.equal(early.gold,360+early.stats.revenue+early.stats.tips-early.stats.wages);
});
test('cameo never fabricates income without service; a capped pot still pays overflow immediately',()=>{
  const s=createGame();quiet(s);s.elapsed=119.75;run(s,.25);s.elapsed=179.75;run(s,.25);
  assert.equal(s.progression.cameo.pot,0);assert.equal(s.stats.revenue,0);assert.equal(s.gold,360);assert.equal(s.progression.inspiration,30);
  const full=createGame();quiet(full);full.elapsed=119.75;run(full,.25);full.progression.cameo.pot=995;
  const gold=full.gold;service(full);assert.equal(full.progression.cameo.pot,1000);
  assert.equal(full.gold-gold,full.stats.revenue-5+full.stats.tips);
});
test('next day preserves collection and draw pity but clears all daily progression',()=>{
  const s=createGame();act(s,{type:'draw-recipe'});act(s,{type:'set-strategy',id:'premium'});act(s,{type:'equip-recipe',id:s.progression.collection[0]});
  quiet(s);service(s);const persistent=structuredClone(s.progression);act(s,{type:'close'});act(s,{type:'next-day'});
  for(const key of ['inspiration','collection','draws','pity','equipped','strategy'])assert.deepEqual(s.progression[key],persistent[key]);
  assert.equal(s.progression.combo.count,0);assert.equal(s.progression.party.status,'idle');assert.equal(s.progression.cameo.status,'waiting');assert.equal(s.progression.goals.served,false);
});
test('active cameo receipts survive real save reload and settlement cannot repeat after another reload',()=>{
  let s=createGame();quiet(s);s.elapsed=119.75;run(s,.25);service(s);
  const bill=s.progression.cameo.pot,before=s.gold;s=parseGame(publicSave(s));s.staff[0].chatWith='player';
  s.elapsed=179.75;run(s,.25);assert.equal(s.gold,before+bill);assert.equal(s.stats.revenue,bill);
  s=parseGame(publicSave(s));const paid=s.gold;run(s,1);assert.equal(s.gold,paid);assert.equal(s.progression.cameo.paid,true);
});
test('active party and maximum combo arrive faster but their flow boost remains capped',()=>{
  const normal=createGame(),combo=createGame(),beyond=createGame(),party=createGame();
  for(const s of [normal,combo,beyond,party]){quiet(s);s.arrivalIn=0;}
  Object.assign(combo.progression.combo,{count:10,best:10,tier:10,expiresAt:55});
  Object.assign(beyond.progression.combo,{count:100,best:100,tier:10,expiresAt:55});
  Object.assign(party.progression.party,{status:'active',startAt:0,endsAt:120});
  for(const s of [normal,combo,beyond,party])run(s,.25);
  assert.ok(combo.arrivalIn<normal.arrivalIn);assert.equal(combo.arrivalIn,beyond.arrivalIn);
  assert.ok(party.arrivalIn<normal.arrivalIn);assert.ok(party.arrivalIn>=14);
});
test('late party starts immediately with at least 120 seconds left and early closing cannot earn completion',()=>{
  const s=createGame();quiet(s);s.elapsed=350;assert.equal(act(s,{type:'start-party'}).ok,true);
  assert.equal(s.progression.party.status,'active');assert.equal(s.progression.party.endsAt,470);
  service(s);service(s);service(s);const before=s.progression.inspiration;act(s,{type:'close'});
  assert.equal(s.progression.party.status,'complete');assert.equal(s.progression.party.rewarded,false);assert.equal(s.progression.inspiration,before);
});
