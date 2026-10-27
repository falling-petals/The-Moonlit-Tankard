import {DRINKS} from './content.js';
import {art} from './views.js';

// 进度独立存放，不进游戏存档：storage.js 对存档的校验很严，加字段会牵动旧档兼容。
const KEY='moonlit-guide-v1';
const fresh=()=>({done:new Set(),cards:new Set(),off:false,startDay:null,seen:{entered:{}}});

function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
    const entered=raw.entered&&typeof raw.entered==='object'?raw.entered:{};
    return {done:new Set(raw.done||[]),cards:new Set(raw.cards||[]),off:!!raw.off,
      startDay:Number.isInteger(raw.startDay)?raw.startDay:null,seen:{entered}};
  }catch{return fresh();}
}
function persist(g){
  try{localStorage.setItem(KEY,JSON.stringify({done:[...g.done],cards:[...g.cards],off:g.off,
    startDay:g.startDay,entered:g.seen.entered||{}}));}catch{}
}

const dirtyTable=s=>s.tables.find(t=>t.enabled!==false&&t.status==='dirty');
// 青芽是全能的，客人一坐下她立刻接手——所以不能只盯 waiting，否则玩家永远没有插手的机会。
function pickTable(s){
  const on=s.tables.filter(t=>t.enabled!==false);
  return on.find(t=>t.status==='waiting'&&!t.worker)||on.find(t=>t.status==='waiting')||
    on.find(t=>t.status==='preparing')||on.find(t=>t.status==='ready')||null;
}
const busy=s=>s.tables.some(t=>t.enabled!==false&&['arriving','waiting','preparing','ready'].includes(t.status));
const onSale=s=>Object.keys(DRINKS).filter(k=>s.menu[k]);
const onSaleTotal=s=>onSale(s).reduce((n,k)=>n+s.stock[k],0);
function lowDrink(s){
  const list=onSale(s).filter(k=>s.stock[k]<=4);
  return list.length?list.reduce((a,b)=>s.stock[b]<s.stock[a]?b:a):null;
}
const pendingRequest=s=>s.tables.find(t=>t.enabled!==false&&t.request&&!t.request.fulfilled&&['arriving','waiting','preparing'].includes(t.status));
// 客人的可点击区在桌子的左上（t.x-105, t.y+25）而不是桌子中心；脏桌的杯子在右下。指错位置会让玩家点了没反应。
const seatPoint=t=>({kind:'world',x:t.x-105,y:t.y-17});
const cupPoint=t=>({kind:'world',x:t.x+95,y:t.y+82});
const dom=selector=>({kind:'dom',selector});
const panelOpen=()=>!!document.querySelector('#modal-root .modal, #dialogue-root .context-card');
const visible=selector=>{const el=document.querySelector(selector);return el&&!el.disabled&&el.getClientRects().length?el:null;};

// 引导跑了两天还想不通的地方，就别再拦着了——玩家早就会了。
const expired=(s,g)=>(s.day-(g.startDay??s.day))>=2;
// 玩家亲眼看过这一步。没有它，「没有脏桌」「手里没端着杯子」这类结果态会在开局就成立，
// 教程会在第一秒把五步全部划掉，人却什么都没学到。
const entered=(g,id)=>!!g.seen.entered?.[id];
// 打烊了，这一天没轮到教的东西就算了，别拖着毕业卡不放。
const washed=(s,g)=>s.phase==='closed'&&s.day===g.startDay;
const washedNext=(s,g)=>s.phase==='closed'&&s.day>g.startDay;

const NIGHT='第一夜';
const SECOND='第二天';

