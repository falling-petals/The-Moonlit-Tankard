import {cellarView} from './views.js';

// 地窖是一层覆盖界面：打开时暂停模拟，关掉才继续。所有改动都经 engine 的 act。
export function createCellarUI({getState,getRenderer,act,onChange,onOpen,onClose}){
  const host=document.querySelector('#cellar-root');
  let open=false,pickSlot=null,leaving=false;

  function render(){
    if(!open)return;
    host.innerHTML=cellarView(getState(),pickSlot);
    // 重新渲染会换掉节点，进场那一帧的 is-in 得跟着补回来，否则整层会停在透明。
    host.querySelector('.cellar')?.classList.add('is-in');
    getRenderer()?.paint(host);
  }

  function show(){
    if(open)return;
    open=true;pickSlot=null;
    host.innerHTML=cellarView(getState(),null);
    getRenderer()?.paint(host);
    requestAnimationFrame(()=>host.querySelector('.cellar')?.classList.add('is-in'));
    document.addEventListener('keydown',onKey);
    onOpen?.();
    host.querySelector('.cellar-exit')?.focus({preventScroll:true});
  }

  function hide(){
    if(!open||leaving)return;
    leaving=true;
    const root=host.querySelector('.cellar');
    if(root)root.classList.add('is-leaving');
    const finish=()=>{
      leaving=false;open=false;pickSlot=null;host.innerHTML='';
      document.removeEventListener('keydown',onKey);onClose?.();
    };
    if(!root||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)finish();
    else setTimeout(finish,240);
  }

  function onKey(event){
    if(event.key!=='Escape'||!open)return;
    event.stopPropagation();
    hide();
  }

  function handle(action,data){
    switch(action){
      case 'cellar-close':hide();return;
      case 'cellar-pick':pickSlot=Number(data.slot)||0;render();return;
      case 'cellar-cancel':pickSlot=null;render();return;
      case 'cellar-store':{const result=act({type:'cellar-store',drink:data.drink});pickSlot=null;render();onChange?.(result);return;}
      case 'cellar-take':{const result=act({type:'cellar-tap',id:data.cask});render();onChange?.(result);return;}
      default:return;
    }
  }

  // 地窖的动作只在这里处理，不走全局那套 [data-action] 分发。
  host.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');
    if(!button||!open)return;
    const action=button.dataset.action;
    if(!action.startsWith('cellar-'))return;
    event.stopPropagation();
    handle(action,button.dataset);
  });

  return {show,hide,refresh:()=>{if(open)render();},get isOpen(){return open;}};
}
