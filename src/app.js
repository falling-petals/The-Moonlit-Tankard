import {createGame,advance,act,STATIONS} from './engine.js';
import {DRINKS,ROLE_NAMES,staffDefinition,gameClock,DAY_LENGTH} from './content.js';
import {loadGame,parseGame,publicSave,SAVE_KEY} from './storage.js';
import {DEFAULT_CONFIG,consumeBootstrap} from './ai.js';
import {createInteractions} from './interactions.js';
import {createRenderer} from './render.js';
import * as view from './views.js';
const $=selector=>document.querySelector(selector);
const read=(storage,key)=>{try{return storage.getItem(key);}catch{return null;}};
const parse=raw=>{try{return JSON.parse(raw)||{};}catch{return {};}};
const write=(storage,key,value)=>{try{storage.setItem(key,value);return true;}catch{return false;}};
let state=loadGame(read(localStorage,SAVE_KEY));
let config={...DEFAULT_CONFIG,...parse(read(localStorage,'moonlit-preferences')),...parse(read(sessionStorage,'moonlit-ai-session'))};
const bootstrap=consumeBootstrap(location,history);if(bootstrap)config={...config,...bootstrap};
write(sessionStorage,'moonlit-ai-session',JSON.stringify(config));
let renderer=null,modalState=null,lighting='auto',toastTimer=null,summaryShown=0,shownInteraction='',hotspotSignature='';
const panelStations={menu:'ledger',staff:'hire',stock:'inventory',upgrade:'upgrades',events:'events'};
const stationPanels=Object.fromEntries(Object.entries(panelStations).map(([p,s])=>[s,p]));
const stationLabels={ledger:'饮品菜单',hire:'寻找伙伴',inventory:'原料柜',upgrades:'布置手册',events:'活动手记'};
function save(){const ok=write(localStorage,SAVE_KEY,publicSave(state));$('#save-state').textContent=ok?'进度已自动保存':'请导出存档保留进度';return ok;}
function toast(text,error=false){const el=$('#toast');el.textContent=text;el.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
const ai=createInteractions({getState:()=>state,getConfig:()=>config,onUpdate:()=>{renderAI();refreshChat();save();},onError:message=>toast(message,true)});
function renderAI(){const s=ai.status;$('#ai-dot').className='status-dot'+(s.busy?' busy':s.error?' error':!config.key?' offline':'');$('#ai-status').textContent=s.busy?`${staffDefinition(s.staff)?.name||'伙伴'}正在回应…`:s.error?'连接暂不可用':s.connected?'伙伴已连接':config.key?'伙伴已就绪':'连接AI伙伴';}
function refreshChat(){
  if(modalState?.panel!=='chat')return;const w=state.staff.find(w=>w.id===modalState.id);if(!w||!$('#dialogue-reply'))return;
  const last=w.conversation.filter(m=>m.role==='staff'&&(!m.kind||m.kind==='player')).at(-1);
  $('#dialogue-reply').textContent=ai.status.busy&&ai.status.staff===w.id?'嗯，让我想一想…':last?.text||staffDefinition(w.id).greeting;
  $('#chat-send').disabled=ai.status.busy||!config.key;$('#chat-hint').textContent=!config.key?'在右上角连接伙伴后，就能聊聊了。':ai.status.error||'说说安排，或点一句想聊的话。';
  const memories=$('#dialogue-memories');if(memories)memories.innerHTML=view.memoriesView(w);
}
function closeModal({release=true}={}){
  if(release&&modalState?.panel==='chat'&&ai.status.busy&&ai.status.lastKind==='player')ai.abort();
  $('#modal-root').innerHTML='';$('#dialogue-root').innerHTML='';modalState=null;if(release){act(state,{type:'end-interaction'});shownInteraction='';}
}
function openChat(id){
  const w=state.staff.find(w=>w.id===id),d=staffDefinition(id);if(!w)return;closeModal({release:false});w.chatWith='player';modalState={panel:'chat',id};
  $('#dialogue-root').innerHTML=`<section class="dialogue-box" role="dialog" aria-label="和${d.name}聊聊"><button class="close-button" data-action="close-modal" aria-label="结束交谈">×</button><div class="dialogue-avatar">${view.art('staff-atlas',d.column,56)}</div><div class="dialogue-copy"><div class="dialogue-name">${d.name}<small>${d.skill}</small></div><p id="dialogue-reply"></p><div class="dialogue-choices"><button data-action="quick-chat" data-message="今天的工作感觉怎么样？">今天感觉如何？</button><button data-action="quick-chat" data-message="记住，店主喜欢不太甜的青柠饮品。">记住我的口味</button><button data-action="quick-chat" data-message="今晚有什么小活动的灵感？">聊聊今晚</button><button data-action="continue-work">一起继续忙吧</button></div><form id="chat-form"><textarea id="chat-input" rows="1" maxlength="500" aria-label="给伙伴的话" placeholder="跟${d.name}说句话…"></textarea><button id="chat-send" class="primary-button" type="submit">发送</button></form><div id="chat-hint" class="chat-hint"></div><details class="dialogue-details"><summary>工作安排与记忆</summary><label>负责岗位 <select id="staff-role" data-staff="${id}" aria-label="${d.name}的岗位">${Object.entries(ROLE_NAMES).map(([key,name])=>`<option value="${key}" ${w.role===key?'selected':''}>${name}</option>`).join('')}</select></label><div id="dialogue-memories"></div></details></div></section>`;
  renderer?.paint($('#dialogue-root'));refreshChat();save();
}
function tablePanel(id){
  const t=state.tables.find(t=>t.id===id);if(!t)return '';const p=state.player,worker=state.staff.find(w=>w.id===t.worker);
  const labels={empty:'桌面干净，等下一位客人',arriving:'客人正在入座',waiting:'客人已经点好饮品',preparing:t.worker==='player'?'这桌由你照看':'伙伴正在照看这桌',served:'客人正慢慢享用',leaving:'客人准备离开',dirty:'需要收拾一下桌面'};
  const button=(action,label,disabled=false)=>`<button class="primary-button" data-action="${action}" data-table="${id}" ${disabled?'disabled':''}>${label}</button>`;let controls='';
  if(p.carrying?.table===id)controls=button('player-deliver','把饮品端给客人');
  else if(t.status==='waiting')controls=button('player-work','我来调这杯',!!p.job);
  else if(t.status==='dirty')controls=button('player-clean','亲自收拾桌面',!!p.job||!!t.worker);
  else if(worker&&['bar','prepare'].includes(worker.job?.stage))controls=button('player-takeover','这桌我来接手',!!p.job);
  const description=t.order?`${DRINKS[t.order.drink].name} × ${t.order.quantity} · ${t.order.paid?'已结账':'等待上桌'}`:'留一张桌，给下一个故事。';
  return view.modal({title:`${id.slice(1).padStart(2,'0')} 号桌`,subtitle:labels[t.status],body:`<div class="table-detail">${view.art('furniture-atlas',t.shape,80)}<div><h3>${t.order?DRINKS[t.order.drink].name:'窗边的一桌'}</h3><p>${description}${worker?'<br>'+staffDefinition(worker.id).name+'正在照看':''}</p></div></div><div class="table-actions">${controls}</div>${['waiting','dirty','preparing'].includes(t.status)?`<p class="small-text" style="margin:16px 0 8px">也可以交给伙伴，先照看这一桌：</p><div class="assign-list">${state.staff.map(w=>`<button data-action="assign" data-staff="${w.id}" data-table="${id}">${staffDefinition(w.id).name}</button>`).join('')}</div>`:''}`,footer:'点击房间里的空地，继续走动。'});
}
function openPanel(panel,id=null){
  if(panel==='chat'){openChat(id);return;}if(modalState?.panel==='chat')closeModal();closeModal({release:false});modalState={panel,id};
  const views={menu:view.menuView,stock:view.stockView,staff:view.staffView,upgrade:view.upgradeView,events:view.eventsView,summary:view.summaryView};let html=views[panel]?.(state)||'';
  if(panel==='settings')html=view.settingsView(config,ai.status);if(panel==='table')html=tablePanel(id);
  if(panel==='close')html=view.modal({title:'今天，先到这里吗？',subtitle:'未完成的订单会结束，库存留到明天。',body:`<p class="muted">今天招待了 ${state.stats.served} 桌，收入 ${state.stats.revenue+state.stats.tips} G。</p>`,footer:'<button class="text-button" data-action="close-modal">再忙一会儿</button><button class="primary-button" data-action="confirm-close">确认打烊</button>'});
  if(panel==='reset')html=view.modal({title:'从第一杯重新开始？',subtitle:'将覆盖这台设备的经营进度。',body:'<p class="muted">可以先导出存档留念。</p>',footer:'<button class="outline-button" data-action="export">导出存档</button><button class="primary-button" data-action="reset">确认重新开始</button>'});
  $('#modal-root').innerHTML=html;renderer?.paint($('#modal-root'));if(panel==='settings')$('#api-key').value=config.key||'';
}
function perform(action,{refresh=true,notify=true}={}){
  const result=act(state,action);if(notify)toast(result.message,!result.ok);save();
  if(refresh&&result.ok&&modalState&&!['chat','settings','summary','close'].includes(modalState.panel)){const {panel,id}=modalState;openPanel(panel,id);}renderUI();return result;
}
function visit(panel){const id=panelStations[panel];if(id)approach({kind:'station',id});else openPanel(panel);}
function approach(target){closeModal();perform({type:'interact',target},{notify:false,refresh:false});}
function renderUI(){
  $('#gold').textContent=state.gold.toLocaleString('zh-CN');$('#reputation').textContent=state.reputation.toFixed(2);$('#day').textContent=String(state.day).padStart(2,'0');
  $('#clock').textContent=gameClock(state.elapsed);$('#clock-caption').textContent=state.phase==='ready'?'准备营业':state.phase==='closed'?'今日已打烊':state.paused?'暂停片刻':'营业中';$('#day-progress').style.width=state.elapsed/DAY_LENGTH*100+'%';
  const night=lighting==='night'||(lighting==='auto'&&state.elapsed>290);$('#phase-label').textContent=state.phase==='ready'?'准备开门':state.phase==='closed'?'今日打烊':state.paused?'暂停片刻':night?'雨夜营业':'午后营业';
  $('#weather').textContent=night?'雨 · 微凉':'晴 · 暖阳';$('#lighting-label').textContent=lighting==='auto'?'自然光':lighting==='day'?'日景':'夜景';$('#lighting-button [data-icon]').innerHTML=view.icon(night?'moon':'sun');
  $('#pause').disabled=state.phase!=='open';$('#pause').innerHTML=view.icon(state.paused?'play':'pause');$('#pause').setAttribute('aria-label',state.paused?'继续营业':'暂停营业');
  document.querySelectorAll('[data-action="speed"]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.speed)===state.speed));
  $('#business-button').innerHTML=view.icon(state.phase==='ready'?'door':state.phase==='closed'?'book':'moon')+`<span>${state.phase==='ready'?'开门营业':state.phase==='closed'?'今日账本':'打烊结算'}</span>`;$('#latest-log').textContent=state.logs.at(-1)?.text||'';
  const p=state.player,j=p.job;$('#player-status').textContent=p.interaction?.kind==='staff'?'店长 · 和伙伴聊聊':j?.kind==='clean'?'店长 · 正在收桌':j?.stage==='prepare'?'店长 · 正在调饮':p.path.length?'店长 · 走在店里':'店长 · 就在这里';
  $('#player-task').textContent=j?.stage==='prepare'?`用心调一杯，还需 ${Math.max(0,Math.ceil(j.remaining))} 秒`:j?.stage==='bar'?'走到吧台，准备这桌的饮品':j?.stage==='deliver'?'把饮品送到客人面前':p.target?'走近后就可以互动':p.carrying?`点击 ${p.carrying.table.slice(1)} 号桌，把这一杯送过去`:'点击地面走动，点击伙伴或桌子互动';
  $('#carry-status').innerHTML=p.carrying?`端着 ${DRINKS[p.carrying.drink].name} × ${p.carrying.quantity} <button data-action="cancel-player">放回吧台</button>`:j?`照看 ${j.table.slice(1)} 号桌 <button data-action="cancel-player">交还伙伴</button>`:'双手空着 · 随时帮把手';
  const interaction=p.interaction,key=interaction?interaction.kind+':'+interaction.id:'';
  if(key&&key!==shownInteraction){shownInteraction=key;if(interaction.kind==='staff')openChat(interaction.id);else if(interaction.kind==='table')openPanel('table',interaction.id);else openPanel(stationPanels[interaction.id]);}if(!key)shownInteraction='';
  $('#walk-hint').hidden=state.elapsed>25||!!p.path.length||!!modalState;renderAI();refreshChat();
  if(state.phase==='closed'&&state.summary&&summaryShown!==state.day){summaryShown=state.day;openPanel('summary');save();}
}
function renderHotspots(){
  if(!renderer)return;const signature=state.staff.map(w=>w.id).join(',');
  if(hotspotSignature!==signature){hotspotSignature=signature;$('#hotspots').innerHTML=Object.entries(STATIONS).map(([id])=>`<button data-action="world-target" data-kind="station" data-id="${id}" title="走近${stationLabels[id]}" aria-label="走近${stationLabels[id]}">${view.icon(({inventory:'box',ledger:'cup',hire:'people',upgrades:'lamp',events:'book'})[id])}<span>${stationLabels[id]}</span></button>`).join('')+state.staff.map(w=>`<button class="actor-hotspot" data-action="world-target" data-kind="staff" data-id="${w.id}" aria-label="走近${staffDefinition(w.id).name}" title="走近${staffDefinition(w.id).name}交谈">${view.icon('chat')}</button>`).join('')+state.tables.map(t=>`<button class="table-hotspot" data-action="world-target" data-kind="table" data-id="${t.id}" aria-label="走近${t.id.slice(1)}号桌" title="走近${t.id.slice(1)}号桌">${t.id.slice(1).padStart(2,'0')}</button>`).join('');}
  $('#hotspots').querySelectorAll('button').forEach(b=>{
    const kind=b.dataset.kind,id=b.dataset.id,obj=kind==='station'?STATIONS[id]:kind==='staff'?state.staff.find(w=>w.id===id):state.tables.find(t=>t.id===id);
    let point=renderer.project({x:obj.x,y:obj.y-(kind==='staff'?95:kind==='table'?92:0)});
    if(kind==='staff'&&point.y<125)point=renderer.project({x:obj.x,y:obj.y+33});
    b.style.left=point.x+'px';b.style.top=point.y+'px';b.hidden=point.x<20||point.x>innerWidth-20||point.y<120||point.y>innerHeight-110;
    if(kind==='table')b.classList.toggle('needs-help',['waiting','dirty'].includes(obj.status));
  });
}
function settingsFromForm(){
  const baseUrl=$('#api-base').value.trim().replace(/\/+$/,''),model=$('#api-model').value.trim(),key=$('#api-key').value.trim();try{const u=new URL(baseUrl);if(u.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(u.hostname))throw new Error();}catch{toast('请输入有效的 HTTPS 模型地址。',true);return null;}if(!model){toast('请填写模型名称。',true);return null;}return {baseUrl,model,key,auto:$('#auto-ai').checked};
}
function storeConfig(next){config=next;write(sessionStorage,'moonlit-ai-session',JSON.stringify(config));write(localStorage,'moonlit-preferences',JSON.stringify({baseUrl:config.baseUrl,model:config.model,auto:config.auto}));ai.status.error='';ai.status.connected=false;renderAI();}
async function sendChat(text){
  const id=modalState?.id;if(modalState?.panel!=='chat'||!text.trim())return;
  if(ai.status.busy){toast('等伙伴把这句话说完吧。');return;}if(!config.key){toast('先在右上角连接伙伴吧。',true);return;}
  const message=text.trim().slice(0,500);$('#chat-input').value='';
  const match=message.match(/^(?:请|麻烦你|麻烦)?\s*(?:优先|先)(?:帮我)?(?:照看|服务|处理)?\s*([1-4一二三四])(?:号)?桌/);
  if(match){const n=({'一':1,'二':2,'三':3,'四':4})[match[1]]||Number(match[1]);perform({type:'assign',staff:id,table:`t${n}`},{refresh:false,notify:false});}
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
  case 'chat':approach({kind:'staff',id:d.staff});return;
  case 'assign':if(state.player.job?.table===d.table)act(state,{type:'cancel-player'});perform({type:'assign',staff:d.staff,table:d.table});return;
  case 'player-work':case 'player-clean':case 'player-deliver':case 'player-takeover':{const r=perform({type:d.action,table:d.table},{refresh:false});if(r.ok)closeModal({release:false});return;}
  case 'cancel-player':perform({type:d.action},{refresh:false});closeModal();return;
  case 'quick-chat':await sendChat(d.message);return;
  case 'next-day':perform({type:'next-day'},{refresh:false});lighting='auto';closeModal();return;
  case 'save-settings':{const next=settingsFromForm();if(next){storeConfig(next);$('#connection-result').textContent='连接设置已保存。';toast('设置已保存。');}return;}
  case 'test-connection':{if(ai.status.busy){toast('伙伴正在回应，稍等片刻。');return;}const next=settingsFromForm();if(!next)return;storeConfig(next);const el=$('#connection-result');el.textContent='正在请求真实模型…';button.disabled=true;const ok=await ai.ask(state.staff[0].id,'请用一句简短中文向人类店主问好，无需记忆。','test');if(el.isConnected){el.textContent=ok?'连接成功 · '+ai.status.lastReply:ai.status.error;el.className='connection-result'+(ok?'':' error');button.disabled=false;}return;}
  case 'export':exportSave();return;
  case 'import':$('#import-file').click();return;
  case 'reset-confirm':openPanel('reset');return;
  case 'reset':ai.abort();state=createGame();summaryShown=0;lighting='auto';shownInteraction='';hotspotSignature='';closeModal();save();renderUI();return;
}}
document.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(b&&!b.disabled)void clickAction(b).catch(()=>toast('操作未完成，请重试。',true));});
document.addEventListener('submit',event=>{if(event.target.id==='chat-form'){event.preventDefault();void sendChat($('#chat-input').value);}if(event.target.id==='settings-form')event.preventDefault();});
document.addEventListener('change',event=>{if(event.target.id==='staff-role')perform({type:'role',staff:event.target.dataset.staff,role:event.target.value},{refresh:false});});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();if(event.target.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendChat(event.target.value);}});
$('#import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw new Error();const next=parseGame(await file.text());ai.abort();state=next;summaryShown=0;shownInteraction='';hotspotSignature='';closeModal();save();renderUI();toast('存档已恢复。');}catch{toast('存档无效，现有进度已保留。',true);}finally{event.target.value='';}});
$('#world').addEventListener('click',event=>{if(!renderer)return;const hit=renderer.hitTest(event.clientX,event.clientY);if(!hit)return;if(hit.type==='ground'){closeModal();perform({type:'move-player',x:hit.x,y:hit.y},{refresh:false,notify:false});}else approach({kind:hit.type,id:hit.id});});
view.fillIcons();renderUI();save();
try{renderer=await createRenderer($('#world'));$('#loading').remove();renderer.paint();renderUI();let previous=performance.now(),lastDraw=0,lastUI=0,lastSave=0,lastAI=0;
  function loop(time){const dt=Math.min(.25,Math.max(0,(time-previous)/1000));previous=time;advance(state,dt);if(time-lastDraw>30){renderer.draw(state,time,lighting);renderHotspots();lastDraw=time;}if(time-lastUI>200){renderUI();lastUI=time;}if(time-lastSave>2000){save();lastSave=time;}if(time-lastAI>750){ai.tick();lastAI=time;}requestAnimationFrame(loop);}
  document.addEventListener('visibilitychange',()=>{previous=performance.now();save();});requestAnimationFrame(loop);
}catch{const loading=$('#loading');if(loading)loading.innerHTML='<div class="error-panel">场景资源未能载入。请使用 start.cmd 启动，再刷新页面。</div>';toast('美术资源读取失败。',true);}
window.addEventListener('pagehide',save);