const STEPS=[
  {
    id:'open',
    chapter:NIGHT,
    when:s=>s.phase==='ready',
    done:s=>s.phase!=='ready',
    text:()=>'门开着，灯也亮着。就差你一句话。',
    action:'点右上角「开门营业」',
    target:()=>dom('#business-button')
  },
  {
    id:'table',
    chapter:NIGHT,
    when:s=>s.phase==='open'&&!s.player.job&&!s.player.carrying&&!!pickTable(s),
    done:(s,g)=>entered(g,'table')&&(!!s.player.job||s.stats.served>0||expired(s,g))||washed(s,g),
    text:s=>`${pickTable(s)?.id.slice(1)||''} 号桌坐下了。这一杯，要不要你来？`,
    action:s=>{
      const t=pickTable(s);if(!t)return'点那张桌子';
      if(t.status==='ready')return'点那张桌子，再按「我来取餐」';
      if(t.worker&&t.worker!=='player')return'点那张桌子，再按「我来接手」';
      return'点那张桌子，再按「我来制作」';
    },
    target:s=>{
      const t=pickTable(s);if(!t)return null;
      const btn=visible(`.table-actions button[data-action="player-work"][data-table="${t.id}"]`)||
        visible(`.table-actions button[data-action="player-takeover"][data-table="${t.id}"]`)||
        visible(`.table-actions button[data-action="player-pickup"][data-table="${t.id}"]`);
      return btn?dom(`.table-actions button[data-action="${btn.dataset.action}"][data-table="${t.id}"]`):seatPoint(t);
    }
  },
  {
    id:'serve',
    chapter:NIGHT,
    when:s=>!!s.player.carrying,
    done:(s,g)=>entered(g,'serve')&&(!s.player.carrying||s.stats.served>0||expired(s,g))||washed(s,g),
    text:()=>'端过去吧，趁还热着。',
    action:'点客人的桌子，把杯子放下',
    target:s=>{
      const t=s.tables.find(t=>t.id===s.player?.carrying?.table);if(!t)return null;
      if(visible(`.table-actions button[data-action="player-deliver"][data-table="${t.id}"]`))
        return dom(`.table-actions button[data-action="player-deliver"][data-table="${t.id}"]`);
      return seatPoint(t);
    }
  },
  {
    id:'clean',
    chapter:NIGHT,
    when:s=>s.phase==='open'&&!!dirtyTable(s),
    done:(s,g)=>entered(g,'clean')&&(!dirtyTable(s)||expired(s,g))||washed(s,g),
    text:()=>'客人走了，杯子还留在桌上。收干净，下一位才有地方坐。',
    action:'点那张脏桌子',
    target:s=>{
      const t=dirtyTable(s);if(!t)return null;
      if(visible(`.table-actions button[data-action="player-clean"][data-table="${t.id}"]`))
        return dom(`.table-actions button[data-action="player-clean"][data-table="${t.id}"]`);
      return cupPoint(t);
    }
  },
  {
    id:'stock',
    chapter:NIGHT,
    when:s=>s.phase!=='closed'&&!!lowDrink(s),
    enter:(s,g)=>{if(g.seen.lowSum===undefined)g.seen.lowSum=onSaleTotal(s);g.seen.low=lowDrink(s);},
    done:(s,g)=>entered(g,'stock')&&(expired(s,g)||onSaleTotal(s)>(g.seen.lowSum??0)||!!(g.seen.low&&s.stock[g.seen.low]>=8))||washed(s,g),
    text:(s,g)=>{const name=DRINKS[g.seen.low]?.name||'原料';return `${name}只剩 ${s.stock[g.seen.low]??0} 杯了。别等客人点空了才发现。`;},
    action:'点下方「原料」补一点',
    target:()=>dom('[data-action="visit"][data-panel="stock"]')
  },
  {
    id:'close',
    chapter:NIGHT,
    when:s=>s.phase==='open'&&s.stats.served>=1,
    done:(s,g)=>s.phase==='closed'||s.day!==g.startDay||expired(s,g),
    text:()=>'第一夜走完大半了。右上角能打烊，看看今天赚了多少。',
    action:'点右上角「打烊结算」',
    target:()=>dom('#business-button')
  },
  {
    id:'summary',
    chapter:NIGHT,
    when:s=>s.phase==='closed',
    done:(s,g)=>s.day!==(g.startDay??1)||expired(s,g),
    text:()=>'账本在这一页。数字不重要，重要的是你知道钱花去了哪。',
    action:'点「迎接新的一天」',
    target:()=>dom('[data-action="next-day"]')
  },
  {
    id:'hire',
    chapter:SECOND,
    when:(s,g)=>s.day>g.startDay&&s.phase==='ready'&&s.staff.length<3,
    done:(s,g)=>s.staff.length>1||s.tables.filter(t=>t.enabled!==false).length>2||expired(s,g)||washedNext(s,g),
    text:()=>'两个人的店，和一个人的店不一样。缺人手，先雇一位。',
    action:'点下方「伙伴」，再点「雇佣」',
    target:()=>dom('[data-action="hire"]:not([disabled])')||dom('[data-action="visit"][data-panel="staff"]')
  },
  {
    id:'recipe',
    chapter:SECOND,
    when:s=>s.phase==='ready'&&s.progression.inspiration>=10,
    done:(s,g)=>s.progression.draws>0||expired(s,g)||washedNext(s,g),
    text:()=>'灵感攒够了。翻一张秘方，装上今晚的招牌。',
    action:'点下方「秘方」，再点「翻一张」',
    target:()=>dom('[data-action="draw-recipe"]:not([disabled])')||dom('[data-action="visit"][data-panel="recipes"]')
  },
  {
    id:'talk',
    chapter:SECOND,
    needsAi:true,
    // 没配模型的时候这句话说不出来，这一步就不算数，别把玩家卡在毕业门口。
    when:(s,g)=>!!g.aiReady,
    done:(s,g)=>s.staff.some(w=>w.conversation.some(m=>m.role==='player'))||expired(s,g)||washedNext(s,g),
    text:()=>'我在吧台后面。有想说的，就说给我听。',
    action:'走近我，点「近身交谈」',
    target:s=>{const w=s.staff[0];return w?{kind:'world',x:w.x,y:w.y-46}:null;}
  }
];

