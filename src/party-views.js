import {RECIPES,STRATEGIES,drinkInfo} from './progression.js';
import {DRINKS,gameClock} from './content.js';
import {art,icon,esc,modal} from './views.js';

const rarity={common:'普通',rare:'稀有',epic:'史诗',legendary:'传说'};
const recipeArt=(recipe,size=60)=>art(recipe?.atlas??'event-atlas',recipe?.frame??6,size);
export function recipesView(s){
  const p=s.progression,ready=s.phase==='ready';
  return modal({title:'灵感，酿成下一杯。',subtitle:'秘方收藏 · 每晚选一张，为今晚菜单带来变化',body:`<div class="draw-counter"><div>${art('event-atlas',7,38)}<span><small>持有灵感</small><b>${p.inspiration}</b></span></div><button class="primary-button" data-action="draw-recipe" ${p.inspiration<10?'disabled':''}>翻开秘方 · 10 ✦</button></div><p class="odds-note">普通55% · 稀有30% · 史诗13% · 传说2%<br>连续4次普通后，第5次必出稀有以上（75% / 23% / 2%）；当前 ${p.pity}/4。重复返还4灵感。</p><div class="recipe-collection">${Object.values(RECIPES).map(r=>{const owned=p.collection.includes(r.id),equipped=p.equipped===r.id;return `<article class="recipe-card ${owned?'owned':'locked'} rarity-${r.rarity} ${equipped?'equipped':''}">${recipeArt(owned?r:null)}<div><div class="recipe-meta"><span>${rarity[r.rarity]}</span><small>${DRINKS[r.base]?.name||'招牌基底'}</small></div><h3>${esc(r.name)}${owned?'':' · 未收录'}</h3><strong class="recipe-price">${drinkInfo({...s,progression:{...p,equipped:r.id}},r.base).price} G / 杯</strong><p>${owned?esc(r.description):'在营业中收集灵感，翻开这页秘方。'}</p>${owned?`<button data-action="equip-recipe" data-recipe="${r.id}" ${!ready||equipped?'disabled':''}>${equipped?'今夜招牌 ✓':ready?'加入今晚菜单':'下次开门前可选'}</button>`:''}</div></article>`;}).join('')}</div>`,footer:`<span>已收录 ${p.collection.length}/${Object.keys(RECIPES).length} · ${ready?'现在可以更换招牌':'营业中保留当前招牌'}</span><button class="text-button" data-action="visit" data-panel="night">安排今晚 ↗</button>`});
}
export function nightView(s){
  const p=s.progression,party=p.party,ready=s.phase==='ready',active=party.status==='active';
  const status={idle:'给小店一个热闹的理由',scheduled:`已约好 ${gameClock(party.startAt)} 开始`,active:`正在派对 · 还剩 ${Math.max(0,Math.ceil(party.endsAt-s.elapsed))} 秒`,complete:party.rewarded?'这一晚，大家都很尽兴':'这一场结束了，下次再聚'}[party.status];
  const canParty=s.phase!=='closed'&&party.status==='idle'&&s.gold>=60&&(ready||s.elapsed<=480);
  return modal({title:'今晚，我们这样开。',subtitle:'开门前决定路线，和伙伴一起把这一晚做好',body:`<div class="strategy-options">${Object.values(STRATEGIES).map(st=>`<button class="strategy-card ${p.strategy===st.id?'chosen':''}" data-action="set-strategy" data-strategy="${st.id}" ${!ready?'disabled':''}><span>${st.id==='quick'?'↗':'✧'} ${esc(st.name)}</span><p>${st.id==='quick'?'调饮耗时 −35% · 单价 −10%':'调饮耗时 +25% · 单价 +45%'}</p><small>${st.id==='quick'?'快出杯、快周转，让连击接起来':'耐心打磨每杯，赚到更高客单价'} ${p.strategy===st.id?'✓':''}</small></button>`).join('')}</div>${!ready?'<p class="odds-note">当晚路线已确定，下一天开门前可切换。</p>':''}<section class="party-offer">${art('event-atlas',13,62)}<div><h3>今晚，开个小派对。</h3><p>${status}<br>120秒热闹时光，客流加快、饮品收益提升。完成3桌派对订单，获得12灵感。</p></div><button class="primary-button" data-action="start-party" ${canParty?'':'disabled'}>${party.status==='idle'?'筹备派对 · 60 G':active?`已招待 ${party.served}/3 桌`:'今日已安排'}</button></section><div class="night-goals"><h3>营业小目标</h3><p><span>${p.goals.served?'✓':'○'} 招待3桌客人</span><b>+8 ✦</b></p><p><span>${p.combo.rewarded.includes(3)?'✓':'○'} 首次达到3连击</span><b>+3 ✦</b></p><p><span>${party.rewarded?'✓':'○'} 派对期间完成3桌订单</span><b>+12 ✦</b></p></div><div class="cameo-note">${art('event-atlas',4,36)}<p><b>偶遇，全场买单。</b><br>黄仁勋会来店里客串，替活动期间的顾客结清饮品账单。看见他时，和伙伴一起多招待几桌。</p></div>`,footer:`<span>今晚最高连击 <b>${p.combo.best}</b> · 今日服务 ${s.stats.served} 桌</span><button class="text-button" data-action="visit" data-panel="events">营业手记 ↗</button>`});
}
export function drawReveal(result){
  const recipe=typeof result.recipe==='string'?RECIPES[result.recipe]:result.recipe;if(!recipe)return '';
  return `<section class="draw-reveal rarity-${recipe.rarity}" role="dialog" aria-label="秘方抽取结果"><button class="close-button" data-action="close-draw" aria-label="关闭抽取结果">×</button><div class="reveal-art">${recipeArt(recipe,126)}</div><span class="rarity-label">${rarity[recipe.rarity]}秘方 · ${result.duplicate?'似曾相识':'新的一页'}</span><h2>${esc(recipe.name)}</h2><p>${esc(recipe.description)}</p><small>${result.duplicate?'已收录，返还4灵感':'已加入收藏，开门前可以设为今夜招牌'}</small><button class="primary-button" data-action="close-draw">收好这份灵感 ${icon('leaf')}</button></section>`;
}
export function liveProgress(s){
  const p=s.progression,party=p.party,cameo=p.cameo;
  if(cameo.status==='active')return `<span class="live-event-title">✦ 黄仁勋 · 全场买单</span><small>待结清 ${cameo.pot} G · ${cameo.orders} 桌 · ${Math.max(0,Math.ceil(cameo.endsAt-s.elapsed))}s</small>`;
  if(party.status==='active')return `<span class="live-event-title">♫ 月下派对进行中</span><small>已完成 ${party.served}/3 桌 · 剩 ${Math.max(0,Math.ceil(party.endsAt-s.elapsed))}s</small>`;
  if(party.status==='scheduled')return `<small>♫ ${gameClock(party.startAt)} 开始派对 · 伙伴们正在准备</small>`;
  return '';
}
export function drinksView(s){
  return modal({title:'把心情，放进杯子里。',subtitle:'基底库存通用，今晚的秘方和路线会改变每杯表现',body:`<div class="item-grid">${Object.values(DRINKS).map(base=>{const d=drinkInfo(s,base.id);return `<article class="item-card">${art(d.recipeAtlas??'drinks-atlas',d.recipeFrame??d.artFrame,76,'class="item-art"')}<h3>${esc(d.name)}</h3><p>${base.name}基底 · ${Math.round(d.brew*10)/10}秒调制</p><div class="price-line"><span>${d.price} G / 杯</span><span>备货 ${s.stock[d.id]}</span></div><button class="primary-button secondary" data-action="menu-toggle" data-drink="${d.id}">${s.menu[d.id]?'在售 · 点击暂停售卖':'已暂停 · 点击上架'}</button></article>`;}).join('')}</div>`,footer:`<button class="text-button" data-action="visit" data-panel="recipes">翻翻秘方 ↗</button><button class="text-button" data-action="visit" data-panel="stock">补充原料 ↗</button>`});
}
