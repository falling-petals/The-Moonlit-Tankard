import * as engine from './engine.js';
import {STAFF,DRINKS,TABLE_LAYOUT,UPGRADES,WORLD} from './content.js';
import {isWalkable,nearestWalkable,findPath} from './navigation.js';
const {createGame}=engine;
const createPlayer=()=>engine.createPlayer?engine.createPlayer():({id:'player',x:768,y:800,path:[],direction:0,job:null,carrying:null,target:null,interaction:null,completed:0});
const KEYS=[...new Set([...Object.keys(createGame()),'player'])];
const WORKER_KEYS=['id','role','x','y','direction','path','job','priority','memories','conversation','relationships','completed','bubble','bubbleUntil','suggestion'];
const pick=(o,keys)=>o==null?o:Object.fromEntries(keys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,o[k]]));
const cleanPath=p=>p?.map(v=>pick(v,['x','y']));
const cleanJob=j=>pick(j,['kind','table','stage','remaining','consumed']);
const cleanTarget=t=>pick(t,['kind','id']);
const STAT_KEYS=['revenue','tips','purchases','wages','served','missed'];
const receipt=r=>pick(r,['day',...STAT_KEYS,'profit','reputation']);
export function publicSave(state){
  const safe=pick(state,KEYS);
  safe.player=pick(state.player??createPlayer(),['id','x','y','path','direction','job','carrying','target','interaction','completed']);
  safe.player.path=cleanPath(safe.player.path);safe.player.job=cleanJob(safe.player.job);
  safe.player.carrying=pick(safe.player.carrying,['table','drink','quantity']);
  safe.player.target=cleanTarget(safe.player.target);safe.player.interaction=cleanTarget(safe.player.interaction);
  safe.staff=state.staff.map(w=>{const v=pick(w,WORKER_KEYS);v.path=cleanPath(w.path);v.job=cleanJob(w.job);v.memories=w.memories?.filter(m=>typeof m==='string');v.conversation=w.conversation?.filter(c=>c&&typeof c.text==='string'&&typeof c.role==='string').map(c=>pick(c,['role','text','kind','time']));v.relationships=pick(w.relationships,STAFF.map(d=>d.id));v.suggestion=['tasting','recipe'].includes(w.suggestion)?w.suggestion:undefined;return v;});
  safe.tables=state.tables.map(t=>{const v=pick(t,['id','x','y','shape','status','guest','order','worker','patience','eatTimer']);v.order=pick(t.order,['drink','quantity','paid']);v.guest=pick(t.guest,['id','variant','party','x','y','direction','path']);if(v.guest)v.guest.path=cleanPath(v.guest.path);return v;});
  safe.stock=pick(state.stock,Object.keys(DRINKS));safe.menu=pick(state.menu,Object.keys(DRINKS));safe.upgrades=pick(state.upgrades,Object.keys(UPGRADES));safe.stats=pick(state.stats,STAT_KEYS);
  safe.events=state.events.map(e=>{const v=pick(e,['id','type','time','staff','table','drink','summary','text','target']);if(v.summary)v.summary=receipt(v.summary);if(v.target&&typeof v.target==='object')v.target=cleanTarget(v.target);return v;});
  safe.logs=state.logs.map(l=>pick(l,['id','text','tone']));safe.history=state.history.map(receipt);safe.summary=receipt(state.summary);
  return JSON.stringify(safe);
}
const number=(v,min=0,max=1e9)=>Number.isFinite(v)&&v>=min&&v<=max;
const position=p=>p&&number(p.x,0,1536)&&number(p.y,0,1024);
const path=p=>Array.isArray(p)&&p.length<=30&&p.every(position);
const stats=s=>s&&['revenue','tips','purchases','wages','served','missed'].every(k=>number(s[k]));
function requireValid(condition){if(!condition)throw new Error('存档格式无效或内容不完整。');}
export function parseGame(raw){
  const s=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
  const legacy=s&&!Object.hasOwn(s,'player');if(legacy)s.player=createPlayer();
  requireValid(s&&s.version===1&&['ready','open','closed'].includes(s.phase)&&number(s.gold)&&number(s.reputation,1,5)&&number(s.elapsed,0,600)&&Number.isInteger(s.day)&&s.day>=1);
  requireValid(typeof s.paused==='boolean'&&[1,2,3].includes(s.speed)&&number(s.rng,0,4294967295)&&number(s.arrivalIn,-1000,1000)&&number(s.eventSeq)&&number(s.guestSeq)&&number(s.lastSettledDay)&&[null,'tasting'].includes(s.event));
  requireValid(Array.isArray(s.staff)&&s.staff.length>=1&&s.staff.length<=4&&new Set(s.staff.map(w=>w.id)).size===s.staff.length);
  requireValid(s.stock&&Object.keys(DRINKS).every(k=>Number.isInteger(s.stock[k])&&number(s.stock[k],0,40)));
  requireValid(s.menu&&Object.keys(DRINKS).every(k=>typeof s.menu[k]==='boolean')&&Object.values(s.menu).some(Boolean));
  requireValid(s.upgrades&&Object.keys(UPGRADES).every(k=>[0,1].includes(s.upgrades[k]))&&stats(s.stats));
  requireValid(Array.isArray(s.events)&&s.events.every(e=>e&&typeof e.id==='string'&&typeof e.type==='string')&&Array.isArray(s.logs)&&s.logs.every(l=>l&&typeof l.text==='string')&&Array.isArray(s.history));
  requireValid(Array.isArray(s.tables)&&s.tables.length===4&&new Set(s.tables.map(t=>t.id)).size===4);
  const ids=s.staff.map(w=>w.id);
  for(const t of s.tables){
    requireValid(TABLE_LAYOUT.some(v=>v.id===t.id)&&position(t)&&['empty','arriving','waiting','preparing','served','leaving','dirty'].includes(t.status)&&number(t.patience,-5,1000)&&number(t.eatTimer,-5,1000)&&[null,...ids,'player'].includes(t.worker));
    if(t.status==='empty')requireValid(t.guest===null&&t.order===null);
    else requireValid(t.order&&DRINKS[t.order.drink]&&[1,2].includes(t.order.quantity)&&typeof t.order.paid==='boolean');
    if(['arriving','waiting','preparing','served','leaving'].includes(t.status))requireValid(t.guest);
    if(t.guest)requireValid(position(t.guest)&&path(t.guest.path)&&[0,1,2,3].includes(t.guest.variant)&&[1,2].includes(t.guest.party)&&number(t.guest.id));
  }
  for(const w of s.staff){
    requireValid(STAFF.some(d=>d.id===w.id)&&['all','bar','floor'].includes(w.role)&&position(w)&&path(w.path)&&number(w.completed)&&typeof w.bubble==='string'&&number(w.bubbleUntil,0,1e15)&&[null,...TABLE_LAYOUT.map(t=>t.id)].includes(w.priority));
    if(w.job)requireValid(['order','clean'].includes(w.job.kind)&&['bar','prepare','carry','deliver','walk'].includes(w.job.stage)&&TABLE_LAYOUT.some(t=>t.id===w.job.table)&&number(w.job.remaining,-5,1000));
    requireValid(Array.isArray(w.memories)&&Array.isArray(w.conversation)&&w.relationships&&typeof w.relationships==='object'&&!Array.isArray(w.relationships));
    w.memories=w.memories.filter(v=>typeof v==='string').slice(-12).map(v=>v.slice(0,160));
    w.conversation=w.conversation.filter(v=>v&&typeof v.text==='string'&&['player','staff','system'].includes(v.role)).slice(-40);
    w.relationships=Object.fromEntries(Object.entries(w.relationships).filter(([id,n])=>ids.includes(id)&&number(n)));
  }
  const p=s.player;
  requireValid(p&&p.id==='player'&&position(p)&&path(p.path)&&[0,1,2,3].includes(p.direction)&&number(p.completed));
  const validTarget=t=>t===null||(t&&typeof t.id==='string'&&({staff:ids,table:TABLE_LAYOUT.map(v=>v.id),station:['inventory','ledger','hire','upgrades','events']}[t.kind]??[]).includes(t.id));
  requireValid(validTarget(p.target)&&validTarget(p.interaction));
  if(p.job)requireValid(['order','clean'].includes(p.job.kind)&&['bar','prepare','carry','deliver','walk'].includes(p.job.stage)&&TABLE_LAYOUT.some(t=>t.id===p.job.table)&&number(p.job.remaining,-5,1000)&&(p.job.consumed===undefined||typeof p.job.consumed==='boolean'));
  if(p.carrying){const c=p.carrying,t=s.tables.find(t=>t.id===c.table);requireValid(p.job?.kind==='order'&&['carry','deliver'].includes(p.job.stage)&&c.table===p.job.table&&DRINKS[c.drink]&&[1,2].includes(c.quantity)&&t?.order?.drink===c.drink&&t.order.quantity===c.quantity);}
  for(const actor of [...s.staff,p]){
    if(actor.job){const t=s.tables.find(t=>t.id===actor.job.table);requireValid(t?.worker===actor.id&&t.status===(actor.job.kind==='clean'?'dirty':'preparing'));}
    if(actor!==p){actor.chatWith=null;actor.socialUntil=0;}
  }
  for(const t of s.tables){if(t.worker){const actor=[...s.staff,p].find(a=>a.id===t.worker);requireValid(actor?.job?.table===t.id);}}
  // Version-one saves predate obstacle-aware paths. Only migrate absent-player saves
  // or physically blocked actors, preserving already valid modern roundtrips.
  for(const actor of [...s.staff,p]){
    const blocked=!isWalkable(actor);
    if(blocked){const snapped=nearestWalkable(actor);requireValid(snapped);Object.assign(actor,snapped);}
    if(legacy||blocked){let goal=null;if(actor.job){const t=s.tables.find(t=>t.id===actor.job.table);goal=['bar','prepare'].includes(actor.job.stage)?WORLD.bar:{x:t.x,y:t.y+100};}else if(actor.path.length)goal=actor.path.at(-1);actor.path=goal?findPath(actor,goal):[];}
  }
  const receipt=r=>r&&stats(r)&&number(r.day,1)&&number(r.profit,-1e9)&&number(r.reputation,1,5);
  requireValid((s.summary===null||receipt(s.summary))&&s.history.every(receipt));
  if(s.phase==='closed')requireValid(s.summary&&s.summary.day===s.day&&s.lastSettledDay===s.day);
  const clean=JSON.parse(publicSave(s));for(const w of clean.staff){w.chatWith=null;w.socialUntil=0;}return clean;
}
export function loadGame(raw){try{return parseGame(raw);}catch{return createGame();}}
export const SAVE_KEY='moonlit-tankard-save-v1';