const CARDS=[
  {
    id:'combo',
    when:s=>!busy(s)&&s.progression.combo.count>=2&&s.progression.combo.tier===0,
    text:()=>'再连着做完一单，收入就开始加成了。55 秒内别断。',
    action:'左上角的连击条就是倒计时',
    target:()=>dom('#combo-hud')
  },
  {
    id:'request',
    when:s=>s.phase==='open'&&!!pendingRequest(s),
    text:s=>`${pendingRequest(s).id.slice(1)} 号桌在等一杯「${({lowSugar:'少糖',warm:'温热',express:'赶时间'})[pendingRequest(s).request.id]||'特别做法'}」。回应一句，他愿意多给几枚小费。`,
    action:'点那张桌，再按「按要求调整」',
    target:s=>{
      const t=pendingRequest(s);if(!t)return null;
      if(visible(`.table-actions button[data-action="fulfill-request"][data-table="${t.id}"]`))
        return dom(`.table-actions button[data-action="fulfill-request"][data-table="${t.id}"]`);
      return seatPoint(t);
    }
  }
];

export function mountGuide({project,paint,blocked=()=>false,aiReady=()=>true}={}){
  const root=document.createElement('div');
  root.id='guide-root';
  root.innerHTML=`<aside class="guide-card" hidden aria-live="polite">
  <header class="guide-head"><span class="guide-avatar"></span><div class="guide-name"><b>青芽</b><small>伙伴 <span class="guide-count"></span></small></div><button class="guide-close" type="button" aria-label="关闭引导">×</button></header>
  <div class="guide-track"><i></i></div>
  <p class="guide-text"></p>
  <p class="guide-action"></p>
</aside><div class="guide-ring" hidden aria-hidden="true"></div>`;
  document.body.append(root);

  const card=root.querySelector('.guide-card'),textEl=root.querySelector('.guide-text'),
    actionEl=root.querySelector('.guide-action'),ring=root.querySelector('.guide-ring'),
    countEl=root.querySelector('.guide-count'),trackEl=root.querySelector('.guide-track i');
  root.querySelector('.guide-avatar').innerHTML=art('staff-atlas',0,30);
  paint?.(root);

  let guide=load(),shown=null,shownCard=false,cardAt=0,state=null,graduated=false;

  // 没接模型的人没有「和伙伴说话」这一课，题目就从九道算起。
  const required=()=>STEPS.filter(s=>!(s.needsAi&&!guide.aiReady));
  const countDone=()=>required().filter(s=>guide.done.has(s.id)).length;
  const hide=()=>{card.hidden=true;ring.hidden=true;shown=null;};
  const close=()=>{guide.off=true;persist(guide);hide();};
  root.querySelector('.guide-close').addEventListener('click',close);

  function place(target){
    if(!target){ring.hidden=true;return;}
    if(target.kind==='dom'){
      const el=document.querySelector(target.selector);
      if(!el||el.disabled||!el.getClientRects().length){ring.hidden=true;return;}
      // 面板开着时，只给面板里的目标画光圈；否则结算面板上会飘着指向背景按钮的圈。
      if(panelOpen()&&!el.closest('#modal-root,#dialogue-root')){ring.hidden=true;return;}
      const r=el.getBoundingClientRect();
      Object.assign(ring.style,{left:`${r.left+r.width/2}px`,top:`${r.top+r.height/2}px`,
        width:`${r.width+14}px`,height:`${r.height+14}px`,borderRadius:'10px'});
    }else{
      const p=project?.({x:target.x,y:target.y});
      if(!p){ring.hidden=true;return;}
      Object.assign(ring.style,{left:`${p.x}px`,top:`${p.y}px`,width:'74px',height:'74px',borderRadius:'50%'});
    }
    ring.hidden=false;
  }

  function show(step,asCard){
    const text=typeof step.text==='function'?step.text(state,guide):step.text;
    textEl.textContent=text;
    actionEl.textContent=typeof step.action==='function'?step.action(state):(step.action||'');
    const total=required().length,done=countDone();
    countEl.textContent=`${step.chapter??''} · ${done}/${total}`;
    trackEl.style.width=`${done/total*100}%`;
    if(shown!==step.id||shownCard!==asCard){
      shown=step.id;shownCard=asCard;
      card.classList.toggle('is-card',asCard);
      card.classList.remove('is-in');
      void card.offsetWidth;
      card.classList.add('is-in');
    }
    // 面板开着就让位：卡片压在弹窗右上角会挡住关闭按钮，光圈还会指进弹窗里。
    card.hidden=panelOpen();
    place(targetOf(step));
  }

  function targetOf(step){
    try{return typeof step.target==='function'?step.target(state,guide):step.target;}
    catch{return null;}
  }

  // 教程走完不是关掉卡片就完事——要有一句正式的交接，玩家才知道「现在起靠自己了」。
  function graduate(){
    if(graduated)return;
    graduated=true;guide.off=true;persist(guide);hide();
    // 接待桌数按累计算：当天数据在跨天时清零，写「已经招待 0 桌」比不写还糟。
    const day=state?.day??1,learned=countDone();
    const served=(state?.history?.reduce((n,h)=>n+(h.served||0),0)??0)+(state?.stats?.served??0);
    const el=document.createElement('div');
    el.className='guide-finale';
    el.innerHTML=`<article class="finale-card" role="dialog" aria-modal="true" aria-label="新手教程结束">
      <p class="finale-kicker">The Moonlit Tankard</p>
      <h2>店，交给你了。</h2>
      <p class="finale-line">灯怎么开、客人怎么待，往后的日子听你的。</p>
      <p class="finale-stats">第 ${day} 天 · 一起招待了 ${served} 桌 · 学会 ${learned} 件事</p>
      <p class="finale-sign">—— 青芽</p>
      <button class="finale-cta" type="button">我自己来</button>
    </article>`;
    root.append(el);
    requestAnimationFrame(()=>el.classList.add('is-in'));
    const btn=el.querySelector('.finale-cta');
    btn.focus({preventScroll:true});
    btn.addEventListener('click',()=>{el.classList.add('leaving');setTimeout(()=>el.remove(),460);},{once:true});
  }

  function update(next){
    state=next;
    if(!state||blocked()){hide();return;}
    guide.aiReady=aiReady();
    if(guide.off){hide();return;}
    if(guide.startDay===null){guide.startDay=state.day;persist(guide);}

    // 先判完成、再看条件：条件错过窗口的步骤（比如没补货就打了烊）也要能落账，
    // 否则它永远停在未完成，整个教程毕不了业。
    for(const step of STEPS){
      if(guide.done.has(step.id))continue;
      if(step.done(state,guide)){guide.done.add(step.id);persist(guide);continue;}
      if(!step.when(state,guide))continue;
      step.enter?.(state,guide);
      if(!guide.seen.entered[step.id]){guide.seen.entered[step.id]=true;persist(guide);}
      show(step,false);
      return;
    }
    delete guide.seen.lowSum;

    if(required().every(step=>guide.done.has(step.id))){graduate();return;}

    // 面板（日报、菜单等）开着时，知识卡不抢注意力，也不开始计时。
    if(panelOpen()){hide();return;}

    for(const step of CARDS){
      if(guide.cards.has(step.id))continue;
      if(!step.when(state,guide))continue;
      if(shown!==step.id){cardAt=Date.now();}
      if(Date.now()-cardAt>14000){guide.cards.add(step.id);persist(guide);continue;}
      show(step,true);
      return;
    }

    if(shown&&CARDS.some(c=>c.id===shown)){guide.cards.add(shown);persist(guide);}
    hide();
  }

  return {
    update,
    graduate,
    // 传 day 就以它为准：重开新档时 state 还是旧的，跟着旧天数走会让"第二天雇人"永远不触发。
    reset(day){
      guide=fresh();
      guide.startDay=Number.isInteger(day)?day:(state?state.day:null);
      persist(guide);cardAt=0;graduated=false;hide();
    },
    get off(){return guide.off;}
  };
}
