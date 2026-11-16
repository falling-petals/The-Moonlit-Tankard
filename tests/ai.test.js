import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {parseReply,requestStaffReply,remember,consumeBootstrap,loadClientConfig,fetchServerStatus} from '../src/ai.js';
import {settingsView} from '../src/views.js';

const staff={id:'qingya',name:'青芽',personality:'细心',memories:['喜欢花茶']};
const config={configured:true};
const reply={speech:'我记住了，先服务二号桌。',memory:'优先二号桌',suggestion:null};
async function withServer(handler,run){
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await run(`http://127.0.0.1:${server.address().port}`);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
const event=value=>JSON.stringify(value)+'\n';

test('structured replies whitelist speech, plans, emotion and suggestions without economic commands',()=>{
  const r=parseReply('```json\n{"speech":"我会先照顾窗边。","memory":"窗边适合安静的客人","suggestion":"tasting","gold":99999,"plan":{"type":"policy","value":"clean-first","gold":2},"emotion":"happy"}\n```');
  assert.equal(r.speech,'我会先照顾窗边。');assert.equal(r.memory,'窗边适合安静的客人');
  assert.equal(r.gold,undefined);assert.equal(r.suggestion,'tasting');assert.deepEqual(r.plan,{type:'policy',value:'clean-first'});assert.equal(r.emotion,'happy');
  assert.throws(()=>parseReply('{"money":900}'),/回复/);
  for(const suggestion of ['party','recipe','quick','premium','tasting'])assert.equal(parseReply(JSON.stringify({speech:'好',suggestion})).suggestion,suggestion);
  assert.equal(parseReply('{"speech":"好","suggestion":"give-gold","emotion":"eval"}').suggestion,null);
});

test('memory deduplicates and keeps the latest twelve bounded items',()=>{
  const w={memories:[]};for(let i=0;i<15;i++)remember(w,`安排${i}`);
  remember(w,'安排14');assert.equal(w.memories.length,12);assert.equal(w.memories[0],'安排3');
  remember(w,'a'.repeat(500));assert.equal(w.memories.at(-1).length,160);
});

test('HTTP client sends only local chat contract without provider settings or credentials',async()=>{
  await withServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const payload=JSON.parse(body);
    assert.equal(req.url,'/api/ai/chat');assert.equal(req.headers.authorization,undefined);
    assert.deepEqual(payload,{staff,context:{day:1,gold:360},message:'先服务二号桌',stream:false});
    assert.ok(!body.includes('legacy-secret'));assert.ok(!body.includes('provider.example'));assert.ok(!body.includes('old-model'));assert.ok(!body.includes('LangChain'));
    json(res,{reply});
  },async base=>{
    const r=await requestStaffReply({...config,key:'legacy-secret',baseUrl:'https://provider.example',model:'old-model',service:'LangChain'},staff,{day:1,gold:360},'先服务二号桌',{endpoint:base+'/api/ai/chat'});
    assert.deepEqual(r,reply);
  });
});

test('production URLs remain same-origin even when old provider settings are passed',async()=>{
  const original=globalThis.fetch;let seen;
  globalThis.fetch=async(url,options)=>{seen={url,options};return new Response(JSON.stringify({reply}),{headers:{'content-type':'application/json'}});};
  try{await requestStaffReply({...config,baseUrl:'https://old.example',key:'old-key'},staff,{},'你好');assert.equal(seen.url,'/api/ai/chat');assert.equal(seen.options.headers.Authorization,undefined);}
  finally{globalThis.fetch=original;}
});

test('loopback mock endpoint cannot be used to send dialogue to a remote origin',async()=>{
  await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:'http://remote.example/api/ai/chat'}),/本机服务地址/);
});

test('missing configuration fails before issuing a request',async()=>{
  const original=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw Error();};
  try{await assert.rejects(requestStaffReply({configured:false},staff,{},'你好'),/环境变量/);assert.equal(called,false);}
  finally{globalThis.fetch=original;}
});

test('timeout is bounded while waiting for headers or an unfinished stream',async()=>{
  for(const streamed of [false,true])await withServer((req,res)=>{if(streamed){res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(event({type:'speech',speech:'半句'}));}},async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base,timeoutMs:40,onPartial:streamed?()=>{}:undefined}),/超时/);
  });
});

