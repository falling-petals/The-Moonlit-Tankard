// Quiet, entirely local sound. The caller invokes unlock from a pointer gesture.
export function createAudio(){
  let context=null,master=null,muted=false,lastState=null,lastDay=null,lastElapsed=0,lastWork=-Infinity,lastBeat=-Infinity;
  const seen=new Set();
  async function unlock(){
    try {
      if(!context){
        const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!AudioContext)return false;
        context=new AudioContext();master=context.createGain();master.gain.value=muted?0:.025;master.connect(context.destination);
      }
      if(context.state==='suspended')await context.resume();
      return context.state==='running';
    } catch {context=null;master=null;return false;}
  }
  function setMuted(value){muted=Boolean(value);if(master)master.gain.value=muted?0:.025;}
  function tone(frequency,offset=0,duration=.10,volume=.5,type='sine'){
    const start=context.currentTime+offset,osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+duration+.01);
  }
  function chime(notes,volume=.5){notes.slice(0,6).forEach((frequency,index)=>tone(frequency,index*.055,.14,volume));}
  function update(s){
    if(!s)return;
    const events=s.events||[],elapsed=Number(s.elapsed)||0;
    if(lastState!==s||lastDay!==s.day||elapsed<lastElapsed){
      seen.clear();for(const e of events)seen.add(e.id);
      lastState=s;lastDay=s.day;lastWork=-Infinity;lastBeat=-Infinity;
    }
    lastElapsed=elapsed;
    const fresh=events.filter(e=>!seen.has(e.id));for(const e of fresh)seen.add(e.id);
    if(seen.size>180){seen.clear();for(const e of events)seen.add(e.id);}
    if(muted||!context||context.state!=='running')return;
    try {
      // At most a few short notes per render update, even after a large time step.
      for(const e of fresh.slice(-4)){
        if(e.type==='served')chime([784,1047,1319],.55);
        else if(e.type==='player-ready')chime([523,659],.3);
        else if(e.type==='combo-tier')chime([659,784,1047,1319],.4);
        else if(e.type==='cameo-paid')chime([523,659,784,1047,1319,1568],.6);
        else if(e.type==='party-started')chime([392,494,587,784],.35);
      }
      if(s.phase!=='open'||s.paused)return;
      const now=context.currentTime,working=[s.player,...(s.staff||[])].some(w=>w&&!w.path?.length&&!w.job?.suspended&&(w.job?.stage==='prepare'||w.job?.kind==='clean'));
      if(working&&now-lastWork>.7){tone(290,0,.045,.12,'triangle');tone(440,.07,.04,.08);lastWork=now;}
      if(s.progression?.party?.status==='active'&&now-lastBeat>.48){
        const beat=Math.floor(elapsed*2)%4;tone(beat===0?98:196,0,.14,.2,'triangle');if(beat===2)tone(392,.10,.06,.1);lastBeat=now;
      }
    } catch {/* Audio remains optional if a browser closes its context. */}
  }
  return {unlock,setMuted,update,get muted(){return muted;}};
}
