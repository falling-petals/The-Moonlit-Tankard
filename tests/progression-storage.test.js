import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/engine.js';
import {parseGame,publicSave} from '../src/storage.js';

test('pre-progression v1 save keeps its money and receives starter inspiration',()=>{
  const s=createGame();s.gold=227;delete s.progression;
  const restored=parseGame(JSON.stringify(s));assert.equal(restored.gold,227);assert.equal(restored.progression.inspiration,30);
});
test('draw, pity and selected recipe survive serialization without rerolling',()=>{
  const s=createGame();assert.equal(act(s,{type:'draw-recipe'}).ok,true);
  const id=s.progression.lastDraw.id;act(s,{type:'equip-recipe',id});
  const restored=parseGame(publicSave(s));assert.deepEqual(restored.progression,s.progression);assert.equal(restored.rng,s.rng);
});
test('nested progression extras never enter exported game state',()=>{
  const s=createGame();assert.ok(s.progression);s.progression.apiKey='PROGRESSION_SECRET';s.progression.combo.token='PROGRESSION_SECRET';
  assert.ok(!publicSave(s).includes('PROGRESSION_SECRET'));
});
test('invalid progression cannot silently replace a valid imported save',()=>{
  const s=createGame();assert.ok(s.progression);s.progression.combo.count=-8;
  assert.throws(()=>parseGame(JSON.stringify(s)));
});
test('suspended manual preparation and owned ingredients survive reload',()=>{
  const s=createGame();s.phase='open';s.arrivalIn=999;
  Object.assign(s.tables[0],{status:'preparing',worker:'player',patience:140,order:{drink:'ale',quantity:1,paid:false},guest:{id:1,variant:0,party:1,x:315,y:495,path:[]}});
  s.player.job={kind:'order',table:'t1',stage:'prepare',remaining:7,consumed:true,suspended:true};
  s.stock.ale=11;const restored=parseGame(publicSave(s));assert.equal(restored.player.job.suspended,true);
  advance(restored,1);assert.equal(restored.player.job.remaining,7);assert.equal(restored.stock.ale,11);
});