test('legacy bootstrap is discarded and removed without importing any credentials',()=>{
  const hash='#bootstrap='+encodeURIComponent(btoa(JSON.stringify({key:'legacy-secret',baseUrl:'https://old.example',model:'old'})));
  for(const value of [hash,'#bootstrap=not-valid']){
    let clean;assert.equal(consumeBootstrap({hash:value,pathname:'/game',search:'?a=1'},{replaceState:(_a,_b,url)=>clean=url}),null);assert.equal(clean,'/game?a=1');
  }
});

test('startup purges old session and provider preferences, preserving only the auto choice',()=>{
  let saved,removed,clean;
  const local={getItem:()=>JSON.stringify({auto:false,key:'old-key',baseUrl:'https://old.example',model:'old-model',configured:true}),setItem:(key,value)=>saved={key,value}};
  const session={getItem:()=>{throw Error('Legacy session must never be read');},removeItem:key=>removed=key};
  const value=loadClientConfig(local,session,{hash:'#bootstrap=old',pathname:'/',search:''},{replaceState:(_a,_b,url)=>clean=url});
  assert.equal(value.auto,false);assert.equal(value.configured,false);assert.equal(value.key,undefined);assert.equal(value.baseUrl,'');assert.equal(removed,'moonlit-ai-session');
  assert.deepEqual(saved,{key:'moonlit-preferences',value:'{"auto":false}'});assert.equal(clean,'/');
});

test('status fetch returns only public fields and strips URL credentials and query strings',async()=>{
  await withServer((req,res)=>{
    assert.equal(req.url,'/api/ai/status');assert.equal(req.method,'GET');
    json(res,{service:'moonlit-tankard-langchain',configured:true,model:'test-model',baseUrl:'https://user:secret@provider.example/v1?key=secret#secret',framework:'LangChain Python',key:'secret'});
  },async base=>{
    assert.deepEqual(await fetchServerStatus({endpoint:base+'/api/ai/status'}),{service:'moonlit-tankard-langchain',configured:true,model:'test-model',baseUrl:'https://provider.example/v1',framework:'LangChain Python'});
  });
});

test('a static server or missing local service cannot masquerade as configured AI',async()=>{
  await withServer((req,res)=>json(res,{configured:true}),async base=>{await assert.rejects(fetchServerStatus({endpoint:base}),/start.cmd/);});
  await withServer((req,res)=>{},async base=>{await assert.rejects(fetchServerStatus({endpoint:base,timeoutMs:30}),/经营可以继续/);});
});

test('settings shows escaped read-only server status with no key or provider input',()=>{
  const html=settingsView({...config,auto:true,model:'<script>unsafe</script>',baseUrl:'https://provider.example'},{});
  assert.ok(html.includes('LangChain'));assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!html.includes('id="api-key"'));assert.ok(!html.includes('id="api-base"'));assert.ok(!html.includes('id="api-model"'));assert.ok(html.includes('id="auto-ai"'));
});

test('NDJSON handles UTF8 byte boundaries, CRLF, escaped strings and final reply whitelist',async()=>{
  const speech='青芽说：“好呀”\n花茶\\新配方😀';const final={speech,memory:'喜欢花茶',suggestion:'party',gold:999,emotion:'happy'};
  const partial=[];
  await withServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;assert.equal(JSON.parse(body).stream,true);
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});
    const events=Array.from(speech,(_,i)=>({type:'speech',speech:Array.from(speech).slice(0,i+1).join('')}));
    const wire='\r\n'+events.map(value=>JSON.stringify(value)+'\r\n').join('')+event({type:'reply',reply:final});
    const bytes=Buffer.from(wire);for(let i=0;i<bytes.length;i+=7){res.write(bytes.subarray(i,i+7));await new Promise(resolve=>setImmediate(resolve));}res.end();
  },async base=>{
    const result=await requestStaffReply(config,staff,{},'你好',{endpoint:base,onPartial:text=>partial.push(text)});
    assert.equal(result.speech,speech);assert.equal(result.suggestion,'party');assert.equal(result.emotion,'happy');assert.equal(result.gold,undefined);
    assert.ok(partial.length>2);assert.equal(partial.at(-1),speech);assert.ok(partial.every(text=>speech.startsWith(text)));
  });
});

