import {normalizeCellar} from './cellar-engine.js';
import * as engine from './engine.js';
import {STAFF,DRINKS,TABLE_LAYOUT,UPGRADES,WORLD,REQUESTS,MAX_STAFF,STAR_BASE,STAR_STEPS,starTier,CELLAR} from './content.js';
import {isWalkable,nearestWalkable,findPath} from './navigation.js';
import {publicProgression,parseProgression} from './progression.js';
const {createGame}=engine;
const createPlayer=()=>engine.createPlayer?engine.createPlayer():({id:'player',x:768,y:800,path:[],direction:0,job:null,carrying:null,target:null,interaction:null,completed:0});
const KEYS=[...new Set([...Object.keys(createGame()),'player'])];
const WORKER_KEYS=['id','role','x','y','direction','path','job','priority','memories','conversation','relationships','completed','bubble','bubbleUntil','suggestion','memoryBook','workPolicy','pendingPlan'];
const pick=(o,keys)=>o==null?o:Object.fromEntries(keys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,o[k]]));
const cleanPath=p=>p?.map(v=>pick(v,['x','y']));
const cleanJob=j=>pick(j,['kind','table','stage','remaining','consumed','suspended']);
const cleanTarget=t=>pick(t,['kind','id']);
const STAT_KEYS=['revenue','tips','purchases','wages','served','missed'];
const receipt=r=>pick(r,['day',...STAT_KEYS,'profit','reputation','stars','starGain','starNote','cellarAged']);
const MAX_SLOTS=CELLAR.baseSlots+CELLAR.extraSlots;
const cleanMemory=w=>({memoryBook:(Array.isArray(w.memoryBook)?w.memoryBook:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.text==='string').slice(-60).map(m=>({id:m.id.slice(0,120),type:typeof m.type==='string'?m.type.slice(0,40):'event',text:m.text.slice(0,1000),subject:typeof m.subject==='string'?m.subject.slice(0,120):'',source:typeof m.source==='string'?m.source.slice(0,120):'local',day:Number.isInteger(m.day)&&m.day>=1?m.day:1,importance:Number.isFinite(m.importance)?Math.max(0,Math.min(10,m.importance)):1,pinned:m.pinned===true})),workPolicy:['balanced','clean-first','urgent-first'].includes(w.workPolicy)?w.workPolicy:'balanced',pendingPlan:cleanPlan(w.pendingPlan)});
function cleanPlan(p){if(p?.type==='policy'&&['balanced','clean-first','urgent-first'].includes(p.value))return {type:'policy',value:p.value};if(p?.type==='restock'&&DRINKS[p.drink]&&Number.isInteger(p.low)&&Number.isInteger(p.target)&&p.low>=0&&p.target>=p.low&&p.target<=40)return {type:'restock',drink:p.drink,low:p.low,target:p.target};return null;}
const cleanWorker=w=>{const v={...pick(w,WORKER_KEYS),...cleanMemory(w)};v.path=cleanPath(w.path);v.job=cleanJob(w.job);v.memories=w.memories?.filter(m=>typeof m==='string');v.conversation=w.conversation?.filter(c=>c&&typeof c.text==='string'&&typeof c.role==='string').map(c=>pick(c,['role','text','kind','time']));v.relationships=pick(w.relationships,STAFF.map(d=>d.id));v.suggestion=['tasting','party','recipe','quick','premium'].includes(w.suggestion)?w.suggestion:undefined;return v;};
export function publicSave(state){
  const safe=pick(state,KEYS);
  safe.progression=publicProgression(state.progression);
  safe.player=pick(state.player??createPlayer(),['id','x','y','path','direction','job','carrying','target','interaction','completed']);
  safe.player.path=cleanPath(safe.player.path);safe.player.job=cleanJob(safe.player.job);
  safe.player.carrying=pick(safe.player.carrying,['table','drink','quantity']);
  safe.player.target=cleanTarget(safe.player.target);safe.player.interaction=cleanTarget(safe.player.interaction);
  safe.staff=state.staff.map(cleanWorker);safe.reserve=(state.reserve??[]).map(cleanWorker);
  safe.tables=state.tables.map(t=>{const v=pick(t,['id','x','y','shape','enabled','status','guest','order','worker','patience','patienceMax','eatTimer']);v.order=pick(t.order,['drink','quantity','paid','ready','vintage','vintageLots']);if(v.order?.vintageLots)v.order.vintageLots=v.order.vintageLots.filter(l=>l&&Number.isInteger(l.qty)&&l.qty>0&&[0,1,2,3].includes(l.level)).map(({qty,level})=>({qty,level}));v.request=pick(t.request,['id','fulfilled']);v.guest=pick(t.guest,['id','variant','party','x','y','direction','path']);if(v.guest){v.guest.path=cleanPath(v.guest.path);if(t.guest.companion)v.guest.companion=pick(t.guest.companion,['x','y']);}return v;});
  safe.stock=pick(state.stock,Object.keys(DRINKS));safe.menu=pick(state.menu,Object.keys(DRINKS));safe.upgrades=pick(state.upgrades,Object.keys(UPGRADES));safe.stats=pick(state.stats,STAT_KEYS);
  safe.cellar=normalizeCellar(state.cellar);safe.cellar.workers=(state.cellar?.workers??[]).map(cleanWorker);
  safe.events=state.events.map(e=>{const v=pick(e,['id','type','time','staff','table','drink','summary','text','target','amount','cost','total','bonus','count','tier','inspiration','duplicate','rarity','startAt','endsAt','orders','reason','recipe','revenue','tip','deferred','served','rewarded','goal','request']);if(v.summary)v.summary=receipt(v.summary);if(v.target&&typeof v.target==='object')v.target=cleanTarget(v.target);if(v.recipe&&typeof v.recipe==='object')v.recipe=pick(v.recipe,['id','name','base','rarity','frame','description']);if(v.request&&typeof v.request==='object')v.request=pick(v.request,['id','fulfilled']);return v;});
  safe.logs=state.logs.map(l=>pick(l,['id','text','tone']));safe.history=state.history.map(receipt);safe.summary=receipt(state.summary);
  return JSON.stringify(safe);
}
const number=(v,min=0,max=1e9)=>Number.isFinite(v)&&v>=min&&v<=max;
const position=p=>p&&number(p.x,0,1536)&&number(p.y,0,1024);
const path=p=>Array.isArray(p)&&p.length<=30&&p.every(position);
const stats=s=>s&&['revenue','tips','purchases','wages','served','missed'].every(k=>number(s[k]));
function requireValid(condition){if(!condition)throw new Error('存档格式无效或内容不完整。');}
export const SAVE_VERSION=5;
// 一版一版往上搬。旧档只补字段，不重算玩家的成绩：已经攒下的口碑值几颗星就是几颗星。
function migrate(s){
  if(s.version<2){
    s.stars=starTier(s.reputation);s.milestones=[];s.starNote='';s.pendingMilestone=null;s.version=2;
  }
  if(s.version<3){s.cellar={casks:[],vintage:[],seq:0};s.version=3;}
  s.stars=Number.isInteger(s.stars)?Math.min(5,Math.max(0,s.stars)):STAR_BASE;
  s.milestones=Array.isArray(s.milestones)?[...new Set(s.milestones)].filter(id=>STAR_STEPS.some(v=>v.id===id)).slice(0,3):[];
  s.pendingMilestone=STAR_STEPS.some(v=>v.id===s.pendingMilestone)?s.pendingMilestone:null;
  s.starNote=['star','blocked'].includes(s.starNote)?s.starNote:'';
  const raw=s.cellar&&typeof s.cellar==='object'?s.cellar:{};
  // Stage five returns legacy casks to shared stock and refunds only paid, unfinished goods.
  // The version marker and removal of both queues make reload/export/import idempotent.
  if(s.version<5){
    const validCask=o=>o&&DRINKS[o.drink]&&Number.isInteger(o.qty)&&o.qty>0&&o.qty<=CELLAR.perCask&&Number.isInteger(o.level)&&o.level>=0&&o.level<=CELLAR.maxLevel;
    let compensation=0;
    const cap=s.upgrades?.cellar?40:24;
    for(const c of (Array.isArray(raw.casks)?raw.casks:[]).filter(validCask).slice(0,MAX_SLOTS)){
      if(!Number.isInteger(s.stock?.[c.drink]))continue;
      const accepted=Math.min(c.qty,Math.max(0,cap-s.stock[c.drink]));s.stock[c.drink]+=accepted;
      compensation+=(c.qty-accepted)*DRINKS[c.drink].cost;
    }
    const p=raw.production??{},seen=new Set();let refund=0;
    const paid=[p.batch,...(Array.isArray(p.ready)?p.ready:[])];
    for(const batch of paid){
      if(!batch||typeof batch.id!=='string'||seen.has(batch.id)||!DRINKS[batch.drink]||!Number.isInteger(batch.qty)||batch.qty<=0||batch.qty>6)continue;
      seen.add(batch.id);refund+=batch.qty*DRINKS[batch.drink].cost;
    }
    s.gold=Math.min(1e9,s.gold+refund+compensation);
    if(s.stats&&Number.isFinite(s.stats.purchases))s.stats.purchases=Math.max(0,s.stats.purchases-refund);
    if(raw.automation&&Number.isFinite(raw.automation.spent))raw.automation.spent=Math.max(0,raw.automation.spent-refund);
    if(s.phase==='closed'&&refund){
      for(const receipt of [s.summary,...(Array.isArray(s.history)?s.history:[])])if(receipt?.day===s.day&&Number.isFinite(receipt.purchases)){
        const returned=Math.min(receipt.purchases,refund);receipt.purchases-=returned;if(Number.isFinite(receipt.profit))receipt.profit+=returned;
      }
    }
    for(const table of Array.isArray(s.tables)?s.tables:[])if(table.order&&!table.order.paid){table.order.vintage=0;delete table.order.vintageLots;}
    s.version=5;
  }
  s.cellar=normalizeCellar(raw);
  for(const worker of [...(Array.isArray(s.reserve)?s.reserve:[])])if(STAFF.find(d=>d.id===worker.id)?.area==='cellar')worker.role='restocker';
  return s;
}
export function parseGame(raw){
  const s=typeof raw==='string'?JSON.parse(raw):JSON.parse(JSON.stringify(raw));
  const legacy=s&&!Object.hasOwn(s,'player');if(legacy)s.player=createPlayer();
  requireValid(s&&Number.isInteger(s.version)&&s.version>=1&&s.version<=SAVE_VERSION&&['ready','open','closed'].includes(s.phase)&&number(s.gold)&&number(s.reputation,1,5)&&number(s.elapsed,0,600)&&Number.isInteger(s.day)&&s.day>=1);
  migrate(s);requireValid(s.version===SAVE_VERSION);
  requireValid(typeof s.paused==='boolean'&&[1,2,3].includes(s.speed)&&number(s.rng,0,4294967295)&&number(s.arrivalIn,-1000,1000)&&number(s.eventSeq)&&number(s.guestSeq)&&number(s.lastSettledDay)&&[null,'tasting'].includes(s.event));
  s.progression=parseProgression(s.progression,s);requireValid(s.progression);
  requireValid(Array.isArray(s.staff)&&s.staff.length>=1&&s.staff.length<=5&&new Set(s.staff.map(w=>w.id)).size===s.staff.length);
  s.reserve??=[];requireValid(Array.isArray(s.reserve)&&s.reserve.length<=7);
  // Upgrade only the complete old three-product schema, never a damaged modern save.
  const additions=Object.keys(DRINKS).filter(k=>!['ale','citrus','tea'].includes(k));
  if(s.stock&&s.menu&&additions.length&&additions.every(k=>!Object.hasOwn(s.stock,k)&&!Object.hasOwn(s.menu,k))){
    for(const k of additions){s.stock[k]=0;s.menu[k]=false;}
  }
  requireValid(s.stock&&Object.keys(DRINKS).every(k=>Number.isInteger(s.stock[k])&&number(s.stock[k],0,40)));
  requireValid(s.menu&&Object.keys(DRINKS).every(k=>typeof s.menu[k]==='boolean')&&Object.values(s.menu).some(Boolean));
  requireValid(s.upgrades&&Object.keys(UPGRADES).every(k=>[0,1].includes(s.upgrades[k]))&&stats(s.stats));
  requireValid(s.cellar&&Array.isArray(s.cellar.casks)&&s.cellar.casks.length<=MAX_SLOTS&&Array.isArray(s.cellar.vintage)&&number(s.cellar.seq));
  requireValid(Array.isArray(s.events)&&s.events.every(e=>e&&typeof e.id==='string'&&typeof e.type==='string')&&Array.isArray(s.logs)&&s.logs.every(l=>l&&typeof l.text==='string')&&Array.isArray(s.history));
  requireValid(Array.isArray(s.tables));
  if(s.tables.length===4&&s.tables.every(t=>TABLE_LAYOUT.slice(0,4).some(d=>d.id===t.id))){
    for(const d of TABLE_LAYOUT.slice(4))s.tables.push({...d,enabled:false,status:'empty',guest:null,order:null,worker:null,patience:0,patienceMax:150,eatTimer:0,request:null});
  }
  requireValid(s.tables.length===TABLE_LAYOUT.length&&new Set(s.tables.map(t=>t.id)).size===TABLE_LAYOUT.length);
  for(const t of s.tables){
    if(t.enabled===undefined)t.enabled=true;
    if(t.patienceMax===undefined)t.patienceMax=Math.max(150,t.patience||0);
    if(t.request===undefined)t.request=null;
  }
  // Preserve a fourth legacy employee's memories off duty under the new three-person limit.
  if(s.staff.length>MAX_STAFF){
    for(const w of s.staff.splice(MAX_STAFF)){
      for(const t of s.tables)if(t.worker===w.id){
        t.worker=null;
        if(t.status==='preparing'){
          if(t.order?.ready)t.status='ready';
          else {t.status='waiting';s.stock[t.order.drink]=Math.min(s.upgrades.cellar?40:24,s.stock[t.order.drink]+t.order.quantity);}
        }
      }
      Object.assign(w,{path:[],job:null,priority:null,bubble:'',bubbleUntil:0});s.reserve.push(w);
      for(const key of ['target','interaction'])if(s.player[key]?.kind==='staff'&&s.player[key].id===w.id)s.player[key]=null;
    }
  }
  // Old closed saves froze patrons at their seats. Clear them without settling twice.
  if(s.phase==='closed'){
    for(const t of s.tables)Object.assign(t,{status:'empty',guest:null,order:null,worker:null,patience:0,eatTimer:0,request:null});
    for(const w of s.staff){w.job=null;w.path=[];w.bubble='';w.bubbleUntil=0;}
    s.player.job=null;s.player.path=[];s.player.carrying=null;s.player.target=null;s.player.interaction=null;
  }
  const ids=[...s.staff,...s.cellar.workers].map(w=>w.id),allIds=[...ids,...s.reserve.map(w=>w.id)];
  requireValid(s.cellar.workers.length<=2&&s.staff.every(w=>STAFF.find(d=>d.id===w.id)?.area==='floor')&&s.cellar.workers.every(w=>STAFF.find(d=>d.id===w.id)?.area==='cellar'));
  requireValid(new Set(allIds).size===allIds.length&&allIds.length<=STAFF.length);
  for(const t of s.tables){
    requireValid(TABLE_LAYOUT.some(v=>v.id===t.id)&&position(t)&&typeof t.enabled==='boolean'&&['empty','arriving','waiting','preparing','ready','served','leaving','dirty'].includes(t.status)&&number(t.patience,-5,1000)&&number(t.patienceMax,0,1000)&&number(t.eatTimer,-5,1000)&&[null,...ids,'player'].includes(t.worker));
    requireValid(t.enabled||t.status==='empty');
    requireValid(t.request===null||(t.request&&Object.hasOwn(REQUESTS,t.request.id)&&typeof t.request.fulfilled==='boolean'));
    if(t.status==='empty')requireValid(t.guest===null&&t.order===null);
    else requireValid(t.order&&DRINKS[t.order.drink]&&[1,2].includes(t.order.quantity)&&typeof t.order.paid==='boolean');
    if(t.order?.ready!==undefined)requireValid(typeof t.order.ready==='boolean');
    if(t.order?.vintageLots!==undefined){if(!Array.isArray(t.order.vintageLots)||!t.order.vintageLots.every(l=>l&&Number.isInteger(l.qty)&&l.qty>0&&[0,1,2,3].includes(l.level))||t.order.vintageLots.reduce((n,l)=>n+l.qty,0)!==t.order.quantity)delete t.order.vintageLots;}
    if(t.order?.vintage!==undefined)requireValid([0,1,2,3].includes(t.order.vintage));
    if(t.status==='ready')requireValid(t.order.ready===true&&t.worker===null&&!t.order.paid);
    if(['arriving','waiting','preparing','ready','served','leaving'].includes(t.status))requireValid(t.guest);
    if(t.guest)requireValid(position(t.guest)&&path(t.guest.path)&&[0,1,2,3].includes(t.guest.variant)&&[1,2].includes(t.guest.party)&&number(t.guest.id));
    if(t.guest?.companion)requireValid(position(t.guest.companion));
  }
  for(const w of [...s.staff,...s.cellar.workers,...s.reserve]){
    requireValid(STAFF.some(d=>d.id===w.id)&&(STAFF.find(d=>d.id===w.id)?.area==='cellar'?['restocker']:['all','bar','floor']).includes(w.role)&&position(w)&&path(w.path)&&number(w.completed)&&typeof w.bubble==='string'&&number(w.bubbleUntil,0,1e15)&&[null,...TABLE_LAYOUT.map(t=>t.id)].includes(w.priority));
    if(w.job)requireValid(['order','clean'].includes(w.job.kind)&&['bar','prepare','pickup','carry','deliver','walk'].includes(w.job.stage)&&TABLE_LAYOUT.some(t=>t.id===w.job.table)&&number(w.job.remaining,-5,1000));
    requireValid(Array.isArray(w.memories)&&Array.isArray(w.conversation)&&w.relationships&&typeof w.relationships==='object'&&!Array.isArray(w.relationships));
    Object.assign(w,cleanMemory(w));
    w.memories=w.memories.filter(v=>typeof v==='string').slice(-12).map(v=>v.slice(0,160));
    w.conversation=w.conversation.filter(v=>v&&typeof v.text==='string'&&['player','staff','system'].includes(v.role)).slice(-40);
    w.relationships=Object.fromEntries(Object.entries(w.relationships).filter(([id,n])=>allIds.includes(id)&&number(n)));
    if(s.reserve.includes(w))requireValid(w.job===null&&w.path.length===0);
  }
  const p=s.player;
  requireValid(p&&p.id==='player'&&position(p)&&path(p.path)&&[0,1,2,3].includes(p.direction)&&number(p.completed));
  const validTarget=t=>t===null||(t&&typeof t.id==='string'&&({staff:ids,table:TABLE_LAYOUT.map(v=>v.id),station:['inventory','ledger','hire','upgrades','events','cellar']}[t.kind]??[]).includes(t.id));
  requireValid(validTarget(p.target)&&validTarget(p.interaction));
  if(p.job)requireValid(['order','clean'].includes(p.job.kind)&&['bar','prepare','pickup','carry','deliver','walk'].includes(p.job.stage)&&TABLE_LAYOUT.some(t=>t.id===p.job.table)&&number(p.job.remaining,-5,1000)&&(p.job.consumed===undefined||typeof p.job.consumed==='boolean')&&(p.job.suspended===undefined||typeof p.job.suspended==='boolean'));
  if(p.carrying){const c=p.carrying,t=s.tables.find(t=>t.id===c.table);requireValid(p.job?.kind==='order'&&['carry','deliver'].includes(p.job.stage)&&c.table===p.job.table&&DRINKS[c.drink]&&[1,2].includes(c.quantity)&&t?.order?.drink===c.drink&&t.order.quantity===c.quantity);}
  for(const actor of [...s.staff,p]){
    if(actor.job){const t=s.tables.find(t=>t.id===actor.job.table);requireValid(t?.worker===actor.id&&t.status===(actor.job.kind==='clean'?'dirty':'preparing'));}
    if(actor!==p){actor.chatWith=null;actor.socialUntil=0;}
  }
  for(const t of s.tables){if(t.worker){const actor=[...s.staff,p].find(a=>a.id===t.worker);requireValid(actor?.job?.table===t.id);}}
  // Version-one saves predate obstacle-aware paths. Only migrate absent-player saves
  // or physically blocked actors, preserving already valid modern roundtrips.
  for(const actor of [...s.staff,p]){
    const navigation={tables:s.tables},blocked=!isWalkable(actor,navigation);
    if(blocked){const snapped=nearestWalkable(actor,navigation);requireValid(snapped);Object.assign(actor,snapped);}
    if(legacy||blocked){let goal=null;if(actor.job){const t=s.tables.find(t=>t.id===actor.job.table);goal=actor.job.stage==='pickup'?WORLD.pass:['bar','prepare'].includes(actor.job.stage)?WORLD.bar:{x:t.x,y:t.y+100};}else if(actor.path.length)goal=actor.path.at(-1);actor.path=goal?findPath(actor,goal,navigation):[];}
  }
  const receipt=r=>r&&stats(r)&&number(r.day,1)&&number(r.profit,-1e9)&&number(r.reputation,1,5)&&
    (r.stars===undefined||Number.isInteger(r.stars)&&number(r.stars,0,5))&&
    (r.starGain===undefined||number(r.starGain,-5,5))&&(r.starNote===undefined||['','star','blocked'].includes(r.starNote))&&
    (r.cellarAged===undefined||number(r.cellarAged,0,8));
  requireValid((s.summary===null||receipt(s.summary))&&s.history.every(receipt));
  if(s.phase==='closed')requireValid(s.summary&&s.summary.day===s.day&&s.lastSettledDay===s.day);
  const clean=JSON.parse(publicSave(s));for(const w of clean.staff){w.chatWith=null;w.socialUntil=0;}return clean;
}
export function loadGame(raw){try{return parseGame(raw);}catch{return createGame();}}
export const SAVE_KEY='moonlit-tankard-save-v1';
