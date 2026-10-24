import {createGame,advance,act,STATIONS} from './engine.js';
import {DRINKS,ROLE_NAMES,staffDefinition,gameClock,DAY_LENGTH,TABLE_COSTS,REQUESTS} from './content.js';
import {loadGame,parseGame,publicSave,SAVE_KEY} from './storage.js';
import {DEFAULT_CONFIG,consumeBootstrap} from './ai.js';
import {createInteractions} from './interactions.js';
import {createRenderer} from './render.js';
import {createAudio} from './audio.js';
import {RECIPES,STRATEGIES,drinkInfo} from './progression.js';
import {recipesView,nightView,drawReveal,liveProgress,drinksView} from './party-views.js';
import * as view from './views.js';
const $=selector=>document.querySelector(selector);
const read=(storage,key)=>{try{return storage.getItem(key);}catch{return null;}};
const parse=raw=>{try{return JSON.parse(raw)||{};}catch{return {};}};
const write=(storage,key,value)=>{try{storage.setItem(key,value);return true;}catch{return false;}};
let state=loadGame(read(localStorage,SAVE_KEY));
let config={...DEFAULT_CONFIG,...parse(read(localStorage,'moonlit-preferences')),...parse(read(sessionStorage,'moonlit-ai-session'))};
const bootstrap=consumeBootstrap(location,history);if(bootstrap)config={...config,...bootstrap};
write(sessionStorage,'moonlit-ai-session',JSON.stringify(config));
let renderer=null,modalState=null,lighting='auto',toastTimer=null,summaryShown=0,shownInteraction='',hotspotSignature='',pendingVisit=null,panelStamp='',bannerTimer=null;
const audio=createAudio();audio.setMuted(read(localStorage,'moonlit-muted')==='1');
const seenEvents=new Set(state.events.map(e=>e.id));
const panelStations={menu:'ledger',recipes:'ledger',night:'events',staff:'hire',stock:'inventory',upgrade:'upgrades',events:'events'};
const stationPanels={ledger:'menu',inventory:'stock',hire:'staff',upgrades:'upgrade',events:'night'};
const stationLabels={ledger:'饮品菜单',hire:'寻找伙伴',inventory:'原料柜',upgrades:'布置手册',events:'活动手记'};
function save(){const ok=write(localStorage,SAVE_KEY,publicSave(state));$('#save-state').textContent=ok?'进度已自动保存':'请导出存档保留进度';return ok;}
function toast(text,error=false){const el=$('#toast');el.textContent=text;el.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
const ai=createInteractions({getState:()=>state,getConfig:()=>config,onUpdate:()=>{renderAI();refreshChat();if(!ai.status.busy)save();},onError:message=>toast(message,true)});
function renderAI(){const s=ai.status;$('#ai-dot').className='status-dot'+(s.busy?' busy':s.error?' error':!config.key?' offline':'');$('#ai-status').textContent=s.busy?`${staffDefinition(s.staff)?.name||'伙伴'}正在回应…`:s.error?'连接暂不可用':s.connected?'伙伴已连接':config.key?'伙伴已就绪':'连接AI伙伴';}
function refreshChat(){
  if(modalState?.panel!=='chat')return;const w=state.staff.find(w=>w.id===modalState.id);if(!w||!$('#dialogue-reply'))return;
  const last=w.conversation.filter(m=>m.role==='staff'&&(!m.kind||m.kind==='player')).at(-1);
  const replying=ai.status.busy&&ai.status.staff===w.id&&ai.status.lastKind==='player';
  $('#dialogue-reply').textContent=replying?(ai.status.partial||'…'):last?.text||staffDefinition(w.id).greeting;
  $('#dialogue-reply').classList.toggle('dialogue-reply-stream',replying);
  $('#chat-send').disabled=(ai.status.busy&&['player','test'].includes(ai.status.lastKind))||!config.key;
  $('#chat-hint').textContent=!config.key?'在设置中连接 AI 伙伴。':replying?'正在回应…':ai.status.error||'';$('#chat-hint').hidden=!$('#chat-hint').textContent;
  const memories=$('#dialogue-memories');if(memories)memories.innerHTML=view.memoriesView(w);
  const suggestion=$('#dialogue-suggestion');
  if(suggestion)suggestion.innerHTML=!replying&&w.suggestion?`<button class="suggestion-button" data-action="accept-suggestion" data-suggestion="${view.esc(w.suggestion)}">${({party:'一起筹备派对 ↗',tasting:'一起筹备派对 ↗',recipe:'看看适合今晚的秘方 ↗',quick:'看看快饮经营路线 ↗',premium:'看看精品经营路线 ↗'})[w.suggestion]||'看看今晚的安排 ↗'}</button>`:'';
}
function closeModal({release=true}={}){
  if(release&&modalState?.panel==='chat'&&ai.status.busy&&ai.status.lastKind==='player')ai.abort();
  $('#modal-root').innerHTML='';$('#dialogue-root').innerHTML='';modalState=null;if(release){act(state,{type:'end-interaction'});shownInteraction='';}
}
function openChat(id){
  const w=state.staff.find(w=>w.id===id),d=staffDefinition(id);if(!w)return;closeModal({release:false});w.chatWith='player';modalState={panel:'chat',id};
  $('#dialogue-root').innerHTML=`<section class="dialogue-box context-card" role="dialog" aria-label="和${d.name}聊聊"><header class="context-header"><div class="dialogue-avatar">${view.art('staff-atlas',d.column,32)}</div><div class="dialogue-name">${d.name}<small>${d.skill}</small></div><button class="close-button" data-action="close-modal" aria-label="结束交谈">×</button></header><p id="dialogue-reply"></p><div class="dialogue-choices"><button data-action="quick-chat" data-message="今天的工作感觉怎么样？">聊聊今天</button><button data-action="quick-chat" data-message="今晚有什么小活动的灵感？">今晚的安排</button></div><form id="chat-form"><textarea id="chat-input" rows="1" maxlength="500" aria-label="给伙伴的话" placeholder="跟${d.name}说句话…"></textarea><button id="chat-send" class="primary-button" type="submit">发送</button></form><div id="chat-hint" class="chat-hint"></div><div id="dialogue-suggestion"></div><details class="dialogue-details"><summary>记忆与分工</summary><label>岗位 <select id="staff-role" data-staff="${id}" aria-label="${d.name}的岗位">${Object.entries(ROLE_NAMES).map(([key,name])=>`<option value="${key}" ${w.role===key?'selected':''}>${name}</option>`).join('')}</select></label><div id="dialogue-memories"></div></details></section>`;
  renderer?.paint($('#dialogue-root'));refreshChat();positionContext();save();
}
function tablePanel(id){
  const t=state.tables.find(t=>t.id===id);if(!t||t.enabled===false)return '';
  const p=state.player,worker=state.staff.find(w=>w.id===t.worker),request=t.request&&REQUESTS[t.request.id];
  const button=(action,label,disabled=false)=>`<button class="primary-button" data-action="${action}" data-table="${id}" ${disabled?'disabled':''}>${label}</button>`;
  let controls='';
  if(p.carrying?.table===id)controls=button('player-deliver','送给客人');
  else if(p.job?.suspended&&p.job.table===id)controls=button('resume-player','继续手头工作');
  else if(t.request&&!t.request.fulfilled&&!t.order?.ready&&['arriving','waiting','preparing'].includes(t.status))controls=button('fulfill-request','按要求调整');
  else if(t.status==='ready')controls=button('player-pickup','我来取餐',!!p.job);
  else if(t.status==='waiting')controls=button('player-work','我来制作',!!p.job);
  else if(t.status==='dirty')controls=button('player-clean','收拾桌面',!!p.job||!!t.worker);
  else if(worker&&['bar','prepare'].includes(worker.job?.stage))controls=button('player-takeover','我来接手',!!p.job);
  const title=t.status==='dirty'?'收拾一下':request&&!t.request.fulfilled?'客人的特别要求':t.status==='served'?'慢慢享用':'照看客人';
  return `<section class="context-card guest-card" role="dialog" aria-label="${title}"><header class="context-header"><span class="context-emblem">${view.icon(t.status==='dirty'?'leaf':'cup')}</span><strong>${title}</strong><button class="close-button" data-action="close-modal" aria-label="关闭">×</button></header>${t.order?`<div class="guest-order">${view.art('drinks-atlas',DRINKS[t.order.drink].artFrame,42)}<div><b>${view.esc(drinkInfo(state,t.order.drink).name)} × ${t.order.quantity}</b><small>${t.order.paid?'已经送达':t.status==='ready'?'出餐台已备好':worker?staffDefinition(worker.id).name+'正在照看':'等待制作'}</small></div></div>`:'<p class="guest-copy">清理杯子，为下一位客人留座。</p>'}${request?`<p class="request-detail"><b>${t.request.fulfilled?'✓ 已回应 · ':''}${view.esc(request.name)}</b><span>${view.esc(request.description)}</span></p>`:''}${['waiting','preparing','ready'].includes(t.status)?`<div class="patience-detail"><span>耐心</span><strong>${Math.max(0,Math.ceil(t.patience))}s</strong><progress max="${t.patienceMax||115}" value="${Math.max(0,t.patience)}"></progress></div>`:''}<div class="table-actions">${controls}</div></section>`;
}
function positionContext(){
  if(!renderer||!['chat','table'].includes(modalState?.panel))return;
  let anchor;
  if(modalState.panel==='chat'){const w=state.staff.find(w=>w.id===modalState.id);if(w)anchor={x:w.x,y:w.y-65};}
  else {const t=state.tables.find(t=>t.id===modalState.id);if(t)anchor=t.guest?{x:t.guest.x,y:t.guest.y-70}:{x:t.x+95,y:t.y+82};}
  if(!anchor)return;const root=$('#dialogue-root'),point=renderer.project(anchor),width=root.offsetWidth||320,height=root.offsetHeight||220;
  const right=point.x+45+width<innerWidth-16,left=right?point.x+45:point.x-width-45;
  root.style.left=Math.max(12,Math.min(innerWidth-width-12,left))+'px';root.style.top=Math.max(110,Math.min(innerHeight-height-96,point.y-35))+'px';
  root.classList.toggle('tail-right',!right);
}
function openPanel(panel,id=null){
  if(panel==='chat'){openChat(id);return;}if(modalState?.panel==='chat')closeModal();closeModal({release:false});modalState={panel,id};
  const views={menu:drinksView,recipes:recipesView,night:nightView,stock:view.stockView,staff:view.staffView,upgrade:view.upgradeView,events:view.eventsView,summary:view.summaryView};let html=views[panel]?.(state)||'';
  if(panel==='settings')html=view.settingsView(config,ai.status);if(panel==='table')html=tablePanel(id);
  if(panel==='close')html=view.modal({title:'今天，先到这里吗？',subtitle:'未完成的订单会结束，库存留到明天。',body:`<p class="muted">今天招待了 ${state.stats.served} 桌，收入 ${state.stats.revenue+state.stats.tips} G。</p>`,footer:'<button class="text-button" data-action="close-modal">再忙一会儿</button><button class="primary-button" data-action="confirm-close">确认打烊</button>'});
  if(panel==='reset')html=view.modal({title:'从第一杯重新开始？',subtitle:'将覆盖这台设备的经营进度。',body:'<p class="muted">可以先导出存档留念。</p>',footer:'<button class="outline-button" data-action="export">导出存档</button><button class="primary-button" data-action="reset">确认重新开始</button>'});
  if(panel==='table'){$('#dialogue-root').innerHTML=html;renderer?.paint($('#dialogue-root'));positionContext();panelStamp=progressPanelStamp();return;}
  $('#modal-root').innerHTML=html;const sheet=$('#modal-root .modal');if(sheet)sheet.dataset.panel=panel;
  if(['menu','recipes','staff','stock','upgrade','night'].includes(panel))$('#modal-root .modal-header').insertAdjacentHTML('afterend',`<nav class="modal-tabs" aria-label="管理分类">${Object.entries({menu:'菜单',recipes:'秘方',staff:'伙伴',stock:'原料',upgrade:'扩建',night:'今夜'}).map(([id,label])=>`<button data-action="visit" data-panel="${id}" class="${panel===id?'active':''}">${label}</button>`).join('')}</nav>`);
  renderer?.paint($('#modal-root'));if(panel==='settings')$('#api-key').value=config.key||'';panelStamp=progressPanelStamp();
}
function perform(action,{refresh=true,notify=true}={}){
  const result=act(state,action);if(notify)toast(result.message,!result.ok);save();
  if(refresh&&result.ok&&modalState&&!['chat','settings','summary','close'].includes(modalState.panel)){const {panel,id}=modalState;openPanel(panel,id);}renderUI();return result;
}
function visit(panel){openPanel(panel);}
function approach(target,desiredPanel=null){
  closeModal();pendingVisit=desiredPanel;
  if(target.kind==='table'){
    if(state.player.carrying?.table===target.id){perform({type:'player-deliver',table:target.id},{notify:false,refresh:false});return;}
    if(state.player.job?.suspended&&state.player.job.table===target.id){perform({type:'resume-player'},{notify:false,refresh:false});return;}
    openPanel('table',target.id);return;
  }
  perform({type:'interact',target},{notify:false,refresh:false});
}
function progressPanelStamp(){
  if(modalState?.panel==='table'){
    const t=state.tables.find(t=>t.id===modalState.id);return JSON.stringify([modalState.id,t?.status,t?.worker,t?.order?.paid,t?.request,t?.enabled,Math.ceil(t?.patience||0),state.player.job?.suspended]);
  }
  if(['stock','menu'].includes(modalState?.panel))return JSON.stringify([modalState.panel,state.stock,state.menu,state.gold,state.phase,state.tables.map(t=>[t.id,t.status,t.order?.drink])]);
  if(!['recipes','night'].includes(modalState?.panel))return '';
  const p=state.progression;return JSON.stringify([modalState.panel,p.inspiration,p.collection,p.equipped,p.strategy,p.party,p.goals,p.combo.rewarded,p.combo.best,state.gold,state.stats.served,state.phase,p.party.status==='active'?Math.floor(state.elapsed):0]);
}
function renderProgress(){
  const p=state.progression,c=p.combo,st=STRATEGIES[p.strategy];
  $('#inspiration').textContent=p.inspiration;$('#combo-count').textContent=c.count;
  const badge=$('#combo-hud');if(badge.dataset.count!==String(c.count)){if(c.count){badge.classList.remove('combo-pop');void badge.offsetWidth;badge.classList.add('combo-pop');}badge.dataset.count=String(c.count);}badge.dataset.tier=String(c.tier);
  $('#combo-hud').classList.toggle('hot',c.count>=6);$('#combo-hud').classList.toggle('zero',!c.count);
  $('#combo-effect').textContent=c.count>=10?'收益 +35%':c.count>=6?'收益 +20%':c.count>=3?'收益 +10%':c.count?'继续连上下一单':'';
  $('#combo-time').style.width=Math.max(0,Math.min(100,(c.expiresAt-state.elapsed)/55*100))+'%';
  $('#strategy-label').textContent=`今晚 · ${st.name}`;$('#night-caption').textContent=state.phase==='ready'?'开门前选路线，营业时冲连击':`最高 ${c.best} 连击 · 今日招待 ${state.stats.served} 桌`;
  $('#live-event').innerHTML=liveProgress(state);$('#night-status').hidden=!$('#live-event').textContent.trim();
  $('#sound-toggle').classList.toggle('muted',audio.muted);$('#sound-toggle').setAttribute('aria-label',audio.muted?'开启音效':'关闭音效');
  for(const e of state.events){
    if(seenEvents.has(e.id))continue;seenEvents.add(e.id);
    const messages={'cameo-started':['黄仁勋来了 · 全场买单','接下来一分钟，饮品账单交给这位客人。'],'cameo-paid':['全场账单已结清',`+${e.amount||0} G · 谢谢这位慷慨的客人！`],'party-started':['月下派对 · 开始了','灯光亮起，和伙伴一起迎接这一波客人。'],'party-complete':['这一场，收好热闹',p.party.rewarded?'完成派对目标 · +12 灵感':'下次一起招待更多客人吧。'],'combo-tier':[(e.count||e.tier||c.count)+' COMBO · 越忙越带劲','连续满意服务，口碑正在传开。']};
    if(messages[e.type]){const [title,caption]=messages[e.type];$('#event-banner').innerHTML=view.esc(title)+`<small>${view.esc(caption)}</small>`;$('#event-banner').classList.add('show');clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('#event-banner').classList.remove('show'),4800);}
  }
  if(seenEvents.size>500){seenEvents.clear();for(const e of state.events)seenEvents.add(e.id);}
  if(modalState?.panel==='table'){
    const table=state.tables.find(t=>t.id===modalState.id);
    if(!table||['leaving','empty'].includes(table.status))closeModal();
  }
  const stamp=progressPanelStamp();if(stamp&&stamp!==panelStamp){const scroll=$('#modal-root .modal-content')?.scrollTop||0,{panel,id}=modalState;openPanel(panel,id);const body=$('#modal-root .modal-content');if(body)body.scrollTop=scroll;}
}
function renderUI(){
  $('#gold').textContent=state.gold.toLocaleString('zh-CN');$('#reputation').textContent=state.reputation.toFixed(2);$('#day').textContent=String(state.day).padStart(2,'0');
  $('#clock').textContent=gameClock(state.elapsed);$('#clock-caption').textContent=state.phase==='ready'?'准备营业':state.phase==='closed'?'今日已打烊':state.paused?'暂停片刻':'营业中';$('#day-progress').style.width=state.elapsed/DAY_LENGTH*100+'%';
  const night=lighting==='night'||(lighting==='auto'&&state.elapsed>290);$('#phase-label').textContent=state.phase==='ready'?'准备开门':state.phase==='closed'?'今日打烊':state.paused?'暂停片刻':night?'雨夜营业':'午后营业';
  $('#weather').textContent=night?'雨 · 微凉':'晴 · 暖阳';$('#lighting-label').textContent=lighting==='auto'?'自然光':lighting==='day'?'日景':'夜景';$('#lighting-button [data-icon]').innerHTML=view.icon(night?'moon':'sun');
  $('#pause').disabled=state.phase!=='open';$('#pause').innerHTML=view.icon(state.paused?'play':'pause');$('#pause').setAttribute('aria-label',state.paused?'继续营业':'暂停营业');
  document.querySelectorAll('[data-action="speed"]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.speed)===state.speed));
  $('#business-button').innerHTML=view.icon(state.phase==='ready'?'door':state.phase==='closed'?'book':'moon')+`<span>${state.phase==='ready'?'开门营业':state.phase==='closed'?'今日账本':'打烊结算'}</span>`;$('#latest-log').textContent=state.logs.at(-1)?.text||'';
  const p=state.player,j=p.job;$('.player-card').hidden=!j&&!p.carrying;$('#player-status').textContent=p.interaction?.kind==='staff'?'店长 · 和伙伴聊聊':j?.kind==='clean'?'店长 · 正在收桌':j?.stage==='prepare'?'店长 · 正在调饮':p.path.length?'店长 · 走在店里':'店长 · 就在这里';
  $('#player-task').textContent=j?.stage==='prepare'?`用心调一杯，还需 ${Math.max(0,Math.ceil(j.remaining))} 秒`:j?.stage==='pickup'?'走到出餐台，取走已经做好的饮品':j?.stage==='bar'?'走到吧台，准备这桌的饮品':j?.stage==='deliver'?'把饮品送到客人面前':p.target?'走近后就可以互动':p.carrying?'点击对应顾客，把饮品送过去':'点击地面走动，点击人物互动';
  if(j?.suspended){$('#player-status').textContent='店长 · 工作暂放在原处';$('#player-task').textContent='进度和原料留着，随时回去继续。';}
  $('#carry-status').innerHTML=p.carrying?`端着 ${drinkInfo(state,p.carrying.drink).name} × ${p.carrying.quantity} <button data-action="cancel-player">交还伙伴</button>`:j?`照看 ${j.table.slice(1)} 号桌 ${j.suspended?'<button data-action="resume-player">继续工作</button>':''}<button data-action="cancel-player">交还伙伴</button>`:'双手空着 · 随时帮把手';
  const interaction=p.interaction,key=interaction?interaction.kind+':'+interaction.id:'';
  if(key&&key!==shownInteraction){shownInteraction=key;if(interaction.kind==='staff')openChat(interaction.id);else if(interaction.kind==='table')openPanel('table',interaction.id);else {const panel=pendingVisit||stationPanels[interaction.id];pendingVisit=null;openPanel(panel);}}if(!key)shownInteraction='';
  $('#walk-hint').hidden=state.elapsed>25||!!p.path.length||!!modalState;renderAI();refreshChat();renderProgress();audio.update(state);
  if(state.phase==='closed'&&state.summary&&summaryShown!==state.day){summaryShown=state.day;openPanel('summary');save();}
}
function renderHotspots(){
  // The scene itself provides hit targets; contextual hints belong on hover.
  if($('#hotspots').childElementCount)$('#hotspots').innerHTML='';positionContext();
}
function settingsFromForm(){
  const baseUrl=$('#api-base').value.trim().replace(/\/+$/,''),model=$('#api-model').value.trim(),key=$('#api-key').value.trim();try{const u=new URL(baseUrl);if(u.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(u.hostname))throw new Error();}catch{toast('请输入有效的 HTTPS 模型地址。',true);return null;}if(!model){toast('请填写模型名称。',true);return null;}return {baseUrl,model,key,auto:$('#auto-ai').checked};
}
function storeConfig(next){config=next;write(sessionStorage,'moonlit-ai-session',JSON.stringify(config));write(localStorage,'moonlit-preferences',JSON.stringify({baseUrl:config.baseUrl,model:config.model,auto:config.auto}));ai.status.error='';ai.status.connected=false;renderAI();}
async function sendChat(text){
  const id=modalState?.id;if(modalState?.panel!=='chat'||!text.trim())return;
  if(ai.status.busy&&['player','test'].includes(ai.status.lastKind)){toast('等伙伴把这句话说完吧。');return;}if(!config.key){toast('先在右上角连接伙伴吧。',true);return;}
  const message=text.trim().slice(0,500);$('#chat-input').value='';
  const match=message.match(/^(?:请|麻烦你|麻烦)?\s*(?:优先|先)(?:帮我)?(?:照看|服务|处理)?\s*([1-6一二三四五六])(?:号)?桌/);
  if(match){const n=({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6})[match[1]]||Number(match[1]);perform({type:'assign',staff:id,table:`t${n}`},{refresh:false,notify:false});}
  await ai.ask(id,message);refreshChat();save();
}
function exportSave(){const blob=new Blob([publicSave(state)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`月下酒馆-第${state.day}天.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('存档已导出。');}
async function clickAction(button){const d=button.dataset;switch(d.action){
  case 'visit':visit(d.panel);return;
  case 'panel':if(d.panel==='settings')openPanel('settings');else visit(d.panel);return;
  case 'world-target':approach({kind:d.kind,id:d.id});return;
  case 'close-modal':case 'continue-work':closeModal();save();renderUI();return;
  case 'business':if(state.phase==='ready')perform({type:'open'},{refresh:false});else openPanel(state.phase==='closed'?'summary':'close');return;
  case 'confirm-close':perform({type:'close'},{refresh:false});openPanel('summary');return;
  case 'pause':case 'speed':perform({type:d.action,value:Number(d.speed)},{refresh:false,notify:false});return;
  case 'lighting':lighting=lighting==='auto'?'night':lighting==='night'?'day':'auto';renderUI();return;
  case 'menu-toggle':perform({type:'menu',drink:d.drink});return;
  case 'restock':perform({type:'restock',drink:d.drink});return;
  case 'hire':perform({type:'hire',id:d.staff});return;
  case 'upgrade':perform({type:'upgrade',id:d.upgrade});return;
  case 'start-event':perform({type:'event'});return;
  case 'start-party':perform({type:'start-party'});return;
  case 'draw-recipe':{const result=perform({type:'draw-recipe'});if(result.ok){$('#draw-root').innerHTML=drawReveal(result);renderer?.paint($('#draw-root'));}return;}
  case 'equip-recipe':perform({type:'equip-recipe',id:d.recipe});return;
  case 'set-strategy':perform({type:'set-strategy',id:d.strategy});return;
  case 'close-draw':$('#draw-root').innerHTML='';return;
  case 'sound':audio.setMuted(!audio.muted);write(localStorage,'moonlit-muted',audio.muted?'1':'0');renderUI();return;
  case 'accept-suggestion':visit(d.suggestion==='recipe'?'recipes':'night');return;
  case 'chat':approach({kind:'staff',id:d.staff});return;
  case 'assign':if(state.player.job?.table===d.table)act(state,{type:'cancel-player'});perform({type:'assign',staff:d.staff,table:d.table});return;
  case 'expand-table':perform({type:'expand-table'});return;
  case 'fire-staff':perform({type:'fire-staff',id:d.staff});hotspotSignature='';return;
  case 'fulfill-request':perform({type:'fulfill-request',table:d.table});return;
  case 'player-pickup':case 'player-work':case 'player-clean':case 'player-deliver':case 'player-takeover':{const r=perform({type:d.action,table:d.table},{refresh:false});if(r.ok)closeModal({release:false});return;}
  case 'resume-player':{const r=perform({type:'resume-player'},{refresh:false});if(r.ok)closeModal({release:false});return;}
  case 'cancel-player':perform({type:d.action},{refresh:false});closeModal();return;
  case 'quick-chat':await sendChat(d.message);return;
  case 'next-day':perform({type:'next-day'},{refresh:false});lighting='auto';closeModal();return;
  case 'save-settings':{const next=settingsFromForm();if(next){storeConfig(next);$('#connection-result').textContent='连接设置已保存。';toast('设置已保存。');}return;}
  case 'test-connection':{if(ai.status.busy){toast('伙伴正在回应，稍等片刻。');return;}const next=settingsFromForm();if(!next)return;storeConfig(next);const el=$('#connection-result');el.textContent='正在请求真实模型…';button.disabled=true;const ok=await ai.ask(state.staff[0].id,'请用一句简短中文向人类店主问好，无需记忆。','test');if(el.isConnected){el.textContent=ok?'连接成功 · '+ai.status.lastReply:ai.status.error;el.className='connection-result'+(ok?'':' error');button.disabled=false;}return;}
  case 'export':exportSave();return;
  case 'import':$('#import-file').click();return;
  case 'reset-confirm':openPanel('reset');return;
  case 'reset':ai.abort();state=createGame();summaryShown=0;lighting='auto';shownInteraction='';hotspotSignature='';seenEvents.clear();$('#draw-root').innerHTML='';closeModal();save();renderUI();return;
}}
document.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(b&&!b.disabled)void clickAction(b).catch(()=>toast('操作未完成，请重试。',true));});
document.addEventListener('click',event=>{if(event.target.classList.contains('modal-backdrop'))closeModal();});
document.addEventListener('pointerdown',()=>{void audio.unlock();},{passive:true});
document.addEventListener('submit',event=>{if(event.target.id==='chat-form'){event.preventDefault();void sendChat($('#chat-input').value);}if(event.target.id==='settings-form')event.preventDefault();});
document.addEventListener('change',event=>{if(event.target.matches('[data-staff-role],#staff-role')){perform({type:'role',staff:event.target.dataset.staff,role:event.target.value},{refresh:false});const worker=state.staff.find(w=>w.id===event.target.dataset.staff);if(worker)event.target.value=worker.role;}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal();$('#draw-root').innerHTML='';}if(event.target.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendChat(event.target.value);}});
$('#import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw new Error();const next=parseGame(await file.text());ai.abort();state=next;summaryShown=0;shownInteraction='';hotspotSignature='';closeModal();save();renderUI();toast('存档已恢复。');}catch{toast('存档无效，现有进度已保留。',true);}finally{event.target.value='';}});
$('#world').addEventListener('click',event=>{if(!renderer)return;const hit=renderer.hitTest(event.clientX,event.clientY);if(!hit)return;if(hit.type==='ground'){closeModal();perform({type:'move-player',x:hit.x,y:hit.y},{refresh:false,notify:false});}else if(['guest','service'].includes(hit.type))approach({kind:'table',id:hit.id});else approach({kind:hit.type,id:hit.id});});
view.fillIcons();renderUI();save();
try{renderer=await createRenderer($('#world'));$('#loading').remove();renderer.paint();renderUI();let previous=performance.now(),lastDraw=0,lastUI=0,lastSave=0,lastAI=0;
  function loop(time){const dt=Math.min(.25,Math.max(0,(time-previous)/1000));previous=time;advance(state,dt);if(time-lastDraw>30){renderer.draw(state,time,lighting);renderHotspots();lastDraw=time;}if(time-lastUI>200){renderUI();lastUI=time;}if(time-lastSave>2000){save();lastSave=time;}if(time-lastAI>750){ai.tick();lastAI=time;}requestAnimationFrame(loop);}
  document.addEventListener('visibilitychange',()=>{previous=performance.now();save();});requestAnimationFrame(loop);
}catch{const loading=$('#loading');if(loading)loading.innerHTML='<div class="error-panel">场景资源未能载入。请使用 start.cmd 启动，再刷新页面。</div>';toast('美术资源读取失败。',true);}
window.addEventListener('pagehide',save);
