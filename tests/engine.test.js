import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, act } from '../src/engine.js';

const run = (s, seconds) => { for (let i=0;i<seconds;i++) advance(s,1); };

test('opening, service, payment and cleaning complete without model replies', () => {
  const s=createGame(); const starting=s.gold;
  act(s,{type:'open'}); run(s,200);
  assert.ok(s.stats.served>0,'automatic employee serves customers');
  assert.ok(s.gold>starting,'served orders pay');
  assert.ok(s.stats.revenue>0);
  assert.ok(Object.values(s.stock).some(n=>n<12),'stock consumed');
  assert.ok(s.guestSeq>2,'tables have been cleared and reused by later guests');
  assert.ok(s.events.some(e=>e.type==='guest-request'));
});

test('pause freezes business, speed multiplies elapsed game time',()=>{
  const s=createGame();act(s,{type:'open'});act(s,{type:'pause'});advance(s,10);
  assert.equal(s.elapsed,0);
  act(s,{type:'pause'});act(s,{type:'speed',value:3});advance(s,2);
  assert.equal(s.elapsed,6);
});

test('a whole day settles wages exactly once and the next day resets counters',()=>{
  const s=createGame();act(s,{type:'open'});run(s,610);
  assert.equal(s.phase,'closed');assert.ok(s.summary.served>0);
  const balance=s.gold;run(s,10);act(s,{type:'close'});assert.equal(s.gold,balance);
  act(s,{type:'next-day'});assert.equal(s.day,2);assert.equal(s.phase,'ready');
  assert.equal(s.stats.served,0);assert.equal(s.summary,null);
});

test('empty stock cannot become negative or generate revenue',()=>{
  const s=createGame();for(const key in s.stock)s.stock[key]=0;
  act(s,{type:'open'});run(s,160);
  assert.equal(s.stats.revenue,0);assert.equal(s.stats.served,0);
  assert.ok(Object.values(s.stock).every(v=>v===0));
});

test('purchases and hires reject insufficient funds and duplicate hires',()=>{
  const s=createGame();s.gold=0;const before=s.stock.ale;
  assert.equal(act(s,{type:'restock',drink:'ale'}).ok,false);
  assert.equal(s.stock.ale,before);
  assert.equal(act(s,{type:'hire',id:'tuantuan'}).ok,false);
  s.gold=1000;assert.equal(act(s,{type:'hire',id:'tuantuan'}).ok,true);
  const after=s.gold;assert.equal(act(s,{type:'hire',id:'tuantuan'}).ok,false);
  assert.equal(s.gold,after);assert.equal(s.staff.length,2);
});

test('an upgrade is paid once and increases operational capability',()=>{
  const s=createGame();s.gold=1000;
  assert.equal(act(s,{type:'upgrade',id:'bar'}).ok,true);
  assert.equal(s.upgrades.bar,1);assert.equal(s.gold,880);
  assert.equal(act(s,{type:'upgrade',id:'bar'}).ok,false);
  assert.equal(s.gold,880);
});

test('temporary assignment selects the requested waiting table',()=>{
  const s=createGame();act(s,{type:'open'});run(s,12);
  const target=s.tables.find(t=>t.status!=='empty');assert.ok(target);
  assert.equal(act(s,{type:'assign',staff:'qingya',table:target.id}).ok,true);
  assert.equal(s.staff[0].priority,target.id);
});

test('large and small time steps produce the same business state',()=>{
  const a=createGame(),b=createGame();act(a,{type:'open'});act(b,{type:'open'});
  advance(a,120);run(b,120);
  assert.equal(a.stats.served,b.stats.served);assert.equal(a.gold,b.gold);
  assert.deepEqual(a.stock,b.stock);
});

test('closed-day procurement cannot silently disappear from the settled ledger',()=>{
  const s=createGame();act(s,{type:'open'});act(s,{type:'close'});const balance=s.gold,stock=s.stock.ale;
  const result=act(s,{type:'restock',drink:'ale'});
  assert.equal(result.ok,false);assert.equal(s.gold,balance);assert.equal(s.stock.ale,stock);
});

test('temporary assignment prioritizes the selected dirty table over another dirty table',()=>{
  const s=createGame();s.tables[0].status='dirty';s.tables[1].status='dirty';
  act(s,{type:'assign',staff:'qingya',table:'t2'});act(s,{type:'open'});advance(s,.25);
  assert.equal(s.staff[0].job.table,'t2');
});

test('bar specialization changes actual preparation time',()=>{
  const all=createGame(),bar=createGame();
  for(const s of [all,bar]){s.tables[0].status='waiting';s.tables[0].order={drink:'ale',quantity:1,paid:false};s.tables[0].patience=150;}
  act(bar,{type:'role',staff:'qingya',role:'bar'});
  for(const s of [all,bar]){act(s,{type:'open'});advance(s,.25);}
  assert.ok(bar.staff[0].job.remaining<all.staff[0].job.remaining);
});
