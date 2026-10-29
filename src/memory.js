// Local, bounded character memory. No service, credentials, or model execution.
const hash=text=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(36);};
export function memoryBook(worker){
  worker.memoryBook??=[];
  for(const text of worker.memories??[])if(typeof text==='string'&&!worker.memoryBook.some(m=>m.text===text))addMemory(worker,{text,type:'preference',subject:'',source:'legacy',importance:3});
  return worker.memoryBook;
}
export function addMemory(worker,{text,type='preference',subject='',source='dialogue',day=1,importance=3,pinned=false}={}){
  if(typeof text!=='string'||!text.trim())return null;
  text=text.trim().slice(0,320);worker.memoryBook??=[];
  const book=worker.memoryBook,existing=book.find(m=>m.text===text||type==='preference'&&subject&&m.type===type&&m.subject===subject);
  if(existing){Object.assign(existing,{text,day,source,importance:Math.max(existing.importance??0,importance)});return existing;}
  const item={id:'m-'+hash(type+'|'+source+'|'+subject+'|'+text),type,text,subject,source,day,importance,pinned};book.push(item);
  if(book.length>60){const candidate=book.filter(m=>!m.pinned).sort((a,b)=>(a.importance??0)-(b.importance??0)||(a.day??0)-(b.day??0))[0]??book[0];book.splice(book.indexOf(candidate),1);}
  return item;
}
export function rememberDialogue(worker,text,day=1){
  if(typeof text!=='string'||!text.trim())return;
  memoryBook(worker);
  const subject=/称呼|叫我|喊我/.test(text)?'owner-name':/甜度|少糖|不.*甜|喜欢.*甜/.test(text)?'owner-sweetness':'';
  const item=addMemory(worker,{text,type:'preference',subject,day,source:'dialogue',importance:subject?7:4});
  worker.memories=worker.memoryBook.filter(m=>m.type==='preference').slice(-12).map(m=>m.text.slice(0,160));return item;
}
export function selectMemories(worker,query='',day=1,limit=8){
  const terms=String(query).toLowerCase().match(/[a-z]{2,}|[\u4e00-\u9fff]{2}/g)??[];
  return memoryBook(worker).map((m,index)=>({m,index,score:(m.pinned?100:0)+(m.importance??1)*3+terms.filter(t=>(m.text+' '+m.subject).toLowerCase().includes(t)).length*8-Math.min(10,Math.max(0,day-(m.day??1)))*.2})).sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,limit).map(v=>({type:v.m.type,text:v.m.text,day:v.m.day,source:v.m.source}));
}
export function forgetMemory(worker,id){memoryBook(worker);const entry=worker.memoryBook.find(m=>m.id===id);if(!entry)return false;worker.memoryBook=worker.memoryBook.filter(m=>m.id!==id);worker.memories=(worker.memories??[]).filter(text=>text!==entry.text&&text!==entry.text.slice(0,160));return true;}
export function pinMemory(worker,id){const entry=memoryBook(worker).find(m=>m.id===id);if(!entry)return false;entry.pinned=!entry.pinned;return true;}
export function sanitizePlan(p){
  if(p?.type==='policy'&&['balanced','clean-first','urgent-first'].includes(p.value))return {type:'policy',value:p.value};
  const drinks=['ale','citrus','tea','coffee','berry','cocoa','cider','mead','moonwine'];
  if(p?.type==='restock'&&drinks.includes(p.drink)&&Number.isInteger(p.low)&&Number.isInteger(p.target)&&p.low>=0&&p.low<=p.target&&p.target<=40)return {type:'restock',drink:p.drink,low:p.low,target:p.target};
  return null;
}
