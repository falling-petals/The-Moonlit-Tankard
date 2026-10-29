import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,createEmployee,act} from '../src/engine.js';
import {advanceCellar} from '../src/cellar-engine.js';
import {publicSave,parseGame} from '../src/storage.js';

const setup=(workers=['gemini'])=>{const s=createGame();s.gold=10000;s.milestones=['cellar'];for(const id of workers)act(s,{type:'hire',id});s.stock.ale=0;s.phase='open';return s;};
const tick=(s,n)=>{for(let t=0;t<n;t+=.25)advanceCellar(s,Math.min(.25,n-t));};
test('hiring enables immediate paid restocking at the same ingredient price as manual purchases',()=>{
 const s=setup(),gold=s.gold;const events=[];advanceCellar(s,.25,(_s,type,data)=>events.push({type,...data}));
 assert.equal(s.stock.ale,6);assert.equal(s.gold,gold-36);assert.equal(s.stats.purchases,36);assert.equal(s.cellar.automation.spent,36);
 assert.deepEqual(events.find(e=>e.type==='auto-restocked'),{type:'auto-restocked',staff:'gemini',drink:'ale',amount:6,cost:36});
 assert.equal(s.cellar.workers[0].role,'restocker');assert.equal(s.cellar.production.batch,null);assert.deepEqual(s.cellar.production.ready,[]);
 const manual=createGame();manual.stock.ale=0;const before=manual.gold;act(manual,{type:'restock',drink:'ale'});assert.equal(before-manual.gold,36);
});
test('auto purchases require hired workers and an unlocked, open, unpaused game',()=>{
 for(const mode of ['no-worker','locked','paused','ready','closed','disabled']){const s=setup(mode==='no-worker'?[]:undefined);if(mode==='locked')s.milestones=[];if(mode==='paused')s.paused=true;if(['ready','closed'].includes(mode))s.phase=mode;if(mode==='disabled')s.cellar.automation.enabled=false;const before=s.gold;tick(s,30);assert.equal(s.stock.ale,0,mode);assert.equal(s.gold,before,mode);}
});
test('two workers fill the same target in one sweep and never buy off-menu goods',()=>{
 const one=setup(),two=setup(['gemini','wenxin']);tick(one,.25);tick(two,.25);assert.equal(one.stock.ale,6);assert.equal(two.stock.ale,12);assert.equal(two.cellar.automation.spent,72);assert.equal(two.stock.coffee,0);assert.deepEqual(two.cellar.activity.map(a=>a.staff),['gemini','wenxin']);
 two.menu.ale=false;two.stock.ale=0;tick(two,20);assert.equal(two.stock.ale,0);
});
test('hysteresis reaches the target after partial budget and reload without duplicate purchases',()=>{
 let s=setup();act(s,{type:'cellar-budget',value:36});tick(s,16);assert.equal(s.stock.ale,6);assert.equal(s.cellar.automation.active.ale,true);
 const saved=publicSave(s);s=parseGame(saved);assert.equal(publicSave(s),saved);const gold=s.gold;tick(s,16);assert.equal(s.gold,gold);
 act(s,{type:'cellar-budget',value:72});tick(s,8);assert.equal(s.stock.ale,12);assert.equal(s.cellar.automation.spent,72);assert.equal(s.cellar.automation.active.ale,false);
});
test('budget and available gold limit quantities without free goods',()=>{
 for(const [budget,gold,want] of [[15,1000,2],[1000,17,2],[5,1000,0],[1000,5,0]]){const s=setup();s.gold=gold;s.cellar.automation.budget=budget;tick(s,30);assert.equal(s.stock.ale,want);assert.equal(s.gold,gold-want*6);assert.equal(s.stats.purchases,want*6);assert.equal(s.cellar.automation.spent,want*6);}
});
test('manual purchases interleave with automation without exceeding target or capacity',()=>{
 const s=setup();s.cellar.automation.budget=1000;tick(s,.25);act(s,{type:'restock',drink:'ale'});const gold=s.gold;tick(s,16);assert.equal(s.stock.ale,12);assert.equal(s.gold,gold);
 act(s,{type:'cellar-rule',drink:'ale',enabled:true,low:24,target:40});s.stock.ale=23;tick(s,8);assert.equal(s.stock.ale,24);s.upgrades.cellar=1;tick(s,8);assert.equal(s.stock.ale,24);s.stock.ale=23;tick(s,32);assert.equal(s.stock.ale,40);
});
test('mouse infestation slows paid restocking without losing any purchased goods',()=>{
 const clean=setup(['wenxin']),mice=setup(['wenxin']);for(const s of [clean,mice]){s.cellar.automation.budget=1000;act(s,{type:'cellar-rule',drink:'ale',enabled:true,low:24,target:24});}mice.cellar.pests.mice=[{id:'m1'},{id:'m2'}];tick(clean,8.5);tick(mice,8.5);assert.equal(clean.stock.ale,12);assert.equal(mice.stock.ale,6);tick(mice,3);assert.equal(mice.stock.ale,12);assert.equal(mice.cellar.automation.spent,72);
});
test('atomic policy validates every field before changing any setting',()=>{
 const s=setup(),before=JSON.stringify(s.cellar.automation);assert.equal(act(s,{type:'cellar-policy',enabled:false,budget:100,low:12,target:6}).ok,false);assert.equal(JSON.stringify(s.cellar.automation),before);
 assert.equal(act(s,{type:'cellar-policy',enabled:true,budget:90,low:4,target:10}).ok,true);assert.equal(s.cellar.automation.budget,90);assert.ok(Object.values(s.cellar.automation.rules).every(r=>r.enabled&&r.low===4&&r.target===10));
});
test('new day resets only the daily budget spent and retains hired helpers and stock',()=>{
 const s=setup();tick(s,.25);act(s,{type:'close'});act(s,{type:'next-day'});assert.equal(s.cellar.automation.spent,0);assert.equal(s.stock.ale,6);assert.equal(s.cellar.workers.length,1);tick(s,10);assert.equal(s.stock.ale,6);act(s,{type:'open'});tick(s,10);assert.equal(s.stock.ale,12);assert.equal(s.stats.purchases,36);
});
test('committed activity is bounded and reloading cannot buy again before its saved cooldown',()=>{
 let s=setup();s.cellar.automation.budget=1000;
 for(let i=0;i<10;i++){s.stock.ale=0;tick(s,8);}
 assert.equal(s.cellar.activity.length,8);assert.ok(s.cellar.activity.every(a=>a.qty===6&&a.drink==='ale'&&a.staff==='gemini'));
 s.stock.ale=0;s.cellar.activity[0].apiKey='ACTIVITY_SECRET';const raw=publicSave(s);assert.equal(raw.includes('ACTIVITY_SECRET'),false);s=parseGame(raw);
 const gold=s.gold;tick(s,.125);assert.equal(s.gold,gold);tick(s,8);assert.equal(s.gold,gold-36);assert.equal(s.stock.ale,6);
});
