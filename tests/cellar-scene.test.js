import test from 'node:test';
import assert from 'node:assert/strict';
import {CELLAR_MAP,CELLAR_NAV,cellarPath,moveCellarActor,approachCellarPerson} from '../src/cellar-scene.js';
import {isWalkable} from '../src/navigation.js';
import {createGame,act,advance} from '../src/engine.js';
import {publicSave,parseGame} from '../src/storage.js';

test('cellar route reaches both work lanes around the central island without clipping furniture',()=>{
  for(const point of [CELLAR_MAP.producer,CELLAR_MAP.pickup,CELLAR_MAP.storage,{x:216,y:414},{x:228,y:228}]){
    const path=cellarPath(CELLAR_MAP.stairs,point);assert.ok(path.length,'route to '+JSON.stringify(point));
    assert.ok(path.every(p=>isWalkable(p,CELLAR_NAV)));const actor={...CELLAR_MAP.stairs,path,direction:'down'};
    for(let i=0;i<300&&actor.path.length;i++){moveCellarActor(actor,.1);assert.ok(isWalkable(actor,CELLAR_NAV));}
    assert.ok(Math.hypot(actor.x-point.x,actor.y-point.y)<2);
  }
});
test('locked floor cellar entry is gated; approaching unlocked entry survives save and reaches it',()=>{
  const s=createGame();assert.equal(act(s,{type:'interact',target:{kind:'station',id:'cellar'}}).ok,false);
  s.milestones=['cellar'];assert.equal(act(s,{type:'interact',target:{kind:'station',id:'cellar'}}).ok,true);
  const restored=parseGame(publicSave(s));assert.equal(restored.player.target.id,'cellar');
  for(let i=0;i<400&&!restored.player.interaction;i++)advance(restored,.1);
  assert.deepEqual(restored.player.interaction,{kind:'station',id:'cellar'});
});
test('two cellar partners each buy directly into shared stock',()=>{
  const s=createGame();s.milestones=['cellar'];s.gold=10000;act(s,{type:'hire',id:'gemini'});act(s,{type:'hire',id:'wenxin'});
  s.stock.ale=0;s.arrivalIn=999;act(s,{type:'open'});advance(s,.25);
  assert.deepEqual(s.events.filter(e=>e.type==='auto-restocked').map(e=>e.staff),['gemini','wenxin']);assert.equal(s.stock.ale,12);assert.equal(s.cellar.automation.spent,72);
});

test('conversation catches up after the employee has moved away from the clicked location',()=>{
  const manager={x:454,y:233,path:[]},gemini={...CELLAR_MAP.stairs};
  assert.equal(approachCellarPerson(manager,gemini),false);assert.ok(manager.path.length);
  for(let i=0;i<200&&manager.path.length;i++)moveCellarActor(manager,.1,100);
  assert.equal(approachCellarPerson(manager,gemini),true);
});
