import {requestStaffReply} from './ai.js';
import {staffDefinition,gameClock,DRINKS,REQUESTS,ROLE_NAMES,allWorkers} from './content.js';
import {addMemory,rememberDialogue,selectMemories,sanitizePlan} from './memory.js';
import {log} from './engine.js';
import {validEmotion,emotionFromText} from './character-animation.js';
import {RECIPES,STRATEGIES,drinkInfo} from './progression.js';

export function createInteractions({getState,getConfig,getArea=()=> 'floor',onUpdate,onError,requestReply=requestStaffReply,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const status={busy:false,staff:null,connected:false,error:'',lastKind:'',lastReply:'',partial:'',phase:'',calls:0};
  let stateRef=getState(),generation=0,active=null,social=null,lastAuto=0,lastColleague=0,countDay=stateRef.day,autoCount=0;
  const seen=new Set(stateRef.events.map(e=>e.id));
  const memorySeen=new Set(stateRef.events.map(e=>e.id));
  const notify=()=>onUpdate?.(status);
  const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=200;
  const idle=w=>!w.job&&!w.path?.length&&w.chatWith!=='player';
  const eligible=(a,b)=>a&&b&&staffDefinition(a.id)?.area===staffDefinition(b.id)?.area&&idle(a)&&idle(b)&&near(a,b);
  const sceneWorkers=s=>allWorkers(s).filter(w=>staffDefinition(w.id).area===getArea());
  function abort(){
    if(active?.worker?.expression==='thinking'){active.worker.expression='neutral';active.worker.expressionUntil=0;}
    generation++;active?.controller.abort();active=null;
    if(social)for(const w of social.workers){w.socialUntil=0;w.bubble='';w.bubbleUntil=0;}
    social=null;status.busy=false;status.staff=null;status.partial='';status.phase='';notify();
  }
  function sync(){
    const s=getState();
    if(s!==stateRef||s.day!==countDay){abort();stateRef=s;countDay=s.day;autoCount=0;lastAuto=0;lastColleague=0;seen.clear();for(const e of s.events)seen.add(e.id);}
    return s;
  }
  const short=speech=>{
    const sentence=String(speech).trim().split(/(?<=[。！？!?])/u)[0];
    return sentence.length>60?sentence.slice(0,59)+'…':sentence;
  };
  async function perform(id,text,kind='player',extra={},session=null){
    const state=sync(),worker=allWorkers(state).find(w=>w.id===id),config=getConfig();
    if(!worker)return null;
    if(kind==='player'&&((active&&active.kind!=='player')||social))abort();
    if(active||(social&&social!==session)){if(kind==='player')onError?.('伙伴正在回应，稍等片刻。');return null;}
    if(!config.key){if(kind==='player')onError?.('请先在设置中连接大模型。');return null;}
    const token=generation,day=state.day;
    const valid=()=>generation===token&&getState()===state&&state.day===day&&allWorkers(state).includes(worker);
    if(kind==='player'){worker.conversation.push({role:'player',text,time:gameClock(state.elapsed)});worker.conversation=worker.conversation.slice(-40);}
    const request={controller:new AbortController(),kind,worker};active=request;
    status.busy=true;status.staff=id;status.lastKind=kind;status.error='';status.partial='';status.phase='requesting';notify();
    worker.expression='thinking';worker.expressionUntil=now()+30000;
    const context=structuredClone({day:state.day,time:gameClock(state.elapsed),phase:state.phase,role:ROLE_NAMES[worker.role],gold:state.gold,
      stock:state.stock,tables:state.tables.filter(t=>t.enabled!==false).map(t=>({table:t.id,status:t.status,drink:t.order?drinkInfo(state,t.order.drink)?.name:null,
        patience:Math.max(0,Math.ceil(t.patience)),request:t.request?{...REQUESTS[t.request.id],fulfilled:t.request.fulfilled}:null})),
      coworkers:allWorkers(state).map(w=>({name:staffDefinition(w.id).name,area:staffDefinition(w.id).area,role:ROLE_NAMES[w.role],job:w.job?.stage||'idle',familiarity:worker.relationships[w.id]??0})),recentDialogue:worker.conversation.slice(-6),
      workPolicy:worker.workPolicy??'balanced',workArrangement:{current:({'clean-first':'优先收桌，已生效','urgent-first':'优先照看着急的客人，已生效',balanced:'平衡照看'})[worker.workPolicy??'balanced'],pending:worker.pendingPlan??null,recentlyApplied:(worker.memoryBook??[]).filter(m=>m.type==='arrangement').slice(-3).map(m=>m.text)},cellar:{automation:state.cellar.automation,restocking:{sharedStock:true,instant:true,price:"与手动补货相同的原料价",activity:state.cellar.activity},mice:state.cellar.pests.mice.length,tom:state.cellar.tom},
      owner:'店主是正在操作游戏的人类玩家，不是AI员工。',recentWork:state.logs.filter(l=>l.tone!=='dialogue').slice(-5).map(l=>l.text),
      progression:state.progression??null,recipe:RECIPES[state.progression?.equipped]??null,
      strategy:STRATEGIES[state.progression?.strategy]??null,recentEvents:state.events.slice(-10),...extra});
    let hasReply=false;
    try{
      const reply=await requestReply(config,{...staffDefinition(id),memories:selectMemories(worker,text,state.day)},context,text,{signal:request.controller.signal,onPartial:partial=>{
        if(!valid()||active!==request||request.controller.signal.aborted)return;
        status.partial=String(partial).slice(0,360);status.phase='streaming';notify();
      }});
      if(!valid())return null;
      // A remote reply may arrive after the people have walked away or the player opened a chat.
      if(session&&(!eligible(...session.workers)||state.paused||state.phase!=='open'))return null;
      if(kind==='guest'&&extra.table){const t=state.tables.find(t=>t.id===extra.table);if(!guestEligible(worker,t))return null;}
      if(kind==='event'&&(!idle(worker)||!state.player||!near(worker,state.player)||state.paused||state.phase!=='open'))return null;
      const speech=kind==='player'?reply.speech:short(reply.speech);
      worker.expression=validEmotion(reply.emotion)??emotionFromText(speech);worker.expressionUntil=now()+(kind==='player'?11000:5000);
      hasReply=true;
      if(session)for(const w of session.workers)if(w!==worker){w.bubble='';w.bubbleUntil=0;}
      rememberDialogue(worker,reply.memory,state.day);if(kind==='player')worker.pendingPlan=sanitizePlan(reply.plan);worker.bubble=speech;worker.bubbleUntil=now()+(kind==='player'?11000:3200);
      worker.conversation.push({role:'staff',text:speech,kind,time:gameClock(state.elapsed)});worker.conversation=worker.conversation.slice(-40);
      if(reply.suggestion)worker.suggestion=reply.suggestion;
      status.connected=true;status.error='';status.lastReply=speech;status.calls++;
      log(state,`${staffDefinition(id).name}：${speech}`,'dialogue');notify();return speech;
    }catch(error){
      if(!valid())return null;
      worker.expression='sad';worker.expressionUntil=now()+4000;
      status.error=error.message;status.connected=false;if(kind==='player')onError?.(error.message);notify();return null;
    }finally{
      if(active===request){if(!hasReply&&worker.expression==='thinking'){worker.expression='neutral';worker.expressionUntil=0;}active=null;status.busy=false;status.staff=null;status.partial='';status.phase='';notify();}
    }
  }
  async function ask(id,text,kind='player',extra={}){return (await perform(id,text,kind,extra))!==null;}
  async function colleague(id){
    const state=sync(),speaker=allWorkers(state).find(w=>w.id===id),other=allWorkers(state).find(w=>w!==speaker&&eligible(speaker,w));
    if(!other||social||active||state.phase!=='open'||state.paused)return false;
    const session={workers:[speaker,other],generation,state,day:state.day};social=session;
    // Only idle employees pause to talk; restocking and simulation never await the network.
    for(const w of session.workers)w.socialUntil=now()+30000;
    try{
      const first=await perform(id,`你和${staffDefinition(other.id).name}刚在店里碰面。结合近期真实工作，自然说一句交接、关心或闲聊；也可以聊眼前天气，但不要编造天气事实。只说一句，约40至60字，不要扮演店主。`,'colleague',{audience:other.id},session);
      if(!first)return false;
      // A real utterance was heard by the nearby colleague, even if the reply later fails.
      speaker.relationships[other.id]=(speaker.relationships[other.id]||0)+1;
      other.relationships[id]=(other.relationships[id]||0)+1;
      addMemory(other,{text:`${staffDefinition(id).name}刚对我说：${first}`,type:'relationship',subject:id,source:'heard',day:state.day,importance:3});
      for(const w of session.workers)w.socialUntil=now()+30000;
      await delay(3200);
      if(social!==session||generation!==session.generation||getState()!==state||state.day!==session.day||!eligible(speaker,other))return true;
      speaker.bubble='';speaker.bubbleUntil=0;notify();
      await perform(other.id,`同事${staffDefinition(id).name}刚对你说：“${first}”。自然接一句，约40至60字，不要扮演店主。`,'colleague',{audience:id},session);
      return true;
    }finally{
      if(social===session){for(const w of session.workers)w.socialUntil=0;social=null;notify();}
    }
  }
  function guestEligible(w,t){return w&&t&&w.chatWith!=='player'&&['waiting','preparing','ready','served'].includes(t.status)&&near(w,{x:t.x,y:t.y+100})&&(!t.worker||t.worker===w.id)&&(!w.job||w.job.table===t.id);}
  function tick(){
    const s=sync(),time=now(),config=getConfig();
    for(const e of s.events){
      if(memorySeen.has(e.id))continue;memorySeen.add(e.id);
      const text=({'served':`我完成了一桌订单，收入${e.revenue??0}金币。`,'auto-restocked':`我花了${e.cost??0}金币，自动补入${e.amount??0}份${DRINKS[e.drink]?.name??'原料'}，库存已到账。`,'tom-caught':'Tom在地窖抓到了一只老鼠。','gemini-caught':'Gemini帮忙抓到了一只老鼠。','day-ended':`第${s.day}天已经打烊。`})[e.type];
      if(!text)continue;
      const witnesses=e.type==='day-ended'?allWorkers(s):e.staff?allWorkers(s).filter(w=>w.id===e.staff):e.type==='tom-caught'?s.cellar.workers:[];
      for(const w of witnesses)addMemory(w,{text,type:'event',subject:e.staff??'cellar',source:e.id,day:s.day,importance:e.type==='day-ended'?5:2});
    }
    if(memorySeen.size>500){memorySeen.clear();for(const e of s.events)memorySeen.add(e.id);}
    if(s.phase!=='open'||s.paused||!config.auto||!config.key)return;
    for(const event of s.events){
      if(seen.has(event.id))continue;
      if(['recipe-drawn','combo-tier','party-started','cameo-started'].includes(event.type)){
        if(active||social||time-lastAuto<20000||autoCount>=10)continue;
        const w=s.staff.find(w=>idle(w)&&s.player&&near(w,s.player));if(!w)continue;
        seen.add(event.id);lastAuto=time;autoCount++;
        void ask(w.id,'结合刚刚实际发生的经营事件与今晚策略，对附近的店主自然说一句简短感想或建议，约30至50字。只描述状态里已有的事实，不宣称自己执行了交易或活动。','event',{event});
        continue;
      }
      if(event.type!=='guest-request'){seen.add(event.id);continue;}
      const table=s.tables.find(t=>t.id===event.table);
      if(!table||!['waiting','preparing','ready','served'].includes(table.status)){seen.add(event.id);continue;}
      if(active||social||time-lastAuto<20000||autoCount>=10)continue;
      const w=s.staff.find(w=>guestEligible(w,table));if(!w)continue;
      seen.add(event.id);lastAuto=time;autoCount++;
      void ask(w.id,`顾客在${event.table.slice(1)}号桌提出：“${event.text}”。菜单已点${drinkInfo(s,event.drink)?.name}。作为现场服务店员自然回应一句，约20至40字。特殊需求只有fulfilled为true才已经落实；未落实时可提醒店主或表达听到要求，不要宣称已经处理。`,'guest',{request:event.text,table:event.table});
    }
    if(seen.size>500){seen.clear();for(const e of s.events)seen.add(e.id);}
    if(!active&&!social&&s.elapsed>100&&time-lastColleague>120000&&time-lastAuto>40000&&autoCount<9){
      const workers=sceneWorkers(s),speaker=workers.find(a=>workers.some(b=>a!==b&&eligible(a,b)));
      if(speaker){lastColleague=time;lastAuto=time;autoCount+=2;void colleague(speaker.id);}
    }
  }
  return {status,ask,colleague,tick,abort};
}
