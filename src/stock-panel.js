import {DRINKS} from './content.js';

export function updateRestockControls(root,state){
 for(const controls of root.querySelectorAll('.restock-controls')){
  const a=state.cellar.automation,n=state.cellar.workers.length,toggle=controls.querySelector('[data-restock-auto]');
  toggle.checked=a.enabled;toggle.disabled=!n;
  const rule=Object.values(a.rules).find(r=>r.enabled)??{low:6,target:12};
  for(const [key,value] of Object.entries({low:rule.low,target:rule.target,budget:a.budget})){
   const field=controls.querySelector(`[data-restock-${key}]`),previous=field.dataset.committedValue??field.defaultValue,next=String(value);
   // Update a second mounted editor without replacing a focused or edited draft.
   if((field.value===previous&&field!==document.activeElement)||field.value===next){field.value=next;field.dataset.committedValue=next;}
  }
  controls.querySelector('[data-restock-status]').textContent=!n?'雇佣补货伙伴，自动照看库存':!a.enabled?'自动补货已暂停':state.phase!=='open'?'伙伴将在营业时补货':state.paused?'补货随营业暂停':state.gold<=0?'金币不足，等待补货':a.spent>=a.budget?'今日补货预算已用完':`自动补货 · ${n} 位伙伴在岗`;
  controls.querySelector('[data-restock-spending]').textContent=`今日自动采购 ${a.spent} / ${a.budget} G`;
 }
}
// Keep the mounted inventory controls intact while purchases run.
export function updateStockPanel(sheet,state){
  if(!sheet)return;
  updateRestockControls(sheet,state);
  const cap=state.upgrades.cellar?40:24,body=sheet.querySelector('.modal-content'),scroll=body.scrollTop;
  for(const button of sheet.querySelectorAll('[data-action="restock"][data-drink]')){
    const d=DRINKS[button.dataset.drink],stock=state.stock[d.id],q=Math.min(6,cap-stock),cost=q*d.cost,card=button.closest('.item-card');
    card.querySelector('.stock-meter i').style.width=stock/cap*100+'%';
    const [quantity,price]=card.querySelectorAll('.price-line span');
    quantity.textContent=`库存 ${stock} / ${cap}`;price.textContent=q?cost+' G':'已满';
    button.textContent=q?'补货 +'+q:'储藏已满';button.disabled=!q||state.gold<cost;
  }
  sheet.querySelector('.panel-note').textContent=`当前每款备货上限 ${cap} 份。采购支出计入今日账本，库存会延续到下一天。`;
  sheet.querySelector('.modal-footer b.gold').textContent=state.gold+' G';
  const ready=state.tables.filter(t=>t.status==='ready'),signature=JSON.stringify(ready.map(t=>[t.id,t.order.drink,t.order.quantity]));
  // Only the independent pickup list changes structure; stock cards never move.
  if(sheet.dataset.readyStamp!==signature){
    const previous=body.querySelector('.ready-list'),focused=previous?.contains(document.activeElement)?document.activeElement.dataset.table:null;
    let list=null;
    if(ready.length){
      list=document.createElement('section');list.className='ready-list';
      const title=document.createElement('h3');title.textContent='等待取餐';list.append(title);
      for(const table of ready){const button=document.createElement('button');button.className='outline-button';button.dataset.action='player-pickup';button.dataset.table=table.id;button.textContent=`${DRINKS[table.order.drink].name} × ${table.order.quantity} · 亲自取餐`;list.append(button);}
    }
    if(previous){if(list)previous.replaceWith(list);else previous.remove();}else if(list)body.prepend(list);
    if(focused){const next=[...(list?.querySelectorAll('button')||[])].find(b=>b.dataset.table===focused);next?.focus({preventScroll:true});}
    sheet.dataset.readyStamp=signature;body.scrollTop=scroll;
  }
}
