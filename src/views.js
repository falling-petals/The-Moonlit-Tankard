import {DRINKS,STAFF,UPGRADES,ROLE_NAMES,staffDefinition,TABLE_COSTS,MAX_STAFF,STAR_STEPS,starTier,CELLAR,cellarSlots,caskPercent} from './content.js';
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const starsHtml=n=>Array.from({length:5},(_,i)=>`<i class="${i<n?'on':''}">${i<n?'★':'☆'}</i>`).join('');
const paths={
  home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  cup:'<path d="M5 5h12v9a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5Z"/><path d="M17 7h2a3 3 0 0 1 0 6h-2M4 22h15M8 2v1m4-1v1"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3ZM17 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  box:'<path d="m3 7 9-4 9 4v13H3Zm0 0 9 4 9-4M12 11v9M7 5l9 4"/>',
  lamp:'<path d="M8 3h8l4 12H4ZM12 15v6m-4 0h8M5 5 3 3m16 2 2-2"/>',
  book:'<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3Zm0 15a3 3 0 0 1 3-3h13M8 7h8M8 10h6"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  settings:'<path d="m9 3-.5 3-2.5 1-2.5-1L2 10l2.5 2L4 15l2 3 3-1 2 2v3h4l1-3 3-1 2-3-1.5-2 1-3-2-3-3 .5L14 3Z"/><circle cx="12" cy="12" r="3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon:'<path d="M20 15A9 9 0 0 1 9 3 9 9 0 1 0 20 15Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>',
  door:'<path d="M4 21V3h12v18Zm12-13h4v13M4 21h17M12 12h.1"/>',
  leaf:'<path d="M20 3C5 1 1 12 7 17c7 7 16-1 13-14ZM5 21 16 9"/>',
  chat:'<path d="M3 4h18v13H9l-6 4Zm4 5h10M7 12h7"/>',
  barrel:'<path d="M8 2h8M8 22h8M7 2c1.4 3 1.4 17 0 20M17 2c-1.4 3-1.4 17 0 20M4 8h16M4 16h16"/>',
};
export const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.leaf}</svg>`;
export const art=(atlas,index,size=48,extra='')=>`<canvas width="${size*2}" height="${size*2}" style="width:${size}px;height:${size}px" data-art="${atlas}" data-frame="${index}" aria-hidden="true" ${extra}></canvas>`;
export function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
export function modal({title,subtitle='',body,footer='',wide=false,chat=false}){
  return `<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-label="${esc(title)}"><header class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="close-button" data-action="close-modal" aria-label="关闭">×</button></header><div class="${chat?'':'modal-content'}">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
}
export function menuView(s){return modal({title:'把心情，放进杯子里。',subtitle:'三款招牌饮品 · 暂停销售不会取消已有订单',body:`<div class="item-grid">${Object.values(DRINKS).map(d=>`<article class="item-card">${art('items-atlas',d.icon,85,'class="item-art"')}<h3>${d.name}</h3><p>${d.subtitle}</p><div class="price-line"><span>${d.price} G / 杯</span><span>备货 ${s.stock[d.id]}</span></div><button class="primary-button ${s.menu[d.id]?'secondary':''}" data-action="menu-toggle" data-drink="${d.id}">${s.menu[d.id]?'在售 · 点击暂停售卖':'已暂停 · 点击上架'}</button></article>`).join('')}</div>`,footer:`<span>每份原料制作一杯，订单数量按实际消耗。</span><button class="text-button" data-action="panel" data-panel="stock">去补充原料 ↗</button>`});}
export function stockView(s){const cap=s.upgrades.cellar?40:24;return modal({title:'原料与出餐台',subtitle:'补货即时到达 · 每次最多补充6份',body:`${s.tables.some(t=>t.status==='ready')?`<section class="ready-list"><h3>等待取餐</h3>${s.tables.filter(t=>t.status==='ready').map(t=>`<button class="outline-button" data-action="player-pickup" data-table="${t.id}">${DRINKS[t.order.drink].name} × ${t.order.quantity} · 亲自取餐</button>`).join('')}</section>`:''}<div class="panel-note">当前每款备货上限 ${cap} 份。采购支出计入今日账本，库存会延续到下一天。</div><div class="item-grid">${Object.values(DRINKS).map(d=>{const q=Math.min(6,cap-s.stock[d.id]),cost=q*d.cost;return `<article class="item-card">${art('drinks-atlas',d.artFrame,85,'class="item-art"')}<h3>${d.name}原料</h3><p>${d.cost} G / 份 · 一份制作一杯</p><div class="stock-meter"><i style="width:${s.stock[d.id]/cap*100}%"></i></div><div class="price-line"><span>库存 ${s.stock[d.id]} / ${cap}</span><span>${q?cost+' G':'已满'}</span></div><button class="primary-button" data-action="restock" data-drink="${d.id}" ${!q||s.gold<cost?'disabled':''}>${q?'补货 +'+q:'储藏已满'}</button></article>`;}).join('')}</div>`,footer:`<span>持有金币 <b class="small-text gold">${s.gold} G</b></span><button class="text-button" data-action="panel" data-panel="upgrade">扩充储藏空间 ↗</button>`});}
export function staffView(s){const ready=s.phase==='ready';return modal({title:'伙伴与分工',subtitle:'最多三位伙伴 · 开门前调整阵容，营业时随时调岗',wide:true,body:`<div class="role-guide"><p><b>调饮</b> 专心制作，成品留在出餐台。</p><p><b>跑堂</b> 取餐、送餐、收桌，保持周转。</p><p><b>全能</b> 能完成整条流程，速度稍慢。</p></div><div class="staff-grid">${STAFF.map(d=>{const w=s.staff.find(w=>w.id===d.id);return `<article class="staff-detail">${art('staff-atlas',d.column,74)}<div><h3>${d.name}<small>${d.title}</small></h3><p>${esc(d.traitDescription||d.trait||d.skill)}<br>工资 ${d.wage} G / 天</p>${w?`<label class="role-select">岗位<select data-staff-role data-staff="${d.id}">${Object.entries(ROLE_NAMES).map(([role,label])=>`<option value="${role}" ${w.role===role?'selected':''}>${label}</option>`).join('')}</select></label><div class="staff-actions"><button class="outline-button" data-action="chat" data-staff="${d.id}">近身交谈</button><button class="text-button danger-button" data-action="fire-staff" data-staff="${d.id}" ${!ready||s.staff.length<=1?'disabled':''}>解雇</button></div>`:`<button class="primary-button" data-action="hire" data-staff="${d.id}" ${!ready||s.staff.length>=MAX_STAFF||s.gold<d.hireCost?'disabled':''}>雇佣 · ${d.hireCost} G</button>`}</div></article>`;}).join('')}</div>`,footer:`<span>在岗 ${s.staff.length} / ${MAX_STAFF} · 雇佣费用不退还</span><span>${s.gold} G</span>`});}
export function upgradeView(s){return modal({title:'扩建与设备',subtitle:'设备与布置 · 每项可升级一次',body:`<section class="expansion-card"><h3>扩大营业规模</h3><p>已开放 ${s.tables.filter(t=>t.enabled!==false).length} / 6 桌 · 开门前扩建</p><button class="primary-button" data-action="expand-table" ${s.phase!=='ready'||!s.tables.some(t=>t.enabled===false)||s.gold<TABLE_COSTS[s.tables.filter(t=>t.enabled!==false).length]?'disabled':''}>${s.tables.some(t=>t.enabled===false)?'开放下一桌 · '+TABLE_COSTS[s.tables.filter(t=>t.enabled!==false).length]+' G':'全部座位已开放'}</button></section><div class="upgrade-list">${Object.values(UPGRADES).map(u=>`<article class="upgrade-row"><div class="upgrade-symbol">${icon(u.icon)}</div><div><h3>${u.name}</h3><p>${u.description}</p></div><button class="primary-button ${s.upgrades[u.id]?'secondary':''}" data-action="upgrade" data-upgrade="${u.id}" ${s.upgrades[u.id]||s.gold<u.cost?'disabled':''}>${s.upgrades[u.id]?'已完成 ✓':u.cost+' G · 升级'}</button></article>`).join('')}</div>`,footer:`<span>布置会保留到未来的每一天。</span><span>持有 ${s.gold} G</span>`});}
export function eventsView(s){return modal({title:'留住今晚的小片刻。',subtitle:'营业手记 · 记录真实发生的服务与交谈',body:`<article class="event-card"><h3>今晚，我们怎么开？</h3><p>经营路线、秘方、连击和派对会一起影响这一晚。开门前选好路线，营业中与伙伴共同完成订单。</p><button class="primary-button" data-action="visit" data-panel="night">看看今晚的安排 ↗</button></article><h3 style="font-size:16px;margin-bottom:9px">酒馆手记</h3>${s.logs.slice(-18).reverse().map(l=>`<div class="journal-row ${l.tone==='dialogue'?'dialogue':''}">${esc(l.text)}</div>`).join('')}`,footer:`<span>伙伴的记忆在近身交谈时查看。</span><span>第 ${s.day} 天</span>`});}
export function settingsView(config,status){return modal({title:'小店的设置。',subtitle:'个人本机模式 · 浏览器直接连接模型服务',body:`<div class="panel-note">使用启动脚本时会自动读取环境配置。API Key 仅保存在当前标签页会话中，不随游戏存档导出。连接不可用时，经营仍可继续。</div><form id="settings-form" class="form-grid"><label>模型服务地址<input id="api-base" name="baseUrl" type="url" value="${esc(config.baseUrl)}" required autocomplete="off" spellcheck="false"></label><label>模型名称<input id="api-model" name="model" value="${esc(config.model)}" required autocomplete="off" spellcheck="false"></label><label>API Key<input id="api-key" name="key" type="password" placeholder="输入密钥，或使用环境变量启动" autocomplete="off" spellcheck="false"></label><label class="checkbox-label"><input id="auto-ai" name="auto" type="checkbox" ${config.auto?'checked':''}>允许店员自动回应顾客、与同事交谈</label></form><div class="settings-actions"><button class="primary-button" data-action="save-settings">保存连接设置</button><button class="primary-button secondary" data-action="test-connection">测试真实对话</button></div><div id="connection-result" class="connection-result ${status.error?'error':''}" role="status">${esc(status.error||(status.connected?'真实模型连接已验证。':config.key?'已读取配置，等待首次真实对话。':'尚未配置模型，随时可以开始经营。'))}</div><div class="setting-section"><h3>进度与存档</h3><p class="small-text">经营进度自动保存到此浏览器，也可以导出备份。</p><div class="settings-actions"><button class="outline-button" data-action="export">导出游戏存档</button><button class="outline-button" data-action="import">导入存档</button><button class="outline-button" data-action="replay-intro">重看序章</button><button class="outline-button" data-action="reset-guide">重看引导</button><button class="outline-button danger-button" data-action="reset-confirm">重新开始</button></div></div>`,footer:`<span>默认使用百炼 qwen-plus，可填写其他兼容接口。</span><a href="assets/index.html" target="_blank">美术资产 ↗</a>`});}
export function chatView(s,id){
  const w=s.staff.find(w=>w.id===id),d=staffDefinition(id);
  return modal({title:`和${d.name}聊一会儿。`,subtitle:'真实模型对话 · 聊天期间照常营业，可手动暂停',wide:true,chat:true,
    body:`<div class="chat-layout"><aside class="chat-profile">${art('staff-atlas',d.column,100)}<h3 style="color:${d.color}">${d.name}</h3><p>${d.title}<br>${d.skill}</p><select id="staff-role" aria-label="${d.name}的岗位" data-staff="${id}">${Object.entries(ROLE_NAMES).map(([key,name])=>`<option value="${key}" ${w.role===key?'selected':''}>${name}</option>`).join('')}</select><button class="outline-button" data-action="colleague" data-staff="${id}">和同事说说话</button><div class="memory-list" id="chat-memories"></div></aside><div class="chat-body"><div class="chat-messages" id="chat-messages" aria-live="polite"></div><div class="chat-input-area"><div class="chat-quick"><button data-action="quick-chat" data-message="今天的工作感觉怎么样？">今天感觉如何？</button><button data-action="quick-chat" data-message="记住，接待客人时先问问口味，不要推荐太甜的。">记住一条安排</button><button data-action="quick-chat" data-message="有什么适合今晚的小活动建议？">聊聊今晚的灵感</button></div><form id="chat-form" class="chat-compose"><textarea id="chat-input" rows="1" maxlength="500" aria-label="给伙伴的话" placeholder="说说今天的安排，或问问伙伴的心情…"></textarea><button id="chat-send" class="primary-button" type="submit">发送</button></form><div class="chat-hint" id="chat-hint">Enter 发送 · Shift+Enter 换行 · 真实回应会稍作等待</div></div></div></div>`});
}
export function chatMessagesView(worker,status){
  const def=staffDefinition(worker.id);
  let body=`<div class="message system"><div class="message-text">${esc(def.greeting)}<br>这是角色开场白，后续交谈使用真实模型。</div></div>`;
  body+=worker.conversation.map(m=>`<div class="message ${m.role}"><div class="message-label">${m.role==='player'?'店主':def.name}${m.kind==='guest'?' · 接待顾客':m.kind==='colleague'?' · 同事交流':''} · ${esc(m.time||'')}</div><div class="message-text">${esc(m.text)}</div></div>`).join('');
  if(status.busy&&status.staff===worker.id)body+=`<div class="message system"><div class="message-text">${esc(def.name)}正在想怎么回应…</div></div>`;
  if(status.error)body+=`<div class="message system"><div class="message-text" style="color:var(--coral)">${esc(status.error)}</div></div>`;
  return body;
}
export function memoriesView(w){return `<span>记在心里的事 · ${w.memories.length}</span>${w.memories.length?`<ul>${w.memories.slice(-5).map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:'<p class="small-text">交谈后，值得记住的事会留在这里。</p>'}${Object.keys(w.relationships).length?`<span>同事熟悉度</span><ul>${Object.entries(w.relationships).map(([id,n])=>`<li>${esc(staffDefinition(id)?.name||id)} · ${n}</li>`).join('')}</ul>`:''}${w.suggestion?`<button class="outline-button" data-action="panel" data-panel="events">看看活动灵感 ↗</button>`:''}`;}
export function summaryView(s){
  const r=s.summary,stars=r.stars??s.stars??2;
  const note=r.starGain>0?'今夜点亮了一颗星':r.starNote==='blocked'?'今晚有客人等久了，这颗星没能点亮':'再攒一点口碑，下一颗星就在前面';
  return modal({title:'今天，也好好经营了。',subtitle:`第 ${s.day} 天 · 营业结算`,body:`<div class="summary-head"><div class="moon-large">☾</div><h3>灯还亮着，故事留着。</h3><p>把今天的忙碌，酿成明天的期待。</p></div><div class="summary-numbers"><div><small>今日招待</small><strong>${r.served}<small>桌</small></strong></div><div><small>营业收入</small><strong>${r.revenue}<small>G</small></strong></div><div><small>酒馆口碑</small><strong>${r.reputation.toFixed(2)}</strong></div></div><div class="summary-stars"><span class="star-row">${starsHtml(stars)}</span><span>${note}</span></div>${r.cellarAged?`<p class="summary-cellar">地窖里 ${r.cellarAged} 桶又陈了一夜，明天搬上来会更值钱。</p>`:''}<div class="receipt"><div><span>饮品收入</span><span>+ ${r.revenue} G</span></div><div><span>客人小费</span><span>+ ${r.tips} G</span></div><div><span>原料与活动支出</span><span>− ${r.purchases} G</span></div><div><span>伙伴工资</span><span>− ${r.wages} G</span></div><div class="total"><span>今日经营净额</span><strong>${r.profit>=0?'+ ':''}${r.profit} G</strong></div></div>`,footer:`<span>库存、伙伴与记忆会留到明天。</span><button class="primary-button" data-action="next-day">迎接新的一天 ${icon('sun')}</button>`});
}
export function fameView(s){
  const rows=STAR_STEPS.map(step=>{
    const lit=s.milestones.includes(step.id),need=Math.max(0,Math.ceil((step.rep-s.reputation)/0.015));
    const how=need>0?`口碑到 ${step.rep.toFixed(2)} 就亮（还差约 ${need} 桌满意的服务）`:`口碑已经够了，今晚打烊就能点亮`;
    return `<article class="fame-row ${lit?'lit':''}"><div class="fame-star">${lit?'★':'☆'}</div><div class="fame-body"><h3>第 ${step.star} 颗 · ${step.name}</h3><p>${lit?`已经点亮 · ${step.opens}归你了`:`${how} · ${step.opens}`}</p></div><span class="fame-tag">${lit?'已点亮':'未点亮'}</span></article>`;
  }).join('');
  const next=STAR_STEPS.find(v=>v.star>s.stars);
  return modal({title:'月下街怎么说这家店。',subtitle:'口碑在打烊时结成星 · 一晚最多点亮一颗',body:`<div class="fame-head"><span class="star-row big">${starsHtml(s.stars)}</span><div><strong>${s.reputation.toFixed(2)}</strong><small> 口碑 · ${s.stars} / 5 颗星</small></div></div><div class="panel-note">满意的服务一点点抬高口碑，等久的客人会把它拽下来。一晚差评到三桌，这颗星就留到明天。</div><div class="fame-list">${rows}</div>`,footer:`<span>${next?'下一颗：'+next.name:'已经到顶，剩下的日子留给客人。'}</span><span>第 ${s.day} 天</span>`});
}
const MILESTONE_TEXT={
  cellar:'后门那扇一直锁着的门，今晚开了。地窖比你想的深，能存下的东西也更多。',
  regulars:'米娅和诺亚开始记得你的名字。下次进门，他们会先叫你一声，再点酒。',
  moonlit:'街坊说，这家店值得等一整夜。等这一夜收尾，会有人替你把灯留着。'
};
export function milestoneView(step){
  return modal({title:'街上传开了一件事。',subtitle:`第 ${step.star} 颗星 · ${step.name}`,body:`<div class="milestone-card"><div class="milestone-star">★</div><h3>${step.opens}，归你了。</h3><p>${MILESTONE_TEXT[step.id]||''}</p></div>`,footer:`<span>—— 青芽</span><button class="primary-button" data-action="close-milestone">明晚见</button>`});
}
const caskPips=level=>Array.from({length:CELLAR.maxLevel},(_,i)=>`<i class="${i<level?'on':''}"></i>`).join('');
// 地窖是一间房，不是一张菜单：桶躺在架上，那就是它的全部内容。
// 背景是一张画的 SVG：拱、石墙、地面、两盏壁灯。房间总得有个房间的样子。
const cellarRoom=()=>`<svg class="cellar-room" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="clWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f231b"/><stop offset=".5" stop-color="#1d1510"/><stop offset="1" stop-color="#110c09"/></linearGradient>
<linearGradient id="clFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2016"/><stop offset=".4" stop-color="#1a120d"/><stop offset="1" stop-color="#090605"/></linearGradient>
<pattern id="clBrick" width="104" height="42" patternUnits="userSpaceOnUse">
<rect x="1" y="1" width="102" height="18" rx="3" fill="#3a2a1d" opacity=".3"/>
<rect x="1" y="23" width="49" height="18" rx="3" fill="#33251a" opacity=".26"/>
<rect x="54" y="23" width="49" height="18" rx="3" fill="#3e2d1f" opacity=".22"/>
</pattern>
<radialGradient id="clVig" cx=".5" cy=".38" r=".76"><stop offset=".46" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></radialGradient>
</defs>
<rect width="1280" height="800" fill="url(#clWall)"/>
<rect width="1280" height="572" fill="url(#clBrick)" opacity=".34"/>
<rect y="600" width="1280" height="200" fill="url(#clFloor)"/>
<path d="M0 600H1280" stroke="#5a422c" stroke-width="1.5" opacity=".26"/>
<g stroke="#6b5334" stroke-width="1" opacity=".1"><path d="M0 648H1280M0 712H1280M0 778H1280"/></g>
<rect width="1280" height="800" fill="url(#clVig)"/>
</svg>`;

export function cellarView(s,pickSlot=null){
  const casks=s.cellar?.casks??[],vintage=s.cellar?.vintage??[],slots=cellarSlots(s),total=CELLAR.baseSlots+CELLAR.extraSlots;
  const tiles=Array.from({length:total},(_,i)=>{
    const cask=casks[i];
    if(i>=slots)return `<article class="cask locked"><div class="cask-art"><span class="cask-mark"></span></div><div class="cask-plate"><h4>还没凿开</h4><p class="cask-meta">扩容储藏柜之后再多一格</p></div><span class="cask-none" aria-hidden="true"></span></article>`;
    if(!cask)return `<article class="cask empty"><div class="cask-art">${art('furniture-atlas',12,280,'class="ghost"')}<span class="cask-mark">＋</span></div><div class="cask-plate"><h4>空桶位</h4><p class="cask-meta">从楼上挑一款放进来</p></div><button class="primary-button" data-action="cellar-pick" data-slot="${i}">放一桶</button></article>`;
    const d=DRINKS[cask.drink],full=cask.level>=CELLAR.maxLevel,pct=caskPercent(cask.level);
    const levelText=full?'已经到底':cask.level?`陈酿 ${cask.level} / ${CELLAR.maxLevel}`:'刚入窖 · 过一夜才变好';
    return `<article class="cask filled"><div class="cask-art">${art('furniture-atlas',12,280)}</div><div class="cask-plate"><h4>${esc(d.name)}</h4><p class="cask-meta">${cask.qty} 份 · 第 ${cask.day} 天入窖</p><div class="cask-level"><span class="cask-pips">${caskPips(cask.level)}</span><small>${levelText}</small></div></div><button class="outline-button" data-action="cellar-take" data-cask="${esc(cask.id)}">${pct?`搬上楼 · +${pct}%`:'搬上楼'}</button></article>`;
  }).join('');
  const panel=pickSlot!==null
    ?`<aside class="cellar-panel is-picking"><h3>放进第 ${pickSlot+1} 号桶位</h3><p class="cellar-note">每桶最多 ${CELLAR.perCask} 份，直接从上楼的库存里扣。</p><ul class="cask-picks">${Object.values(DRINKS).filter(d=>s.stock[d.id]>0).map(d=>`<li><button data-action="cellar-store" data-drink="${d.id}"><b>${esc(d.name)}</b><small>库存 ${s.stock[d.id]} · 可入窖 ${Math.min(CELLAR.perCask,s.stock[d.id])} 份</small></button></li>`).join('')||'<li class="empty-note">楼上没有库存了，先去补货。</li>'}</ul><button class="text-button" data-action="cellar-cancel">算了，先不放</button></aside>`
    :`<aside class="cellar-panel"><h3>今晚的陈酿</h3>${vintage.length?`<ul class="vintage-list">${vintage.map(v=>`<li><span>${esc(DRINKS[v.drink]?.name||'')}</span><small>${v.qty} 份 · ${v.level} 级 · 售价 +${caskPercent(v.level)}%</small></li>`).join('')}</ul>`:'<p class="cellar-note">还没有开桶。搬上来的酒，今晚按陈酿价卖出。</p>'}<div class="cellar-rule"><p>入窖的酒今晚卖不到，还占着桶位。</p><p>每过一夜涨一级，最多三级。</p><p>一桌点的量够整份，才算陈酿价。</p></div></aside>`;
  return `<div class="cellar" role="dialog" aria-modal="true" aria-label="地窖">${cellarRoom()}<div class="cellar-lamp" aria-hidden="true"><i></i></div><header class="cellar-head"><div><p class="cellar-kicker">后门那扇一直锁着的门</p><h2>地窖</h2><p class="cellar-sub">第 ${s.day} 天 · 桶位 ${casks.length} / ${slots}</p></div><button class="cellar-exit" data-action="cellar-close">上楼 ↑</button></header><div class="cellar-body"><section class="cellar-rack" aria-label="酒架">${tiles}</section>${panel}</div><footer class="cellar-foot"><span class="cellar-quote">酒在下面睡着，别去吵它们。</span><span class="cellar-sign">—— 青芽</span></footer></div>`;
}
export function tableView(s,id){const t=s.tables.find(t=>t.id===id),labels={empty:'等待下一位客人',arriving:'客人正在入座',waiting:'等待接单',preparing:'伙伴正在制作',served:'客人正在享用',leaving:'客人正在离店',dirty:'等待收桌'};return modal({title:`${id.slice(1).padStart(2,'0')} 号桌的小片刻。`,subtitle:'临时指派会在伙伴完成手头工作后优先处理',body:`<div class="table-detail">${art('furniture-atlas',t.shape,120)}<div><h3>${labels[t.status]}</h3><p>${t.order?`${DRINKS[t.order.drink].name} × ${t.order.quantity}<br>${t.order.paid?'订单已收款':'订单尚未收款'}`:'一张干净的桌子，一段新的相遇。'}${t.worker?'<br>当前负责：'+esc(staffDefinition(t.worker).name):''}</p></div></div>${t.status!=='empty'?`<p class="small-text" style="margin-bottom:14px">安排一位伙伴优先照看：</p><div class="assign-list">${s.staff.map(w=>`<button data-action="assign" data-staff="${w.id}" data-table="${t.id}">${staffDefinition(w.id).name}</button>`).join('')}</div>`:''}`,footer:`<span>服务、库存和收款由营业规则自动执行。</span>`});}
