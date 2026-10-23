import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,act} from '../src/engine.js';
import {isWalkable} from '../src/navigation.js';
const run=(s,n)=>{for(let i=0;i<n*4;i++)advance(s,.25);};
function order(s){
  s.phase='open';s.arrivalIn=999;s.staff[0].chatWith='player';
  Object.assign(s.tables[0],{status:'waiting',order:{drink:'ale',quantity:1,paid:false},patience:150,
    guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});
  s.player.x=420;s.player.y=570;
}
test('mouse walk works before opening and avoids furniture',()=>{
  const s=createGame();assert.ok(act(s,{type:'move-player',x:790,y:185}).ok);
  for(let i=0;i<160;i++){advance(s,.25);assert.ok(isWalkable(s.player));}
  assert.ok(Math.hypot(s.player.x-790,s.player.y-185)<1);assert.equal(s.elapsed,0);
});
test('staff dialogue opens only after approaching and ground click releases it',()=>{
  const s=createGame();act(s,{type:'interact',target:{kind:'staff',id:'qingya'}});
  assert.equal(s.player.interaction,null);run(s,30);
  assert.equal(s.player.interaction.id,'qingya');assert.equal(s.staff[0].chatWith,'player');
  assert.ok(Math.hypot(s.player.x-s.staff[0].x,s.player.y-s.staff[0].y)>=50,'leave room between the two sprites');
  act(s,{type:'move-player',x:768,y:800});assert.equal(s.staff[0].chatWith,null);
});
test('player prepares, explicitly carries and delivers an order exactly once',()=>{
  const s=createGame();order(s);const balance=s.gold;
  assert.ok(act(s,{type:'player-work',table:'t1'}).ok);assert.equal(s.tables[0].worker,'player');
  assert.equal(act(s,{type:'player-work',table:'t1'}).ok,false);
  run(s,55);assert.equal(s.player.carrying.table,'t1');assert.equal(s.stats.served,0);assert.equal(s.stock.ale,11);
  assert.ok(act(s,{type:'player-deliver',table:'t1'}).ok);run(s,25);
  assert.equal(s.stats.served,1);assert.ok(s.gold>balance);assert.equal(s.player.carrying,null);
  const gold=s.gold;assert.equal(act(s,{type:'player-deliver',table:'t1'}).ok,false);assert.equal(s.gold,gold);
});
test('cancelled manual work releases the order and returns consumed supplies once',()=>{
  const s=createGame();order(s);act(s,{type:'player-work',table:'t1'});run(s,25);
  assert.equal(s.stock.ale,11);act(s,{type:'cancel-player'});
  assert.equal(s.tables[0].status,'waiting');assert.equal(s.tables[0].worker,null);assert.equal(s.stock.ale,12);
  act(s,{type:'cancel-player'});assert.equal(s.stock.ale,12);
});
test('player clearing locks a dirty table against employee assignment',()=>{
  const s=createGame();order(s);s.tables[0].status='dirty';s.tables[0].guest=null;s.staff[0].chatWith=null;
  act(s,{type:'player-clean',table:'t1'});run(s,5);
  assert.equal(s.tables[0].status,'empty');assert.equal(s.player.completed,1);assert.equal(s.staff[0].completed,0);
});
test('pause freezes player work and closing safely releases manual reservations',()=>{
  const s=createGame();order(s);act(s,{type:'player-work',table:'t1'});act(s,{type:'pause'});
  const x=s.player.x,y=s.player.y;run(s,4);assert.equal(s.player.x,x);assert.equal(s.player.y,y);
  act(s,{type:'close'});assert.equal(s.player.job,null);assert.equal(s.player.carrying,null);assert.equal(s.tables[0].worker,null);
});
test('redirecting a carried order never pays it at an unrelated destination',()=>{
  const s=createGame();order(s);act(s,{type:'player-work',table:'t1'});run(s,45);
  assert.ok(s.player.carrying);act(s,{type:'player-deliver',table:'t1'});
  act(s,{type:'move-player',x:768,y:800});run(s,20);
  assert.equal(s.stats.served,0);assert.ok(s.player.carrying);assert.equal(s.player.job.stage,'carry');
});
test('taking over employee preparation reuses the already deducted ingredients',()=>{
  const s=createGame();order(s);s.staff[0].chatWith=null;run(s,1);
  assert.equal(s.stock.ale,11);assert.ok(act(s,{type:'player-takeover',table:'t1'}).ok);
  run(s,45);assert.ok(s.player.carrying);assert.equal(s.stock.ale,11);assert.equal(s.stats.served,0);
});
