import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/engine.js';
import {DRINKS,TABLE_COSTS,MAX_STAFF} from '../src/content.js';
import {RECIPES,RARITIES,drinkInfo} from '../src/progression.js';
const waiting=s=>Object.assign(s.tables[0],{status:'waiting',patience:300,patienceMax:300,order:{drink:'ale',quantity:1,paid:false},request:null});
const quiet=s=>{act(s,{type:'open'});s.arrivalIn=999;};
test('two initial tables expand in escalating order, without overspending and persist next day',()=>{
 const s=createGame();assert.equal(s.tables.filter(t=>t.enabled).length,2);assert.deepEqual(TABLE_COSTS,[0,0,240,720,2160,6480]);
 assert.equal(act(s,{type:'expand-table'}).ok,true);assert.equal(s.gold,120);assert.equal(act(s,{type:'expand-table'}).ok,false);
 quiet(s);assert.equal(act(s,{type:'expand-table'}).ok,false);act(s,{type:'close'});act(s,{type:'next-day'});assert.equal(s.tables.filter(t=>t.enabled).length,3);
});
test('chef prepares with one stock debit, floor delivers and cannot cook',()=>{
 const s=createGame();s.gold=2000;act(s,{type:'hire',id:'tuantuan'});s.staff[0].chatWith='player';const t=waiting(s);quiet(s);advance(s,30);
 assert.equal(t.status,'ready');assert.equal(t.order.ready,true);assert.equal(s.stats.served,0);assert.equal(s.stock.ale,11);
 act(s,{type:'role',staff:'qingya',role:'floor'});s.staff[0].chatWith=null;advance(s,40);assert.equal(s.stats.served,1);assert.equal(s.stock.ale,11);
 const floor=createGame();act(floor,{type:'role',staff:'qingya',role:'floor'});waiting(floor);quiet(floor);advance(floor,20);assert.equal(floor.stock.ale,12);assert.equal(floor.stats.served,0);
});
test('player picks up ready meal at pass and physically delivers, cancellation returns ready without refund',()=>{
 const s=createGame(),t=waiting(s);s.staff[0].chatWith='player';quiet(s);t.status='ready';t.order.ready=true;s.stock.ale=11;
 assert.equal(act(s,{type:'player-pickup',table:t.id}).ok,true);assert.equal(act(s,{type:'player-pickup',table:t.id}).ok,false);act(s,{type:'cancel-player'});assert.equal(t.status,'ready');assert.equal(s.stock.ale,11);
 act(s,{type:'player-pickup',table:t.id});advance(s,30);assert.ok(s.player.carrying);assert.equal(s.stats.served,0);act(s,{type:'player-deliver',table:t.id});advance(s,30);assert.equal(s.stats.served,1);assert.equal(s.stock.ale,11);
});
test('staff cap and irreversible hiring cost make choosing three of four real',()=>{
 const s=createGame();s.gold=5000;act(s,{type:'hire',id:'tuantuan'});act(s,{type:'hire',id:'xinghe'});assert.equal(s.staff.length,MAX_STAFF);const gold=s.gold;
 assert.equal(act(s,{type:'hire',id:'xianyue'}).ok,false);assert.equal(s.gold,gold);assert.equal(act(s,{type:'fire-staff',id:'xinghe'}).ok,true);assert.equal(s.gold,gold);assert.equal(act(s,{type:'hire',id:'xianyue'}).ok,true);
});
test('accepted requests alter preparation and actual payout; ignored request fails and breaks combo',()=>{
 const s=createGame(),t=waiting(s);act(s,{type:'hire',id:'tuantuan'});s.staff[0].chatWith='player';act(s,{type:'role',staff:'tuantuan',role:'all'});t.request={id:'warm',fulfilled:false};quiet(s);advance(s,10);
 assert.equal(s.staff[1].job,null);assert.equal(s.stock.ale,12,'chef waits for the request before consuming stock');
 assert.equal(act(s,{type:'player-work',table:t.id}).ok,false);
 assert.equal(act(s,{type:'fulfill-request',table:t.id}).ok,true);assert.equal(t.patienceMax,320);assert.equal(act(s,{type:'fulfill-request',table:t.id}).ok,false);advance(s,60);assert.equal(s.stats.served,1);assert.ok(s.stats.tips>=6);
 const ignored=createGame(),u=waiting(ignored);act(ignored,{type:'hire',id:'tuantuan'});ignored.staff[0].chatWith='player';act(ignored,{type:'role',staff:'tuantuan',role:'all'});u.request={id:'lowSugar',fulfilled:false};u.patience=30;quiet(ignored);Object.assign(ignored.progression.combo,{count:3,best:3,tier:3,expiresAt:55});advance(ignored,31);assert.equal(ignored.stats.served,0);assert.equal(ignored.stats.missed,1);assert.equal(ignored.progression.combo.count,0);
});
test('ready timeout clears locks, closing clears guests/orders and settles once',()=>{
 const s=createGame(),t=waiting(s);s.staff[0].chatWith='player';quiet(s);t.status='ready';t.order.ready=true;t.patience=.1;t.guest={x:315,y:495,path:[]};advance(s,.25);assert.equal(s.stats.missed,1);assert.equal(t.worker,null);act(s,{type:'close'});assert.ok(s.tables.every(t=>!t.guest&&!t.order&&!t.worker&&t.status==='empty'));const gold=s.gold;act(s,{type:'close'});assert.equal(s.gold,gold);
});
test('nine products, twelve recipes, four priced rarity tiers and legendary are reachable',()=>{
 const s=createGame();assert.equal(Object.keys(DRINKS).length,9);assert.equal(Object.keys(RECIPES).length,12);assert.equal(Object.keys(RARITIES).length,4);assert.equal(Object.values(s.menu).filter(Boolean).length,3);
 s.progression.collection=['eclipse'];s.progression.equipped='eclipse';assert.ok(drinkInfo(s,'moonwine').price>DRINKS.moonwine.price);s.progression.inspiration=100000;let legendary=false;for(let i=0;i<2000;i++)if(act(s,{type:'draw-recipe'}).rarity==='legendary')legendary=true;assert.ok(legendary);
});
test('careful starter automatically fulfills real requests while idle chat yields to service',()=>{
 const s=createGame(),t=waiting(s);t.request={id:'lowSugar',fulfilled:false};s.staff[0].socialUntil=Date.now()+60000;quiet(s);advance(s,.25);assert.equal(t.request.fulfilled,true);assert.equal(s.staff[0].job.kind,'order');advance(s,60);assert.equal(s.stats.served,1);assert.ok(s.stats.tips>=5);
});

test('expansion attracts more traffic with the same random state, and new recipe enables its actual product',()=>{
 const small=createGame(),large=createGame();for(const t of large.tables)t.enabled=true;
 for(const s of [small,large]){act(s,{type:'open'});advance(s,3);}
 assert.ok(large.arrivalIn<small.arrivalIn,'extra tables increase service pressure');
 const s=createGame();s.progression.collection=['eclipse'];s.progression.draws=1;
 assert.equal(s.menu.moonwine,false);assert.equal(act(s,{type:'equip-recipe',id:'eclipse'}).ok,true);
 assert.equal(s.menu.moonwine,true);assert.equal(s.stock.moonwine,0,'equipping never grants free ingredients');
});
