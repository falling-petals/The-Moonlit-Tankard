import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {parseReply,requestStaffReply,remember,consumeBootstrap} from '../src/ai.js';

test('structured replies keep text and permitted suggestions, never economic commands',()=>{
  const r=parseReply('```json\n{"speech":"我会先照顾窗边。","memory":"窗边适合安静的客人","suggestion":"tasting","gold":99999}\n```');
  assert.equal(r.speech,'我会先照顾窗边。');assert.equal(r.memory,'窗边适合安静的客人');
  assert.equal(r.gold,undefined);assert.equal(r.suggestion,'tasting');
  assert.throws(()=>parseReply('{"money":900}'),/回复/);
});

test('memory deduplicates and keeps the latest twelve bounded items',()=>{
  const w={memories:[]};for(let i=0;i<15;i++)remember(w,`安排${i}`);
  remember(w,'安排14');assert.equal(w.memories.length,12);assert.equal(w.memories[0],'安排3');
  remember(w,'a'.repeat(500));assert.equal(w.memories.at(-1).length,160);
});

test('client handles a real HTTP response and sends the chosen employee context',async()=>{
  let payload;const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;payload=JSON.parse(body);
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({id:'completion-test',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"speech":"我记住了，先服务二号桌。","memory":"优先二号桌","suggestion":null}'}}],usage:{prompt_tokens:20,completion_tokens:15,total_tokens:35}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const r=await requestStaffReply({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'test-model',key:'test-only-key'},
      {name:'青芽',personality:'细心',memories:['喜欢花茶']},{day:1,gold:360},'先服务二号桌');
    assert.equal(r.memory,'优先二号桌');assert.equal(payload.model,'test-model');
    assert.ok(payload.messages[0].content.includes('喜欢花茶'));assert.equal(payload.stream,false);
  }finally{server.close();}
});

test('timeout is bounded and does not leave a request pending forever',async()=>{
  const server=http.createServer((req,res)=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await assert.rejects(requestStaffReply({baseUrl:`http://127.0.0.1:${server.address().port}`,model:'test',key:'test-only-key'}, {name:'青芽',memories:[]},{},'你好',{timeoutMs:25}),/超时/);}
  finally{server.closeAllConnections();server.close();}
});

test('one-time environment bootstrap is consumed and removed from the visible URL',()=>{
  const config={key:'test-only-key',baseUrl:'https://example.com/v1',model:'test'};
  const hash='#bootstrap='+encodeURIComponent(btoa(JSON.stringify(config)));
  let clean;const r=consumeBootstrap({hash,pathname:'/',search:''},{replaceState:(_a,_b,url)=>clean=url});
  assert.deepEqual(r,config);assert.equal(clean,'/');
});
