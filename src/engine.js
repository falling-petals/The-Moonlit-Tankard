import {DAY_LENGTH,WORLD,DRINKS,STAFF,UPGRADES,TABLE_LAYOUT,staffDefinition} from './content.js';
import {findPath,nearestWalkable,isWalkable} from './navigation.js';
import {RECIPES,STRATEGIES,createProgression,drinkInfo} from './progression.js';

export const STATIONS={inventory:{x:230,y:380},ledger:{x:590,y:355},hire:{x:1310,y:390},upgrades:{x:1110,y:355},events:{x:190,y:540}};
export function createPlayer(){return {id:'player',x:768,y:800,path:[],direction:0,job:null,carrying:null,target:null,interaction:null,completed:0};}

const freshStats=()=>({revenue:0,tips:0,purchases:0,wages:0,served:0,missed:0});
export function createEmployee(id,index=0){
  return {id,role:'all',x:index?1060:WORLD.bar.x,y:index?365:WORLD.bar.y,path:[],job:null,priority:null,
    memories:[],conversation:[],relationships:{},completed:0,bubble:'',bubbleUntil:0};
}
export function createGame(){
  return {version:1,day:1,phase:'ready',elapsed:0,paused:false,speed:1,gold:360,reputation:4.2,
    stock:{ale:12,citrus:12,tea:12},menu:{ale:true,citrus:true,tea:true},staff:[createEmployee('qingya')],player:createPlayer(),
    tables:TABLE_LAYOUT.map(t=>({...t,status:'empty',guest:null,order:null,worker:null,patience:0,eatTimer:0})),
    upgrades:{bar:0,ambience:0,cellar:0,plants:0},stats:freshStats(),summary:null,history:[],
    events:[],logs:[{id:'welcome',text:'阳光落在窗边，第一天的故事就要开始。',tone:'info'}],
    eventSeq:0,rng:24681,arrivalIn:3,guestSeq:0,lastSettledDay:0,event:null,progression:createProgression()};
}
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
export function emit(s,type,data={}){const e={id:`${s.day}-${++s.eventSeq}`,type,time:s.elapsed,...data};s.events.push(e);s.events=s.events.slice(-45);return e;}
export function log(s,text,tone='info'){s.logs.push({id:`log-${s.day}-${++s.eventSeq}`,text,tone});s.logs=s.logs.slice(-35);}
const point=(x,y)=>({x,y});
const comboTier=count=>count>=10?10:count>=6?6:count>=3?3:0;
function breakCombo(s){const c=s.progression.combo;c.count=0;c.tier=0;c.expiresAt=0;}
function serviceCombo(s){
  const c=s.progression.combo;if(c.count&&s.elapsed>c.expiresAt)breakCombo(s);
  c.count++;c.best=Math.max(c.best,c.count);c.expiresAt=s.elapsed+55;c.tier=comboTier(c.count);
  for(const [tier,reward] of [[3,3],[6,5],[10,8]])if(c.count>=tier&&!c.rewarded.includes(tier)){
    c.rewarded.push(tier);s.progression.inspiration+=reward;emit(s,'combo-tier',{tier,count:c.count,amount:reward});
  }
  return c.tier===10?1.35:c.tier===6?1.2:c.tier===3?1.1:1;
}
function finishParty(s){
  const p=s.progression.party;if(!['scheduled','active'].includes(p.status))return;
  const completed=p.status==='active'&&s.elapsed>=p.endsAt;p.status='complete';
  if(completed&&p.served>=3&&!p.rewarded){p.rewarded=true;s.progression.goals.party=true;s.progression.inspiration+=12;}
  emit(s,'party-complete',{served:p.served,rewarded:p.rewarded});
}
function payCameo(s){
  const c=s.progression.cameo;if(c.status!=='active'||c.paid)return;
  c.status='complete';c.paid=true;s.gold+=c.pot;
  if(c.orders)s.progression.inspiration+=6;
  emit(s,'cameo-paid',{amount:c.pot,orders:c.orders});log(s,`黄仁勋结清全场饮品账单，共 ${c.pot} 金币。`,'success');
}
function updateProgression(s){
  const p=s.progression;if(p.combo.count&&s.elapsed>p.combo.expiresAt)breakCombo(s);
  if(p.party.status==='scheduled'&&s.elapsed>=p.party.startAt){p.party.status='active';s.arrivalIn=Math.min(s.arrivalIn,1);emit(s,'party-started');log(s,'月下派对开始了！在120秒内招待3桌，收获12灵感。','success');}
  if(p.party.status==='active'&&s.elapsed>=p.party.endsAt)finishParty(s);
  if(p.cameo.status==='waiting'&&s.elapsed>=p.cameo.startsAt){p.cameo.status='active';emit(s,'cameo-started');log(s,'黄仁勋来客串了：接下来60秒，所有顾客的饮品账单由他买单！','success');}
  if(p.cameo.status==='active'&&s.elapsed>=p.cameo.endsAt)payCameo(s);
}
function arrivalInterval(s){
  const c=s.progression.combo,flow=Math.min(1.35,c.tier===10?1.35:c.tier===6?1.2:c.tier===3?1.1:1);
  const interval=(34+Math.floor(random(s)*9))/flow/(s.progression.party.status==='active'?1.6:1);
  return Math.max(14,interval);
}
function aislePath(actor,target){
  const start=nearestWalkable(actor);if(start){actor.x=start.x;actor.y=start.y;}
  return findPath(actor,target);
}
function walk(actor,dt,pace){
  let distance=pace*dt;
  while(actor.path.length&&distance>0){
    const next=actor.path[0],dx=next.x-actor.x,dy=next.y-actor.y,d=Math.hypot(dx,dy);
    if(actor.id==='player'&&d>.01)actor.direction=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
    if(d<=distance){actor.x=next.x;actor.y=next.y;actor.path.shift();distance-=d;}
    else {actor.x+=dx/d*distance;actor.y+=dy/d*distance;distance=0;}
  }
  return actor.path.length===0;
}
function arrive(s){
  const t=s.tables.find(t=>t.status==='empty');if(!t){s.stats.missed++;log(s,'有客人看到满座，决定晚点再来。');return;}
  const choices=Object.keys(DRINKS).filter(k=>s.menu[k]);if(!choices.length)return;
  const variant=Math.floor(random(s)*4),drink=choices[Math.floor(random(s)*choices.length)],quantity=random(s)>.62?2:1;
  t.status='arriving';t.patience=150+(s.upgrades.plants?30:0);
  t.order={drink,quantity,paid:false};t.worker=null;
  t.guest={id:++s.guestSeq,variant,party:quantity,x:WORLD.entry.x,y:WORLD.entry.y,
    path:[point(768,t.y+105),point(t.x-105,t.y+105),point(t.x-105,t.y+25)]};
  log(s,`${t.id.slice(1).padStart(2,'0')} 桌来客，准备点一杯${DRINKS[drink].name}。`);
}
function leave(s,t,unhappy=false){
  t.status='leaving';t.worker=null;
  if(t.guest)t.guest.path=[point(t.x-105,t.y+105),point(768,t.y+105),point(768,900)];
  if(unhappy){breakCombo(s);s.stats.missed++;s.reputation=Math.max(1,Math.round((s.reputation-.04)*100)/100);log(s,`${t.id.slice(1)} 桌等得有些久，离开了。`,'warning');}
}
function assignJob(s,w){
  const waiting=s.tables.filter(t=>t.status==='waiting'&&!t.worker&&t.order&&s.stock[t.order.drink]>=t.order.quantity);
  waiting.sort((a,b)=>(a.id===w.priority?-1000:0)-(b.id===w.priority?-1000:0)+a.patience-b.patience);
  const dirty=s.tables.filter(t=>t.status==='dirty'&&!t.worker).sort((a,b)=>(a.id===w.priority?-1:0)-(b.id===w.priority?-1:0))[0];
  const t=dirty&&(dirty.id===w.priority||!waiting.length||!s.tables.some(t=>t.status==='empty')||w.role==='floor')?dirty:waiting[0];
  if(!t)return;
  t.worker=w.id;
  if(t.status==='dirty'){
    w.job={kind:'clean',table:t.id,stage:'walk',remaining:4};w.path=aislePath(w,point(t.x,t.y+100));
  } else {
    s.stock[t.order.drink]-=t.order.quantity;t.status='preparing';
    w.job={kind:'order',table:t.id,stage:'bar',remaining:drinkInfo(s,t.order.drink).brew*(s.upgrades.bar?.75:1)*(w.role==='bar'?.85:1)};
    w.path=aislePath(w,{...WORLD.bar,x:WORLD.bar.x+s.staff.indexOf(w)*50});
  }
  if(w.priority===t.id)w.priority=null;
}
function updateWorker(s,w,dt){
  const def=staffDefinition(w.id),pace=def.pace;
  if(w.chatWith==='player'||(!w.job&&w.socialUntil>Date.now()))return;
  if(!w.job){assignJob(s,w);return;}
  const job=w.job,t=s.tables.find(t=>t.id===job.table);
  if(!t||!['preparing','dirty'].includes(t.status)||t.worker!==w.id){w.job=null;w.path=[];return;}
  if(w.path.length){if(!walk(w,dt,115*pace*(w.role==='floor'?1.15:1)))return;}
  if(job.kind==='clean'){
    job.remaining-=dt*pace;
    if(job.remaining<=0)finishClean(t,w);
    return;
  }
  if(job.stage==='bar'){job.stage='prepare';return;}
  if(job.stage==='prepare'){
    job.remaining-=dt*pace;
    if(job.remaining<=0){job.stage='deliver';w.path=aislePath(w,point(t.x,t.y+100));}
    return;
  }
  if(job.stage==='deliver')finishOrder(s,t,w);
}
function finishClean(t,w){t.status='empty';t.guest=null;t.order=null;t.worker=null;w.job=null;w.completed++;}
function finishOrder(s,t,w){
  if(t.order&&!t.order.paid&&t.worker===w.id){
    t.order.paid=true;t.status='served';t.eatTimer=26;t.worker=null;
    const drink=drinkInfo(s,t.order.drink),base=drink.price*t.order.quantity,p=s.progression;
    const revenue=Math.round(base*serviceCombo(s)*(p.party.status==='active'?1.35:1));
    const tip=(t.patience>70?2:0)+(s.upgrades.ambience?2:0)+drink.tipModifier;
    const deferred=p.cameo.status==='active'?Math.min(revenue,1000-p.cameo.pot):0;
    if(p.cameo.status==='active'){p.cameo.pot+=deferred;p.cameo.orders++;}
    if(p.party.status==='active')p.party.served++;
    s.gold+=revenue-deferred+tip;s.stats.revenue+=revenue;s.stats.tips+=tip;s.stats.served++;
    if(s.stats.served>=3&&!p.goals.served){p.goals.served=true;p.inspiration+=8;emit(s,'daily-goal',{goal:'served',amount:8});}
    s.reputation=Math.min(5,Math.round((s.reputation+.015)*1000)/1000);w.completed++;
    emit(s,'served',{staff:w.id,table:t.id,drink:t.order.drink,revenue,tip,amount:revenue+tip,deferred});
    log(s,`${w.id==='player'?'你':staffDefinition(w.id).name}完成 ${t.id.slice(1).padStart(2,'0')} 桌订单，收入 ${revenue+tip} 金币${deferred?'，饮品记入全场待结账单':''}。`,'success');w.job=null;
  }
}
function releaseInteraction(s){s.player.interaction=null;s.player.target=null;for(const w of s.staff)if(w.chatWith==='player')w.chatWith=null;}
function cancelPlayer(s){
  const p=s.player,t=s.tables.find(t=>t.id===p.job?.table);
  if(t?.worker==='player'){
    if(p.job.consumed&&t.order&&!t.order.paid)s.stock[t.order.drink]=Math.min(s.upgrades.cellar?40:24,s.stock[t.order.drink]+t.order.quantity);
    if(t.status==='preparing')t.status='waiting';t.worker=null;
  }
  p.job=null;p.carrying=null;p.path=[];releaseInteraction(s);
}
function targetPoint(s,target){
  if(target?.kind==='staff')return s.staff.find(w=>w.id===target.id);
  if(target?.kind==='table'){const t=s.tables.find(t=>t.id===target.id);return t?{x:t.x,y:t.y+100}:null;}
  if(target?.kind==='station')return STATIONS[target.id];return null;
}
function approachPoint(s,target){
  const point=targetPoint(s,target);if(!point||target.kind!=='staff')return point;
  return [{x:point.x+82,y:point.y},{x:point.x-82,y:point.y},{x:point.x,y:point.y+82},{x:point.x,y:point.y-82}].find(p=>isWalkable(p))||point;
}
function updatePlayer(s,dt){
  const p=s.player,j=p.job,t=s.tables.find(t=>t.id===j?.table);
  if(j&&(!t||t.worker!=='player'||!['preparing','dirty'].includes(t.status))){cancelPlayer(s);return;}
  if(p.path.length&&!walk(p,dt,190))return;
  if(j&&!j.suspended){
    if(j.kind==='clean'){j.remaining-=dt;if(j.remaining<=0){finishClean(t,p);log(s,'你把桌面收拾干净，迎接下一位客人。','success');}return;}
    if(j.stage==='bar'){
      if(!j.consumed){
        if(s.stock[t.order.drink]<t.order.quantity){cancelPlayer(s);log(s,'原料不足，先去储藏柜补货吧。','warning');return;}
        s.stock[t.order.drink]-=t.order.quantity;j.consumed=true;
      }
      j.stage='prepare';return;
    }
    if(j.stage==='prepare'){
      j.remaining-=dt;
      if(j.remaining<=0){j.stage='carry';p.carrying={table:t.id,drink:t.order.drink,quantity:t.order.quantity};log(s,`饮品做好了，点击 ${t.id.slice(1)} 号桌亲自送过去。`,'success');emit(s,'player-ready',{table:t.id});}
      return;
    }
    if(j.stage==='deliver'){finishOrder(s,t,p);p.carrying=null;return;}
  }
  if(p.target){
    const target=targetPoint(s,p.target);
    if(!target){releaseInteraction(s);return;}
    if(Math.hypot(target.x-p.x,target.y-p.y)>95){p.path=aislePath(p,approachPoint(s,p.target));return;}
    p.interaction={...p.target};p.target=null;
    if(p.interaction.kind==='staff'){
      target.chatWith='player';target.socialUntil=0;
      const dx=target.x-p.x,dy=target.y-p.y;p.direction=Math.abs(dx)>Math.abs(dy)?(dx<0?2:3):(dy<0?1:0);
    }
  }
}
function tick(s,dt){
  s.elapsed=Math.min(DAY_LENGTH,s.elapsed+dt);
  updateProgression(s);
  s.arrivalIn-=dt;
  if(s.arrivalIn<=0&&s.elapsed<DAY_LENGTH-60){arrive(s);s.arrivalIn=arrivalInterval(s);}
  for(const t of s.tables){
    if(t.status==='arriving'&&walk(t.guest,dt,100)){
      t.status='waiting';emit(s,'guest-request',{table:t.id,drink:t.order.drink,variant:t.guest.variant,
        text:t.order.drink==='citrus'?'想喝清爽一点的，不要太甜。':t.order.drink==='tea'?'今天有点累，想要一杯温热、不含酒精的。':'想尝尝你们招牌的麦香，推荐哪一款？'});
    }
    if(['waiting','preparing'].includes(t.status)){t.patience-=dt;if(t.patience<=0)leave(s,t,true);}
    if(t.status==='served'){t.eatTimer-=dt;if(t.eatTimer<=0)leave(s,t);}
    if(t.status==='leaving'&&walk(t.guest,dt,100)){t.status='dirty';t.guest=null;t.worker=null;}
  }
  updatePlayer(s,dt);for(const w of s.staff)updateWorker(s,w,dt);
  if(s.elapsed>=DAY_LENGTH)settle(s);
}
export function advance(s,seconds){
  if(s.paused||!Number.isFinite(seconds)||seconds<=0)return s;
  if(s.phase!=='open'){let left=Math.min(seconds,60);while(left>0){const dt=Math.min(.25,left);updatePlayer(s,dt);left-=dt;}return s;}
  let remaining=Math.min(seconds*s.speed,DAY_LENGTH*2);
  while(remaining>.000001&&s.phase==='open'){const dt=Math.min(.25,remaining);tick(s,dt);remaining-=dt;}
  return s;
}
function settle(s){
  if(s.lastSettledDay===s.day)return;
  payCameo(s);finishParty(s);
  cancelPlayer(s);
  const wages=s.staff.reduce((n,w)=>n+staffDefinition(w.id).wage,0);
  const paidWages=Math.min(s.gold,wages);s.gold-=paidWages;s.stats.wages=paidWages;
  s.summary={day:s.day,...s.stats,profit:s.stats.revenue+s.stats.tips-s.stats.purchases-paidWages,reputation:s.reputation};
  s.history.push({...s.summary});s.history=s.history.slice(-14);s.lastSettledDay=s.day;s.phase='closed';s.paused=false;
  for(const w of s.staff){w.job=null;w.path=[];w.chatWith=null;w.socialUntil=0;}
  for(const t of s.tables)t.worker=null;
  emit(s,'day-ended',{summary:s.summary});log(s,'今天打烊了。辛苦，明天也一起开门吧。','success');
}
export function act(s,a){
  const fail=message=>({ok:false,message}),ok=message=>({ok:true,message});
  switch(a.type){
    case 'equip-recipe':{
      if(s.phase!=='ready')return fail('开门前可以更换今夜招牌');
      if(a.id!==null&&(!Object.hasOwn(RECIPES,a.id)||!s.progression.collection.includes(a.id)))return fail('尚未收录这张秘方');
      s.progression.equipped=a.id;return ok(a.id?'今晚招牌已更换':'今晚使用原始配方');
    }
    case 'set-strategy':{
      if(s.phase!=='ready')return fail('开门前可以更换营业路线');if(!Object.hasOwn(STRATEGIES,a.id))return fail('未知营业路线');
      s.progression.strategy=a.id;return ok('今晚营业路线已确定');
    }
    case 'draw-recipe':{
      const p=s.progression;if(p.inspiration<10)return fail('灵感不足，再招待几桌客人吧');
      p.inspiration-=10;const roll=random(s),rarity=p.pity>=4?(roll<.75?'rare':'epic'):(roll<.6?'common':roll<.9?'rare':'epic');
      const pool=Object.values(RECIPES).filter(r=>r.rarity===rarity),recipe=pool[Math.floor(random(s)*pool.length)];
      const duplicate=p.collection.includes(recipe.id);if(duplicate)p.inspiration+=4;else p.collection.push(recipe.id);
      p.draws++;p.pity=rarity==='common'?p.pity+1:0;p.lastDraw={id:recipe.id,duplicate,rarity};
      emit(s,'recipe-drawn',{recipe:{...recipe},duplicate,rarity});log(s,`翻开秘方：${recipe.name}${duplicate?'，重复返还4灵感':''}。`,'success');
      return {ok:true,message:duplicate?'已收录，返还4灵感':'新秘方已收录',recipe:{...recipe},duplicate,rarity};
    }
    case 'move-player':{
      if(!Number.isFinite(a.x)||!Number.isFinite(a.y))return fail('请选择地面');
      releaseInteraction(s);if(s.player.job)s.player.job.suspended=true;if(s.player.carrying)s.player.job.stage='carry';
      s.player.path=aislePath(s.player,{x:a.x,y:a.y});return ok('走到这里');
    }
    case 'interact':{
      const target=targetPoint(s,a.target);if(!target)return fail('这里暂时无法互动');
      if(s.player.carrying&&a.target.kind==='table'&&s.player.carrying.table===a.target.id)return act(s,{type:'player-deliver',table:a.target.id});
      if(s.player.job?.suspended&&a.target.kind==='table'&&s.player.job.table===a.target.id)return act(s,{type:'resume-player'});
      releaseInteraction(s);if(s.player.job)s.player.job.suspended=true;if(s.player.carrying)s.player.job.stage='carry';
      s.player.target={kind:a.target.kind,id:a.target.id};s.player.path=aislePath(s.player,approachPoint(s,a.target));return ok('走近看看');
    }
    case 'end-interaction':releaseInteraction(s);return ok('继续逛逛');
    case 'cancel-player':cancelPlayer(s);return ok('已放回原料，交给伙伴接手');
    case 'resume-player':{
      const p=s.player,j=p.job,t=s.tables.find(t=>t.id===j?.table);if(!j||!t||t.worker!=='player')return fail('当前没有暂停的工作');
      if(p.carrying)return act(s,{type:'player-deliver',table:t.id});
      releaseInteraction(s);j.suspended=false;
      if(j.kind==='order'){j.stage='bar';p.path=aislePath(p,WORLD.bar);}else p.path=aislePath(p,{x:t.x,y:t.y+100});
      return ok('回去继续刚才的工作');
    }
    case 'player-takeover':{
      const t=s.tables.find(t=>t.id===a.table),w=s.staff.find(w=>w.id===t?.worker);
      if(s.phase!=='open'||s.player.job||!w?.job||w.job.kind!=='order'||!['bar','prepare'].includes(w.job.stage))return fail('伙伴已经端上饮品了，下一桌再来帮忙吧');
      releaseInteraction(s);s.player.job={...w.job,stage:'bar',consumed:true};t.worker='player';w.job=null;w.path=[];
      s.player.path=aislePath(s.player,WORLD.bar);return ok('这杯交给你，伙伴去照看其他桌');
    }
    case 'player-work':case 'player-clean':{
      if(s.phase!=='open')return fail('开门后再来服务客人吧');
      if(s.player.job)return fail('先完成或放下手里的工作');
      const t=s.tables.find(t=>t.id===a.table),clean=a.type==='player-clean';
      if(!t||t.worker||t.status!==(clean?'dirty':'waiting'))return fail('这桌已有伙伴照看，或暂时不需要服务');
      if(!clean&&s.stock[t.order.drink]<t.order.quantity)return fail('原料不足，先去补货吧');
      releaseInteraction(s);t.worker='player';
      s.player.job={kind:clean?'clean':'order',table:t.id,stage:clean?'walk':'bar',remaining:clean?4:drinkInfo(s,t.order.drink).brew*(s.upgrades.bar?.75:1),consumed:false,suspended:false};
      if(!clean)t.status='preparing';s.player.path=aislePath(s.player,clean?{x:t.x,y:t.y+100}:WORLD.bar);
      return ok(clean?'走过去收拾桌面':'去吧台亲手调一杯');
    }
    case 'player-deliver':{
      if(!s.player.carrying||s.player.carrying.table!==a.table)return fail('手里没有这桌的饮品');
      const t=s.tables.find(t=>t.id===a.table);if(!t||t.worker!=='player'||t.status!=='preparing')return fail('这桌订单已结束');
      releaseInteraction(s);s.player.job.suspended=false;s.player.job.stage='deliver';s.player.path=aislePath(s.player,{x:t.x,y:t.y+100});return ok('把饮品端给客人');
    }
    case 'open':if(s.phase!=='ready')return fail('已经开门了');if(!Object.values(s.menu).some(Boolean))return fail('至少需要一款在售饮品');s.phase='open';s.paused=false;log(s,'酒馆开门营业，第一位客人很快就到。','success');return ok('开始营业');
    case 'pause':if(s.phase!=='open')return fail('营业中可以暂停');s.paused=!s.paused;return ok(s.paused?'已暂停':'继续营业');
    case 'speed':if(![1,2,3].includes(a.value))return fail('不支持的速度');s.speed=a.value;return ok(`${a.value}倍速`);
    case 'close':if(s.phase!=='open')return fail('当前没有营业');settle(s);return ok('今日已结算');
    case 'next-day':if(s.phase!=='closed')return fail('请先完成今天的营业');s.day++;s.phase='ready';s.elapsed=0;s.summary=null;s.stats=freshStats();s.event=null;s.arrivalIn=3;s.events=[];
      {const fresh=createProgression();for(const key of ['combo','party','cameo','goals'])s.progression[key]=fresh[key];}
      for(const t of s.tables){Object.assign(t,{status:'empty',guest:null,order:null,worker:null,patience:0});}
      s.player=createPlayer();for(const [i,w] of s.staff.entries()){Object.assign(w,{x:i?1060:WORLD.bar.x,y:i?365:WORLD.bar.y,path:[],job:null,priority:null,bubble:'',chatWith:null,socialUntil:0});}
      log(s,`第 ${s.day} 天，新的阳光照进来了。`);return ok('新的一天');
    case 'restock':{
      if(s.phase==='closed')return fail('今日已结算，请迎接新一天后补货');
      const d=DRINKS[a.drink];if(!d)return fail('未知饮品');const capacity=s.upgrades.cellar?40:24;
      const quantity=Math.min(6,capacity-s.stock[d.id]);if(quantity<=0)return fail('已达到储藏上限');const cost=d.cost*quantity;
      if(s.gold<cost)return fail('金币不足');s.gold-=cost;s.stock[d.id]+=quantity;s.stats.purchases+=cost;log(s,`${d.name}补货 ${quantity} 份。`);return ok(`已补货 ${quantity} 份`);
    }
    case 'hire':{
      const def=staffDefinition(a.id);if(!def)return fail('未找到这位伙伴');if(s.staff.some(w=>w.id===a.id))return fail('已经在店里了');
      if(s.gold<def.hireCost)return fail('金币不足');s.gold-=def.hireCost;s.staff.push(createEmployee(a.id,s.staff.length));log(s,`${def.name}加入了酒馆。`,'success');emit(s,'hired',{staff:a.id});return ok(`${def.name}已加入`);
    }
    case 'role':{const w=s.staff.find(w=>w.id===a.staff);if(!w||!['all','bar','floor'].includes(a.role))return fail('无效岗位');w.role=a.role;return ok('岗位已更新');}
    case 'assign':{const w=s.staff.find(w=>w.id===a.staff),t=s.tables.find(t=>t.id===a.table);if(!w||!t||t.status==='empty')return fail('请选择需要服务的桌子');w.priority=t.id;log(s,`${staffDefinition(w.id).name}会优先照看 ${t.id.slice(1)} 桌。`);return ok('已安排优先服务');}
    case 'menu':if(!DRINKS[a.drink])return fail('未知饮品');if(s.menu[a.drink]&&Object.values(s.menu).filter(Boolean).length===1)return fail('至少保留一款在售饮品');s.menu[a.drink]=!s.menu[a.drink];return ok('菜单已更新');
    case 'upgrade':{const u=UPGRADES[a.id];if(!u||s.upgrades[a.id])return fail('已升级或项目无效');if(s.gold<u.cost)return fail('金币不足');s.gold-=u.cost;s.upgrades[a.id]=1;log(s,`${u.name}已升级。`,'success');return ok('升级完成');}
    case 'event':case 'start-party':{
      if(s.phase==='closed')return fail('明天再举办吧');if(s.progression.party.status!=='idle'||s.event)return fail('今天已经安排过派对');
      if(s.phase==='open'&&DAY_LENGTH-s.elapsed<120)return fail('今天剩余时间不足120秒，明天再聚吧');if(s.gold<60)return fail('金币不足');
      const p=s.progression.party;s.gold-=60;s.stats.purchases+=60;s.event='tasting';p.startAt=s.elapsed<=300?300:s.elapsed;p.endsAt=p.startAt+120;p.status='scheduled';
      if(s.phase==='open')updateProgression(s);log(s,'月下派对已安排，活动期间招待3桌可获得12灵感。','success');return ok('月下派对已安排');
    }
    default:return fail('未知操作');
  }
}
