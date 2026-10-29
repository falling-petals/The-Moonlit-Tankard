import {SAVE_KEY,publicSave,parseGame} from './storage.js';
import {createGame,act as engineAct} from './engine.js';
import {DRINKS,STAFF,STAR_STEPS} from './content.js';
export const DEBUG_SAVE_KEY=SAVE_KEY+'-debug';
export const debugEnabled=search=>new URLSearchParams(search).get('debug')==='1';
export const debugSaveKey=search=>debugEnabled(search)?DEBUG_SAVE_KEY:SAVE_KEY;
export function initialDebugSave(storage){let raw=storage.getItem(DEBUG_SAVE_KEY);if(!raw){raw=publicSave((()=>{try{return parseGame(storage.getItem(SAVE_KEY));}catch{return createGame();}})());storage.setItem(DEBUG_SAVE_KEY,raw);}return raw;}
const bound=(value,low,high)=>{const n=Number(value);if(!Number.isFinite(n))throw new Error('请输入有效数字');return Math.min(high,Math.max(low,Math.floor(n)));};
// Every debug mutation is allowlisted, bounded, then roundtripped through the real save schema.
export function debugEdit(state,kind,value,drink='ale'){
 const s=parseGame(publicSave(state));
 switch(kind){
 case 'gold':s.gold=bound(value,0,1000000);break;
 case 'inspiration':s.progression.inspiration=bound(value,0,10000);break;
 case 'stock':if(!DRINKS[drink])throw new Error('未知饮品');s.stock[drink]=bound(value,0,s.upgrades.cellar?40:24);s.cellar.vintage=s.cellar.vintage.filter(v=>v.drink!==drink);break;
 case 'stars':{s.stars=bound(value,2,5);s.milestones=STAR_STEPS.filter(v=>v.star<=s.stars).map(v=>v.id);s.reputation=STAR_STEPS.find(v=>v.star===s.stars)?.rep??4.2;s.pendingMilestone=null;break;}
 case 'day':s.day=bound(value,1,999);if(s.phase==='closed'){s.lastSettledDay=s.day;s.summary.day=s.day;}break;
 case 'tables':s.tables.forEach(t=>{t.enabled=true;});break;
 case 'team':{const phase=s.phase;s.phase='ready';s.gold=1000000;s.stars=5;s.reputation=5;s.milestones=STAR_STEPS.map(v=>v.id);for(const d of STAFF)if(![...s.staff,...s.cellar.workers].some(w=>w.id===d.id))engineAct(s,{type:'hire',id:d.id});s.phase=phase;break;}
 case 'mice':{const n=bound(value,0,s.stars>=4?4:2);s.cellar.pests.mice=Array.from({length:n},()=>({id:'mouse-'+(++s.cellar.pests.seq)}));break;}
 case 'tom':s.cellar.tom.hired=!!value;break;
 case 'restock-test':{if(!DRINKS[drink])throw new Error('未知饮品');s.stock[drink]=0;s.menu[drink]=true;s.cellar.automation.enabled=true;s.cellar.automation.cooldown=0;s.cellar.automation.rules[drink]={enabled:true,low:6,target:12};s.cellar.automation.active[drink]=false;break;}
 default:throw new Error('未知调整');
 }
 return parseGame(publicSave(s));
}
export function createDebugUI({getState,replace,abort,save,act,advance}){
 const snapshot=publicSave(getState()),host=document.createElement('div');host.id='debug-root';document.body.append(host);
 const button=document.createElement('button');button.className='debug-wrench hud-glass';button.textContent='⚒';button.title='调试工作台';button.setAttribute('aria-label','打开调试工作台');document.body.append(button);
 const field=(label,key,value,min,max)=>`<label>${label}<input type="number" data-debug-value="${key}" value="${value}" min="${min}" max="${max}"><button data-debug="${key}">设置</button></label>`;
 function render(){const s=getState();host.innerHTML=`<div class="debug-backdrop"><section class="debug-panel" role="dialog" aria-label="调试工作台"><header><h2>调试工作台</h2><button data-debug="close">×</button></header><p>独立测试存档 · 正常经营进度不会改变</p><div class="debug-fields">${field('金币','gold',s.gold,0,1000000)}${field('灵感','inspiration',s.progression.inspiration,0,10000)}${field('星级','stars',s.stars,2,5)}${field('天数','day',s.day,1,999)}<label>饮品<select id="debug-drink">${Object.values(DRINKS).map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select></label>${field('库存','stock',12,0,40)}${field('老鼠','mice',s.cellar.pests.mice.length,0,4)}</div><div class="debug-actions"><button data-debug="tables">开放六桌</button><button data-debug="team">完整七人队伍</button><button data-debug="tom">${s.cellar.tom.hired?'撤下 Tom':'安排 Tom'}</button><button data-debug="restock-test">清空所选库存 / 测试补货</button><button data-debug="pause">暂停 / 继续</button><button data-debug="open">开门</button><button data-debug="advance">前进 10 秒</button><button data-debug="restore">恢复进入时快照</button><button data-debug="reset">空白测试存档</button></div><output id="debug-result" role="status"></output><pre id="debug-watch"></pre></section></div>`;watch();}
 function watch(){const node=host.querySelector('#debug-watch');if(!node)return;const s=getState();node.textContent=JSON.stringify({phase:s.phase,paused:s.paused,day:s.day,elapsed:Math.round(s.elapsed),crew:[...s.staff,...s.cellar.workers].map(w=>({id:w.id,role:w.role,job:w.job?.stage})),restocking:s.cellar.activity,budget:s.cellar.automation,mice:s.cellar.pests.mice.length,tom:s.cellar.tom},null,2);}
 button.onclick=()=>{abort();render();};
 host.addEventListener('click',event=>{const kind=event.target.closest('[data-debug]')?.dataset.debug;if(!kind)return;try{if(kind==='close'){host.innerHTML='';return;}abort();let result=null;if(kind==='restore')replace(parseGame(snapshot));else if(kind==='reset')replace(createGame());else if(kind==='pause'||kind==='open')result=act({type:kind});else if(kind==='advance'){const paused=getState().paused;getState().paused=false;for(let i=0;i<40;i++)advance(.25);getState().paused=paused;save();}else replace(debugEdit(getState(),kind,kind==='tom'?!getState().cellar.tom.hired:host.querySelector(`[data-debug-value="${kind}"]`)?.value,host.querySelector('#debug-drink').value));const output=host.querySelector('#debug-result');output.textContent=result?.message||'已应用';output.classList.toggle('debug-error',result?.ok===false);watch();}catch(error){host.querySelector('#debug-result').textContent=error.message;}});
 setInterval(watch,500);return {close:()=>{host.innerHTML='';}};
}
