import {requestStaffReply,remember} from './ai.js';
import {staffDefinition,gameClock,DRINKS} from './content.js';
import {log} from './engine.js';

export function createInteractions({getState,getConfig,onUpdate,onError,requestReply=requestStaffReply,now=Date.now,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const status={busy:false,staff:null,connected:false,error:'',lastKind:'',lastReply:'',calls:0};
  let stateRef=getState(),generation=0,active=null,social=null,lastAuto=0,lastColleague=0,countDay=stateRef.day,autoCount=0;
  const seen=new Set(stateRef.events.map(e=>e.id));
  const notify=()=>onUpdate?.(status);
  const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=200;
  const idle=w=>!w.job&&!w.path?.length&&w.chatWith!=='player';
  const eligible=(a,b)=>a&&b&&idle(a)&&idle(b)&&near(a,b);
  function abort(){
    generation++;active?.controller.abort();active=null;
    if(social)for(const w of social.workers)w.socialUntil=0;
    social=null;status.busy=false;status.staff=null;notify();
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
    const state=sync(),worker=state.staff.find(w=>w.id===id),config=getConfig();
    if(!worker)return null;
    if(active||(social&&social!==session)){if(kind==='player')onError?.('伙伴正在回应，稍等片刻。');return null;}
    if(!config.key){if(kind==='player')onError?.('请先在设置中连接大模型。');return null;}
    const token=generation,day=state.day;
    const valid=()=>generation===token&&getState()===state&&state.day===day&&state.staff.includes(worker);
    if(kind==='player'){worker.conversation.push({role:'player',text,time:gameClock(state.elapsed)});worker.conversation=worker.conversation.slice(-40);}
    const request={controller:new AbortController()};active=request;
    status.busy=true;status.staff=id;status.lastKind=kind;status.error='';notify();
    const context={day:state.day,time:gameClock(state.elapsed),phase:state.phase,role:worker.role,
      stock:state.stock,tables:state.tables.map(t=>({table:t.id,status:t.status,drink:t.order?DRINKS[t.order.drink]?.name:null})),
      coworkers:state.staff.map(w=>staffDefinition(w.id).name),recentDialogue:worker.conversation.slice(-6),
      owner:'店主是正在操作游戏的人类玩家，不是AI员工。',recentWork:state.logs.slice(-5).map(l=>l.text),...extra};
    try{
      const reply=await requestReply(config,{...staffDefinition(id),memories:worker.memories},context,text,{signal:request.controller.signal});
      if(!valid())return null;
      // A remote reply may arrive after the people have walked away or the player opened a chat.
      if(session&&(!eligible(...session.workers)||state.paused||state.phase!=='open'))return null;
      if(kind==='guest'&&extra.table){const t=state.tables.find(t=>t.id===extra.table);if(!guestEligible(worker,t))return null;}
      const speech=kind==='player'?reply.speech:short(reply.speech);
      if(session)for(const w of session.workers)if(w!==worker){w.bubble='';w.bubbleUntil=0;}
      remember(worker,reply.memory);worker.bubble=speech;worker.bubbleUntil=now()+(kind==='player'?11000:3200);
      worker.conversation.push({role:'staff',text:speech,kind,time:gameClock(state.elapsed)});worker.conversation=worker.conversation.slice(-40);
      if(reply.suggestion)worker.suggestion=reply.suggestion;
      status.connected=true;status.error='';status.lastReply=speech;status.calls++;
      log(state,`${staffDefinition(id).name}：${speech}`,'dialogue');notify();return speech;
    }catch(error){
      if(!valid())return null;
      status.error=error.message;status.connected=false;if(kind==='player')onError?.(error.message);notify();return null;
    }finally{
      if(active===request){active=null;status.busy=false;status.staff=null;notify();}
    }
  }
  async function ask(id,text,kind='player',extra={}){return (await perform(id,text,kind,extra))!==null;}
  async function colleague(id){
    const state=sync(),speaker=state.staff.find(w=>w.id===id),other=state.staff.find(w=>w!==speaker&&eligible(speaker,w));
    if(!other||social||active||state.phase!=='open'||state.paused)return false;
    const session={workers:[speaker,other],generation,state,day:state.day};social=session;
    // Only idle employees pause to talk; production jobs and simulation never await the network.
    for(const w of session.workers)w.socialUntil=now()+30000;
    try{
      const first=await perform(id,`你和${staffDefinition(other.id).name}刚在店里碰面。结合近期真实工作，自然说一句交接、关心或闲聊；也可以聊眼前天气，但不要编造天气事实。只说一句，约40至60字，不要扮演店主。`,'colleague',{audience:other.id},session);
      if(!first)return false;
      // A real utterance was heard by the nearby colleague, even if the reply later fails.
      speaker.relationships[other.id]=(speaker.relationships[other.id]||0)+1;
      other.relationships[id]=(other.relationships[id]||0)+1;
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
  function guestEligible(w,t){return w&&t&&w.chatWith!=='player'&&['waiting','preparing','served'].includes(t.status)&&near(w,{x:t.x,y:t.y+100})&&(!t.worker||t.worker===w.id)&&(!w.job||w.job.table===t.id);}
  function tick(){
    const s=sync(),time=now(),config=getConfig();
    if(s.phase!=='open'||s.paused||!config.auto||!config.key)return;
    for(const event of s.events){
      if(seen.has(event.id))continue;
      if(event.type!=='guest-request'){seen.add(event.id);continue;}
      const table=s.tables.find(t=>t.id===event.table);
      if(!table||!['waiting','preparing','served'].includes(table.status)){seen.add(event.id);continue;}
      if(active||social||time-lastAuto<20000||autoCount>=10)continue;
      const w=s.staff.find(w=>guestEligible(w,table));if(!w)continue;
      seen.add(event.id);lastAuto=time;autoCount++;
      void ask(w.id,`顾客在${event.table.slice(1)}号桌提出：“${event.text}”。菜单已点${DRINKS[event.drink]?.name}。作为现场服务店员自然回应一句，约40至60字。`,'guest',{request:event.text,table:event.table});
    }
    if(seen.size>500){seen.clear();for(const e of s.events)seen.add(e.id);}
    if(!active&&!social&&s.elapsed>100&&time-lastColleague>120000&&time-lastAuto>40000&&autoCount<9){
      const speaker=s.staff.find(a=>s.staff.some(b=>a!==b&&eligible(a,b)));
      if(speaker){lastColleague=time;lastAuto=time;autoCount+=2;void colleague(speaker.id);}
    }
  }
  return {status,ask,colleague,tick,abort};
}
