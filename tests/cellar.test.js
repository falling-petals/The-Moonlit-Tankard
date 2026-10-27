import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/engine.js';
import {CELLAR,cellarSlots,caskBonus} from '../src/content.js';
import {loadGame,publicSave,parseGame} from '../src/storage.js';

// 下一位客人推到一天之外，单测只跑我们摆好的这一桌。
const quiet=s=>{s.arrivalIn=900;return s;};
const unlocked=()=>{const s=quiet(createGame());s.milestones=['cellar'];s.stock.ale=20;return s;};
const serveOne=s=>{
  const t=s.tables[0];
  Object.assign(t,{status:'waiting',guest:{id:1,variant:0,party:1,x:t.x,y:t.y+25,path:[]},order:{drink:'ale',quantity:1,paid:false},worker:null,patience:115,patienceMax:115,request:null});
  act(s,{type:'open'});advance(s,30);
  return s.stats.revenue;
};

test('地窖要三颗星才开，锁着的时候什么都做不了',()=>{
  const s=quiet(createGame());
  assert.equal(act(s,{type:'cellar-store',drink:'ale'}).ok,false);
  assert.equal(act(s,{type:'cellar-tap',id:'k1'}).ok,false);
  assert.deepEqual(s.cellar.casks,[]);
});

test('入窖要把库存扣下来，桶位满了就得先取',()=>{
  const s=unlocked();
  assert.equal(act(s,{type:'cellar-store',drink:'ale'}).ok,true);
  assert.equal(s.stock.ale,20-CELLAR.perCask);
  assert.equal(s.cellar.casks[0].qty,CELLAR.perCask);
  assert.equal(s.cellar.casks[0].level,0);
  act(s,{type:'cellar-store',drink:'ale'});
  assert.equal(s.cellar.casks.length,2);
  assert.equal(cellarSlots(s),CELLAR.baseSlots);
  assert.equal(act(s,{type:'cellar-store',drink:'ale'}).ok,false);
});

test('扩容储藏柜多给两格桶位',()=>{
  const s=unlocked();
  s.upgrades.cellar=1;
  assert.equal(cellarSlots(s),CELLAR.baseSlots+CELLAR.extraSlots);
  for(let i=0;i<CELLAR.baseSlots+CELLAR.extraSlots;i++)assert.equal(act(s,{type:'cellar-store',drink:'ale'}).ok,true);
  assert.equal(s.cellar.casks.length,4);
  assert.equal(act(s,{type:'cellar-store',drink:'ale'}).ok,false);
});

test('一夜一级，三级到顶，进日报',()=>{
  const s=unlocked();
  act(s,{type:'cellar-store',drink:'ale'});
  for(let day=1;day<=3;day++){
    act(s,{type:'open'});advance(s,600);
    assert.equal(s.cellar.casks[0].level,day);
    assert.equal(s.summary.cellarAged,1);
    act(s,{type:'next-day'});
  }
  act(s,{type:'open'});advance(s,600);
  assert.equal(s.cellar.casks[0].level,CELLAR.maxLevel);
  assert.equal(s.summary.cellarAged,0);
});

test('取酒回到库存，并记成陈酿',()=>{
  const s=unlocked();
  act(s,{type:'cellar-store',drink:'ale'});
  s.cellar.casks[0].level=2;
  const before=s.stock.ale;
  assert.equal(act(s,{type:'cellar-tap',id:s.cellar.casks[0].id}).ok,true);
  assert.equal(s.cellar.casks.length,0);
  assert.equal(s.stock.ale,before+CELLAR.perCask);
  assert.deepEqual(s.cellar.vintage,[{drink:'ale',qty:CELLAR.perCask,level:2}]);
});

test('楼上放不下时不让取，桶就留在窖里',()=>{
  const s=unlocked();
  act(s,{type:'cellar-store',drink:'ale'});
  s.stock.ale=22;
  assert.equal(act(s,{type:'cellar-tap',id:s.cellar.casks[0].id}).ok,false);
  assert.equal(s.cellar.casks.length,1);
  assert.equal(s.stock.ale,22);
});

test('陈酿卖出更高的价，普通库存不受影响',()=>{
  const plain=unlocked();const plainRevenue=serveOne(plain);

  const aged=unlocked();
  aged.cellar.vintage=[{drink:'ale',qty:6,level:2}];
  const agedRevenue=serveOne(aged);

  assert.equal(plainRevenue,Math.round(22));
  assert.equal(agedRevenue,Math.round(22*caskBonus(2)));
  assert.ok(agedRevenue>plainRevenue);
  assert.deepEqual(aged.cellar.vintage,[{drink:'ale',qty:5,level:2}]);
});

test('陈酿不够一整桌时按普通价算，账目不会碎成小数',()=>{
  const s=unlocked();
  s.cellar.vintage=[{drink:'ale',qty:1,level:3}];
  const t=s.tables[0];
  Object.assign(t,{status:'waiting',guest:{id:1,variant:0,party:2,x:t.x,y:t.y+25,path:[]},order:{drink:'ale',quantity:2,paid:false},worker:null,patience:115,patienceMax:115,request:null});
  act(s,{type:'open'});advance(s,30);
  assert.equal(s.stats.revenue,Math.round(22*2));
  assert.deepEqual(s.cellar.vintage,[{drink:'ale',qty:1,level:3}]);
});

test('version two 存档补上地窖，照常开门',()=>{
  const old=quiet(createGame());
  old.version=2;delete old.cellar;
  const s=loadGame(JSON.stringify(old));
  assert.equal(s.version,3);
  assert.deepEqual(s.cellar,{casks:[],vintage:[],seq:0});
  assert.doesNotThrow(()=>{act(s,{type:'open'});advance(s,2);});
});

test('桶和陈酿能存进存档再读回来',()=>{
  const s=unlocked();
  act(s,{type:'cellar-store',drink:'ale'});
  act(s,{type:'cellar-store',drink:'ale'});
  s.cellar.casks[0].level=2;
  act(s,{type:'cellar-tap',id:s.cellar.casks[0].id});
  assert.equal(s.cellar.casks.length,1);
  assert.deepEqual(s.cellar.vintage,[{drink:'ale',qty:CELLAR.perCask,level:2}]);
  const back=loadGame(publicSave(s));
  assert.equal(back.cellar.casks.length,1);
  assert.equal(back.cellar.casks[0].level,0);
  assert.deepEqual(back.cellar.vintage,[{drink:'ale',qty:CELLAR.perCask,level:2}]);
});

test('坏掉的桶被丢掉，不会让整份存档读不进来',()=>{
  const s=unlocked();
  act(s,{type:'cellar-store',drink:'ale'});
  const raw=JSON.parse(publicSave(s));
  raw.cellar.casks.push({id:'bad',drink:'nope',qty:6,level:1},{id:'bad2',drink:'ale',qty:99,level:9,day:1},{id:'bad3',drink:'ale',qty:3,level:1.5});
  const clean=parseGame(JSON.stringify(raw));
  assert.equal(clean.cellar.casks.length,1);
  assert.equal(clean.cellar.casks[0].drink,'ale');
});