test('NDJSON completes at the validated final event before the connection closes',async()=>{
  await withServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(event({type:'speech',speech:'青'})+event({type:'reply',reply:{speech:'青芽😀',memory:'',suggestion:'premium'}}));},async base=>{
    const partial=[];const result=await requestStaffReply(config,staff,{},'你好',{endpoint:base,timeoutMs:500,onPartial:text=>partial.push(text)});
    assert.equal(result.speech,'青芽😀');assert.deepEqual(partial,['青','青芽😀']);
  });
});

test('JSON fallback and final NDJSON line without newline both return validated replies',async()=>{
  for(const streamed of [false,true])await withServer((req,res)=>{
    res.writeHead(200,{'Content-Type':streamed?'application/x-ndjson':'application/json'});res.end(JSON.stringify(streamed?{type:'reply',reply}:{reply}));
  },async base=>{
    const partial=[];assert.deepEqual(await requestStaffReply(config,staff,{},'你好',{endpoint:base,onPartial:text=>partial.push(text)}),reply);assert.deepEqual(partial,[reply.speech]);
  });
});

test('aborting a real stream rejects before subsequent partial or final events commit',async()=>{
  await withServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(event({type:'speech',speech:'半句话'})+event({type:'speech',speech:'第二句'})+event({type:'reply',reply}));},async base=>{
    const controller=new AbortController(),partial=[];
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base,signal:controller.signal,onPartial:text=>{partial.push(text);controller.abort();}}),/取消/);assert.deepEqual(partial,['半句话']);
  });
});

test('an already-aborted signal prevents network and partial callbacks',async()=>{
  const controller=new AbortController();controller.abort();const original=globalThis.fetch;let called=false;
  globalThis.fetch=async()=>{called=true;throw Error();};
  try{await assert.rejects(requestStaffReply(config,staff,{},'你好',{signal:controller.signal,onPartial:()=>assert.fail('late partial')}),/取消/);assert.equal(called,false);}
  finally{globalThis.fetch=original;}
});

test('partial-only, malformed and invalid final streams reject instead of producing a reply',async()=>{
  const broken=[event({type:'speech',speech:'尚未完成'}),'not-json\n',event({type:'speech',speech:'半句'})+event({type:'reply',reply:{memory:'不可提交'}}),event({type:'unknown'})];
  for(const wire of broken)await withServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(wire);},async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base,onPartial:()=>{}}),/回复/);
  });
});

test('safe HTTP and streamed errors never expose server messages or upstream payloads',async()=>{
  for(const status of [401,403,422,429,500,503])await withServer((req,res)=>json(res,{error:{code:'unknown',message:'SECRET upstream raw request'}},status),async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base}),error=>{assert.ok(!error.message.includes('SECRET'));assert.match(error.message,/[\u4e00-\u9fff]/);return true;});
  });
  await withServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(event({type:'error',code:'timeout',message:'SECRET'}));},async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base,onPartial:()=>{}}),/超时/);
  });
});

test('current applied work arrangements and private history reach the backend unchanged',async()=>{
  const context={workPolicy:'clean-first',workArrangement:{current:'优先收桌，已生效',pending:null,recentlyApplied:['店主已应用优先收桌']},recentDialogue:[{role:'staff',text:'等你点应用'}]};
  await withServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;assert.deepEqual(JSON.parse(body).context,context);json(res,{reply});},async base=>{
    await requestStaffReply(config,{...staff,memories:['等待店主应用收桌安排']},context,'确认当前安排',{endpoint:base});
  });
});

test('backend error codes produce specific safe Chinese messages without passing through raw errors',async()=>{
  const expected={credentials:/凭据不可用/,permission:/权限不足/,connection:/无法连接模型供应商/,invalid_reply:/回复格式不完整/,busy:/正在回应/,rate_limit:/调用较频繁/};
  for(const [code,pattern] of Object.entries(expected))await withServer((req,res)=>{
    res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(event({type:'error',code,message:'SECRET upstream payload'}));
  },async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base,onPartial:()=>{}}),error=>{assert.match(error.message,pattern);assert.ok(!error.message.includes('SECRET'));return true;});
  });
  await withServer((req,res)=>json(res,{error:{code:'connection',message:'SECRET'}},503),async base=>{
    await assert.rejects(requestStaffReply(config,staff,{},'你好',{endpoint:base}),/无法连接模型供应商/);
  });
});
