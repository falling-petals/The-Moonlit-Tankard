import {cellarView,cellarLive} from './views.js';
import {createCellarScene} from './cellar-scene.js';
import {gameClock} from './content.js';
import {updateRestockControls} from './stock-panel.js';

// One shared simulation. The cellar scene only visualizes actual work and stock.
export function createCellarUI({getState,getRenderer,act,onChange,onOpen,onClose,onChat,onEndChat}){
 const host=document.querySelector('#cellar-root');
 let open=false,leaving=false,scene=null,liveStamp='';
 function show(){
  if(open)return;open=true;liveStamp='';host.innerHTML=cellarView(getState());getRenderer()?.paint(host);
  onOpen?.();scene=createCellarScene({host,getState,getRenderer,onChat:id=>onChat?.(id),onEndChat,onExit:hide,onDrive:id=>onChange?.(act({type:'cellar-drive',id}))});
  requestAnimationFrame(()=>host.querySelector('.cellar')?.classList.add('is-in'));document.addEventListener('keydown',onKey,true);host.querySelector('.cellar-exit')?.focus({preventScroll:true});refresh();
 }
 function hide(){
  if(!open||leaving)return;leaving=true;scene?.dispose();scene=null;const root=host.querySelector('.cellar');root?.classList.add('is-leaving');
  const finish=()=>{leaving=false;open=false;host.innerHTML='';document.removeEventListener('keydown',onKey,true);onClose?.();};
  if(!root||matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else setTimeout(finish,240);
 }
 function onKey(event){if(event.key!=='Escape'||!open)return;if(document.querySelector('.dialogue-box')||document.querySelector('#modal-root .modal'))return;event.stopPropagation();const drawer=host.querySelector('.cellar-drawer:not([hidden])');if(drawer)drawer.hidden=true;else hide();}
 function handle(action,data){
  switch(action){
   case 'cellar-close':hide();return;
   case 'cellar-panel':scene?.cancelInteraction();onEndChat?.();for(const panel of host.querySelectorAll('.cellar-drawer'))panel.hidden=panel.dataset.cellarPanel!==data.panel;return;
   case 'cellar-panel-close':for(const panel of host.querySelectorAll('.cellar-drawer'))panel.hidden=true;return;
   case 'cellar-drive':onChange?.(act({type:action,id:data.id}));return;
   case 'cellar-hire-tom':onChange?.(act({type:action}));return;
  }
 }
 host.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b||!open)return;if(b.dataset.action==='visit'){scene?.cancelInteraction();onEndChat?.();return;}if(!b.dataset.action.startsWith('cellar-'))return;event.stopPropagation();handle(b.dataset.action,b.dataset);});
 function refresh(){
  if(!open)return;const state=getState(),c=state.cellar;
  const clock=host.querySelector('#cellar-clock');if(clock)clock.textContent=`第${state.day}天 · ${gameClock(state.elapsed)}`;
  const status=host.querySelector('#cellar-scene-status');if(status)status.textContent=`${c.workers.length} 位补货伙伴 · ${c.automation.enabled?'自动补货':'自动补货已暂停'} · 老鼠 ${c.pests.mice.length}`;
  const pause=host.querySelector('#cellar-pause');if(pause)pause.textContent=state.paused?'继续':'暂停';
  const node=host.querySelector('#cellar-live'),html=cellarLive(state);if(node&&html!==liveStamp&&!node.contains(document.activeElement)){node.innerHTML=html;getRenderer()?.paint(node);liveStamp=html;}
  updateRestockControls(host,state);
 }
 return {show,hide,refresh,get isOpen(){return open;}};
}

// Releasing a dialogue must not clear a floor approach/interaction target.
export function releasePreviousChat(workers,previousId,nextId){
  if(!previousId||previousId===nextId)return;
  const previous=workers.find(w=>w.id===previousId);
  if(previous?.chatWith==='player'){previous.chatWith=null;previous.socialUntil=0;}
}
