import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/engine.js';
import {starTier,STAR_STEPS} from '../src/content.js';
import {loadGame,publicSave,parseGame} from '../src/storage.js';

// 把下一位客人的到达推到一天之外：单日 600 秒，存档校验上限 1000。
const quietDay=s=>{s.arrivalIn=900;return s;};

test('口碑换算成星：4.2 是街坊底子，后三阶各挂一个里程碑',()=>{
  assert.equal(starTier(4.2),2);
  assert.equal(starTier(4.49),2);
  assert.equal(starTier(4.5),3);
  assert.equal(starTier(4.79),3);
  assert.equal(starTier(4.8),4);
  assert.equal(starTier(5),5);
  assert.deepEqual(STAR_STEPS.map(v=>v.id),['cellar','regulars','moonlit']);
});

test('一晚最多点亮一颗星，且不会越过里程碑直接跳满',()=>{
  const s=quietDay(createGame());
  s.reputation=5;act(s,{type:'open'});advance(s,600);
  assert.equal(s.phase,'closed');
  assert.equal(s.stars,3);
  assert.equal(s.summary.stars,3);
  assert.equal(s.summary.starGain,1);
  assert.deepEqual(s.milestones,['cellar']);
  assert.equal(s.pendingMilestone,'cellar');
});

test('差评到三桌，这颗星留到明天',()=>{
  const s=quietDay(createGame());
  s.reputation=5;act(s,{type:'open'});s.stats.missed=3;advance(s,600);
  assert.equal(s.stars,2);
  assert.equal(s.summary.starGain,0);
  assert.equal(s.summary.starNote,'blocked');
  assert.deepEqual(s.milestones,[]);
  assert.equal(s.pendingMilestone,null);
});

test('里程碑只解锁一次，第二晚继续往上走',()=>{
  const s=quietDay(createGame());
  s.reputation=5;act(s,{type:'open'});advance(s,600);
  act(s,{type:'next-day'});quietDay(s);act(s,{type:'open'});advance(s,600);
  assert.equal(s.stars,4);assert.deepEqual(s.milestones,['cellar','regulars']);assert.equal(s.pendingMilestone,'regulars');
  act(s,{type:'next-day'});s.pendingMilestone=null;quietDay(s);act(s,{type:'open'});advance(s,600);
  assert.equal(s.stars,5);assert.deepEqual(s.milestones,['cellar','regulars','moonlit']);
  assert.equal(s.summary.stars,5);
});

test('version one 存档迁移到最新版：按口碑补齐星级，照常开门',()=>{
  const old=createGame();
  old.version=1;old.reputation=4.62;
  delete old.stars;delete old.milestones;delete old.pendingMilestone;delete old.starNote;delete old.cellar;
  const s=loadGame(JSON.stringify(old));
  assert.equal(s.version,3);
  assert.equal(s.stars,3);
  assert.deepEqual(s.milestones,[]);
  assert.equal(s.pendingMilestone,null);
  assert.deepEqual(s.cellar.casks,[]);
  assert.doesNotThrow(()=>{act(s,{type:'open'});advance(s,2);});
});

test('坏掉的星级字段不会带毒进游戏',()=>{
  const s=createGame();s.stars=99;s.milestones=['cellar','nope','cellar'];s.pendingMilestone='nope';s.starNote='whatever';
  const clean=parseGame(JSON.stringify(s));
  assert.equal(clean.stars,5);
  assert.deepEqual(clean.milestones,['cellar']);
  assert.equal(clean.pendingMilestone,null);
  assert.equal(clean.starNote,'');
});

test('星级与里程碑能存进存档再读回来',()=>{
  const s=quietDay(createGame());
  s.reputation=5;act(s,{type:'open'});advance(s,600);
  const restored=loadGame(publicSave(s));
  assert.equal(restored.stars,3);
  assert.deepEqual(restored.milestones,['cellar']);
  assert.equal(restored.pendingMilestone,'cellar');
  assert.equal(restored.summary.starGain,1);
});
