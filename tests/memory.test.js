import test from 'node:test';
import assert from 'node:assert/strict';
import {addMemory,memoryBook,rememberDialogue,selectMemories,forgetMemory,pinMemory,sanitizePlan} from '../src/memory.js';
import {createGame,act,advance,createEmployee} from '../src/engine.js';
import {createInteractions} from '../src/interactions.js';
import {publicSave,parseGame} from '../src/storage.js';

test('legacy preferences migrate without duplicates and persist through save',()=>{
 const s=createGame(),w=s.staff[0];w.memories=['店主不爱太甜'];memoryBook(w);memoryBook(w);
 assert.equal(w.memoryBook.length,1);assert.equal(parseGame(publicSave(s)).staff[0].memoryBook[0].text,'店主不爱太甜');
});
test('a corrected owner name replaces the previous preference and survives retrieval',()=>{
 const w={memories:[]};rememberDialogue(w,'店主叫我记住：称呼他小何',1);rememberDialogue(w,'店主改称呼为阿何',2);
 assert.equal(w.memoryBook.filter(m=>m.subject==='owner-name').length,1);assert.match(selectMemories(w,'称呼',3)[0].text,/阿何/);
});
test('pinned preferences survive bounded event history and forgetting does not resurrect them',()=>{
 const w={memories:[]};const m=rememberDialogue(w,'记住店主喜欢少糖',1);pinMemory(w,m.id);
 for(let i=0;i<80;i++)addMemory(w,{text:'完成订单'+i,type:'event',source:'e'+i,day:i+1,importance:1});
 assert.equal(w.memoryBook.length,60);assert.ok(w.memoryBook.some(x=>x.id===m.id));forgetMemory(w,m.id);memoryBook(w);assert.ok(!w.memoryBook.some(x=>x.id===m.id));
});
test('a model plan is only a candidate; explicit validated action changes real scheduling',()=>{
 const s=createGame(),w=s.staff[0],gold=s.gold;w.pendingPlan=sanitizePlan({type:'policy',value:'clean-first',gold:9999});
 assert.equal(w.workPolicy,'balanced');assert.deepEqual(w.pendingPlan,{type:'policy',value:'clean-first'});
 assert.equal(act(s,{type:'apply-work-policy',staff:w.id,policy:w.pendingPlan.value}).ok,true);assert.equal(w.workPolicy,'clean-first');assert.equal(s.gold,gold);
 assert.equal(sanitizePlan({type:'eval',value:'gold=999'}),null);assert.equal(sanitizePlan({type:'restock',drink:'ale',low:20,target:4}),null);
});
test('cellar employee receives relevant memory, real cellar state and relationships in model context',async()=>{
 const s=createGame();s.cellar.workers.push(createEmployee('gemini'));const w=s.cellar.workers[0];w.relationships.qingya=4;rememberDialogue(w,'店主希望称呼他小何',2);
 let sent;const ai=createInteractions({getState:()=>s,getConfig:()=>({key:'mock-only',auto:false}),requestReply:async(config,staff,context)=>{sent={staff,context};return {speech:'小何，地窖我会照看的。',memory:'',plan:{type:'policy',value:'balanced'}};}});
 assert.equal(await ai.ask('gemini','记得我叫什么吗'),true);assert.match(sent.staff.personality,/哈气/);assert.match(sent.staff.memories[0].text,/小何/);assert.equal(sent.context.coworkers.find(x=>x.name==='DeepSeek').familiarity,4);assert.equal(sent.context.cellar.mice,0);assert.deepEqual(w.pendingPlan,{type:'policy',value:'balanced'});
});
test('paid restocking memories record without a model connection and stay with participants',()=>{
 const s=createGame();s.gold=10000;s.milestones=['cellar'];act(s,{type:'hire',id:'wenxin'});s.stock.ale=0;act(s,{type:'cellar-budget',value:24});const ai=createInteractions({getState:()=>s,getConfig:()=>({key:'',auto:false})});
 act(s,{type:'open'});advance(s,.25);ai.tick();ai.tick();assert.equal(s.stock.ale,4);assert.equal(s.cellar.automation.spent,24);
 assert.equal(s.cellar.workers[0].memoryBook.length,1);assert.match(s.cellar.workers[0].memoryBook[0].text,/4份/);assert.match(s.cellar.workers[0].memoryBook[0].text,/24金币/);assert.equal(s.staff[0].memoryBook.length,0);
});
test('private employee replies do not leak to a different employee through shared work logs',async()=>{
 const s=createGame();s.cellar.workers.push(createEmployee('gemini'),createEmployee('wenxin'));
 let second;const ai=createInteractions({getState:()=>s,getConfig:()=>({key:'mock-only',auto:false}),requestReply:async(config,staff,context)=>{if(staff.id==='gemini')return {speech:'这是我和店主私下的暗号：紫色鱼饼。',memory:''};second=context;return {speech:'收到。',memory:''};}});
 await ai.ask('gemini','记个私下的暗号');await ai.ask('wenxin','地窖进展如何？');
 assert.equal(JSON.stringify(second).includes('紫色鱼饼'),false);
 assert.equal(s.cellar.workers[1].memoryBook.length,0);
});
