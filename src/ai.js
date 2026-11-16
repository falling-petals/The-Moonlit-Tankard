import {rememberDialogue,sanitizePlan} from './memory.js';
import {validEmotion} from './character-animation.js';

export const DEFAULT_CONFIG={configured:false,service:'',model:'',baseUrl:'',framework:'',auto:true};
const SERVICE='moonlit-tankard-langchain';
const FORMAT_ERROR='模型回复格式不完整，请重试。';
export function parseReply(raw){
  const clean=String(raw??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let value;try{value=JSON.parse(clean);}catch{throw new Error(FORMAT_ERROR);}
  if(!value||typeof value.speech!=='string'||!value.speech.trim())throw new Error('模型回复缺少有效内容。');
  return {speech:value.speech.trim().slice(0,360),memory:typeof value.memory==='string'?value.memory.trim().slice(0,160):'',
    suggestion:['tasting','recipe','party','quick','premium'].includes(value.suggestion)?value.suggestion:null,...(sanitizePlan(value.plan)?{plan:sanitizePlan(value.plan)}:{}),...(validEmotion(value.emotion)?{emotion:validEmotion(value.emotion)}:{})};
}
export function remember(worker,text){return rememberDialogue(worker,text);}

// Legacy URL credentials are discarded without decoding or importing them.
export function consumeBootstrap(location,history){
  if(location.hash.startsWith('#bootstrap='))history.replaceState(null,'',location.pathname+location.search);
  return null;
}
export function loadClientConfig(local,session,location,history){
  let auto=true;
  try{const value=JSON.parse(local.getItem('moonlit-preferences')||'{}');if(typeof value?.auto==='boolean')auto=value.auto;}catch{}
  try{session.removeItem('moonlit-ai-session');}catch{}
  try{local.setItem('moonlit-preferences',JSON.stringify({auto}));}catch{}
  consumeBootstrap(location,history);
  return {...DEFAULT_CONFIG,auto};
}
function endpointFor(path,override){
  if(!override)return path;
  // A loopback-only injection point for HTTP tests; provider settings never select a URL.
  let url;try{url=new URL(override);}catch{throw new Error('本机服务地址无效。');}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('本机服务地址无效。');
  return url.href;
}
function safeError(code,status){
  if(code==='not_configured')return '本机模型服务尚未配置，请设置服务环境变量后重新启动 start.cmd。经营可以继续进行。';
  if(code==='credentials')return '模型服务凭据不可用，请检查本机服务环境变量后重新启动 start.cmd。';
  if(code==='permission')return '模型服务权限不足，请检查本机服务配置与模型访问权限。';
  if(code==='connection')return '本机服务无法连接模型供应商，请检查网络与服务环境变量。经营可以继续进行。';
  if(code==='invalid_reply')return FORMAT_ERROR;
  if(code==='busy')return '伙伴正在回应，稍等片刻后再试。';
  if(code==='timeout'||code==='upstream_timeout')return '模型回复超时，店员仍在正常工作。';
  if(code==='rate_limit'||code==='rate_limited'||status===429)return '调用较频繁，稍后再试。';
  if(status===422||code==='invalid_request')return '对话内容未通过校验，请缩短内容后重试。';
  if(status===401||status===403)return '模型服务配置或权限不可用，请检查本机服务环境变量。';
  return '本机模型服务暂时无法回应，请稍后重试。';
}
function validatedReply(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(FORMAT_ERROR);
  return parseReply(JSON.stringify(value));
}
async function readStream(response,onPartial,signal){
  const reader=response.body?.getReader();if(!reader)throw new Error(FORMAT_ERROR);
  const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',last='',reply=null,total=0;
  const consume=line=>{
    if(!line.trim())return;
    signal.throwIfAborted();let event;try{event=JSON.parse(line);}catch{throw new Error(FORMAT_ERROR);}
    if(event?.type==='error')throw new Error(safeError(event.code));
    if(event?.type==='speech'){
      if(typeof event.speech!=='string')throw new Error(FORMAT_ERROR);
      const speech=event.speech.slice(0,360).replace(/[\uD800-\uDBFF]$/u,'');
      if(speech&&speech!==last){last=speech;onPartial?.(speech);signal.throwIfAborted();}
    }else if(event?.type==='reply')reply=validatedReply(event.reply);
    else throw new Error(FORMAT_ERROR);
  };
  try{
    while(!reply){
      signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();
      total+=chunk.value?.byteLength??0;if(total>1_000_000)throw new Error(FORMAT_ERROR);
      try{buffer+=decoder.decode(chunk.value,{stream:!chunk.done});}catch{throw new Error(FORMAT_ERROR);}
      let boundary;
      while((boundary=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);consume(line);if(reply)break;}
      if(chunk.done){if(!reply&&buffer.trim())consume(buffer);break;}
    }
    signal.throwIfAborted();if(!reply)throw new Error(FORMAT_ERROR);
    if(reply.speech!==last){onPartial?.(reply.speech);signal.throwIfAborted();}
    return reply;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function fetchServerStatus(options={}){
  const controller=new AbortController(),abort=()=>controller.abort();
  const timer=setTimeout(abort,options.timeoutMs??4000);options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  try{
    controller.signal.throwIfAborted();
    const response=await fetch(endpointFor('/api/ai/status',options.endpoint),{signal:controller.signal,cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error();
    const data=await response.json();controller.signal.throwIfAborted();
    if(data?.service!==SERVICE||typeof data.configured!=='boolean'||data.framework!=='LangChain Python')throw new Error();
    // Keep only the public status fields, even if an old server sends extra properties.
    return {service:SERVICE,configured:data.configured,model:typeof data.model==='string'?data.model.slice(0,160):'',baseUrl:publicBaseUrl(data.baseUrl),framework:'LangChain Python'};
  }catch{throw new Error('无法连接本机模型服务，请使用 start.cmd 启动。经营可以继续进行。');}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
function publicBaseUrl(value){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';url.username='';url.password='';url.search='';url.hash='';return url.href.replace(/\/$/,'');}catch{return '';}
}
export async function requestStaffReply(config,staff,context,message,options={}){
  if(!config.configured)throw new Error(safeError('not_configured'));
  const controller=new AbortController();let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},options.timeoutMs??25000);
  const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)controller.abort();
  const body={staff:{id:staff.id,name:staff.name,personality:staff.personality,memories:staff.memories||[]},context,message,stream:typeof options.onPartial==='function'};
  try{
    controller.signal.throwIfAborted();
    const response=await fetch(endpointFor('/api/ai/chat',options.endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,credentials:'same-origin',referrerPolicy:'no-referrer'});
    controller.signal.throwIfAborted();
    if(!response.ok){
      let code;try{code=(await response.json())?.error?.code;}catch{}
      controller.signal.throwIfAborted();throw new Error(safeError(code,response.status));
    }
    if(response.headers.get('content-type')?.includes('application/x-ndjson'))return await readStream(response,options.onPartial,controller.signal);
    let data;try{data=await response.json();}catch{controller.signal.throwIfAborted();throw new Error(FORMAT_ERROR);}
    controller.signal.throwIfAborted();const reply=validatedReply(data?.reply);
    options.onPartial?.(reply.speech);controller.signal.throwIfAborted();return reply;
  }catch(error){
    if(timedOut)throw new Error('模型回复超时，店员仍在正常工作。');
    if(controller.signal.aborted)throw new Error('对话已取消。');
    if(error instanceof TypeError)throw new Error('无法连接本机模型服务，请使用 start.cmd 启动。经营可以继续进行。');
    throw error;
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
