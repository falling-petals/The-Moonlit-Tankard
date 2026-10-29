import {DRINKS} from './content.js';
export function createCellar(){return {casks:[],vintage:[],seq:0,workers:[],production:{batch:null,ready:[],seq:0,lossCarry:0},automation:{enabled:true,budget:150,spent:0,cooldown:0,active:{},rules:Object.fromEntries(Object.keys(DRINKS).map(id=>[id,{enabled:true,low:6,target:12}]))},activity:[],pests:{mice:[],spawnIn:50,seq:0},tom:{hired:false,cooldown:0,caught:0},helperCooldown:0,protectedDay:null};}
const finite=(v,f=0,max=1e9)=>Number.isFinite(v)&&v>=0?Math.min(v,max):f;
export function normalizeCellar(raw={}){
 const c=createCellar();c.seq=finite(raw.seq);c.workers=Array.isArray(raw.workers)?raw.workers.map(w=>({...w,role:'restocker'})):[];
 // Removed inventories and queues remain empty for old consumers; stock lives upstairs.
 const a=raw.automation??{};c.automation.enabled=a.enabled!==false;c.automation.budget=finite(a.budget,150);c.automation.spent=finite(a.spent);c.automation.cooldown=finite(a.cooldown,0,11.2);c.automation.active=Object.fromEntries(Object.keys(DRINKS).map(id=>[id,a.active?.[id]===true]));
 for(const id of Object.keys(DRINKS)){const r=a.rules?.[id];if(r)c.automation.rules[id]={enabled:r.enabled!==false,low:Math.floor(finite(r.low,6,40)),target:Math.floor(finite(r.target,12,40))};const r2=c.automation.rules[id];r2.target=Math.max(r2.low,r2.target);}
 c.activity=(Array.isArray(raw.activity)?raw.activity:[]).filter(v=>v&&['gemini','wenxin'].includes(v.staff)&&DRINKS[v.drink]&&Number.isInteger(v.qty)&&v.qty>0&&v.qty<=6&&Number.isInteger(v.day)&&v.day>=1&&Number.isFinite(v.at)&&v.at>=0&&v.at<=600).slice(-8).map(({staff,drink,qty,day,at})=>({staff,drink,qty,day,at}));
 const pests=raw.pests??{};c.pests={mice:(Array.isArray(pests.mice)?pests.mice:[]).filter(m=>m&&typeof m.id==='string').filter((m,i,a)=>a.findIndex(v=>v.id===m.id)===i).slice(0,4).map(m=>({id:m.id})),spawnIn:finite(pests.spawnIn,50,60),seq:Math.floor(finite(pests.seq))};
 c.tom={hired:raw.tom?.hired===true,cooldown:finite(raw.tom?.cooldown,0,12),caught:Math.floor(finite(raw.tom?.caught))};c.helperCooldown=finite(raw.helperCooldown,0,120);c.helperBusy=finite(raw.helperBusy,0,3);c.protectedDay=Number.isInteger(raw.protectedDay)?raw.protectedDay:null;return c;
}
export function cellarAction(s,a){
 if(!a.type.startsWith('cellar-'))return null;
 const fail=message=>({ok:false,message}),ok=message=>({ok:true,message});
 if(!s.milestones.includes('cellar'))return fail('地窖尚未开放');const c=s.cellar;
 switch(a.type){
 case 'cellar-store':case 'cellar-tap':return fail('库存已统一，楼上可手动补货，雇佣地窖伙伴后可自动补货');
 case 'cellar-policy':{
  if(typeof a.enabled!=='boolean'||!Number.isInteger(a.budget)||a.budget<0||a.budget>1e9||!Number.isInteger(a.low)||!Number.isInteger(a.target)||a.low<0||a.target<a.low||a.target>40)return fail('无效补货设置');
  c.automation.enabled=a.enabled;c.automation.budget=a.budget;
  for(const id of Object.keys(DRINKS)){c.automation.rules[id]={enabled:true,low:a.low,target:a.target};c.automation.active[id]=false;}
  return ok('自动补货设置已更新');
 }

 case 'cellar-auto':if(typeof a.enabled!=='boolean')return fail('无效开关');c.automation.enabled=a.enabled;return ok('自动补货已更新');
 case 'cellar-budget':if(!Number.isFinite(a.value)||a.value<0||a.value>1e9)return fail('无效预算');c.automation.budget=Math.floor(a.value);return ok('预算已更新');
 case 'cellar-rule':if(!DRINKS[a.drink]||typeof a.enabled!=='boolean'||!Number.isInteger(a.low)||!Number.isInteger(a.target)||a.low<0||a.target<a.low||a.target>40)return fail('无效补货规则');c.automation.rules[a.drink]={enabled:a.enabled,low:a.low,target:a.target};return ok('补货规则已更新');
 case 'cellar-hire-tom':if(s.phase==='closed')return fail('请先迎接新一天');if(c.tom.hired)return fail('Tom已经在这里');if(s.gold<900)return fail('金币不足');s.gold-=900;s.stats.purchases+=900;c.tom.hired=true;return ok('Tom加入了地窖');
 case 'cellar-drive':{const i=c.pests.mice.findIndex(m=>m.id===a.id);if(i<0)return fail('老鼠已经离开');c.pests.mice.splice(i,1);return ok('赶走了一只老鼠');}
 default:return fail('未知地窖操作');
 }
}
export function advanceCellar(s,dt,emit=()=>{}){
 if(s.phase!=='open'||s.paused||!s.milestones.includes('cellar')||!Number.isFinite(dt)||dt<=0)return;
 const c=s.cellar,a=c.automation,cap=s.upgrades.cellar?40:24;
 if(c.protectedDay===null)c.protectedDay=s.day;
 const max=s.stars>=4?4:2;c.pests.mice=c.pests.mice.slice(0,max);
 if(s.day>c.protectedDay){c.pests.spawnIn-=dt;if(c.pests.spawnIn<=0){c.pests.spawnIn=50;if(c.pests.mice.length<max){c.pests.mice.push({id:`mouse-${++c.pests.seq}`});emit(s,'cellar-mouse',{});}}}
 c.tom.cooldown=Math.max(0,c.tom.cooldown-dt);c.helperCooldown=Math.max(0,c.helperCooldown-dt);c.helperBusy=Math.max(0,(c.helperBusy??0)-dt);
 if(c.pests.mice.length&&c.tom.hired&&c.tom.cooldown===0){c.pests.mice.shift();c.tom.caught++;c.tom.cooldown=12;emit(s,'tom-caught',{});}
 if(c.pests.mice.length&&c.workers.some(w=>w.id==='gemini')&&c.helperCooldown===0){c.pests.mice.shift();c.helperCooldown=90;c.helperBusy=3;emit(s,'gemini-caught',{staff:'gemini'});}
 // Mice delay the next buying trip; paid inventory is never destroyed.
 a.cooldown=Math.max(0,a.cooldown-dt);
 if(!a.enabled||a.cooldown>1e-9)return;
 const available=c.workers.filter(w=>!(w.id==='gemini'&&c.helperBusy>0));
 if(!available.length)return;
 a.cooldown=8*(1+.1*Math.min(4,c.pests.mice.length));
 for(const worker of available){
  for(const [drink,r] of Object.entries(a.rules)){
   if(!r.enabled||!s.menu[drink]){a.active[drink]=false;continue;}
   const target=Math.min(r.target,cap),total=s.stock[drink];
   if(total<r.low)a.active[drink]=true;
   if(total>=target)a.active[drink]=false;
   if(!a.active[drink])continue;
   const qty=Math.min(6,target-total,Math.floor(Math.min(s.gold,Math.max(0,a.budget-a.spent))/DRINKS[drink].cost));
   if(qty<=0)continue;
   const cost=qty*DRINKS[drink].cost;
   s.gold-=cost;s.stats.purchases+=cost;a.spent+=cost;s.stock[drink]+=qty;worker.completed++;
   if(s.stock[drink]>=target)a.active[drink]=false;
   c.activity.push({staff:worker.id,drink,qty,day:s.day,at:s.elapsed});c.activity=c.activity.slice(-8);
   emit(s,'auto-restocked',{staff:worker.id,drink,amount:qty,cost});break;
  }
 }
}
