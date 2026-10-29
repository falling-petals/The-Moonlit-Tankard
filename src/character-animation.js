// Presentation only: no task, economic or saved character state is changed here.
export const EXPRESSION_FRAMES=Object.freeze({neutral:0,blink:3,happy:7,sad:11,angry:15,thinking:16,surprised:17,working:18,tired:19});
export const DIRECTION_FRAMES=Object.freeze({down:0,up:4,left:8,right:12});
export const motionAtlas=atlas=>atlas?.endsWith('-motion-v2-atlas')?atlas:/^crew-(?!mouse-|support-).+-atlas$/.test(atlas??'')?atlas.replace(/-atlas$/,'-motion-v2-atlas'):null;
export const validEmotion=value=>Object.hasOwn(EXPRESSION_FRAMES,value)?value:null;
export function emotionFromText(text=''){
  if(/哈气|生气|哼[！!，,]|气死/.test(text))return 'angry';
  if(/哇|居然|吓[到着]|惊[讶喜]/.test(text))return 'surprised';
  if(/抱歉|对不起|难过|失望|可惜/.test(text))return 'sad';
  if(/困[了倦]|好累|休息一下|疲[惫倦]/.test(text))return 'tired';
  if(/想想|让我想|思考|琢磨/.test(text))return 'thinking';
  if(/谢谢|太好了|开心|喜欢|好呀|好耶|放心|交给我/.test(text))return 'happy';
  return 'neutral';
}
export function characterEmotion(worker,now=Date.now()){
  if(worker?.expressionUntil>now&&validEmotion(worker.expression))return worker.expression;
  if(worker?.job&&worker.chatWith!=='player'&&!worker.job.suspended&&!worker.path?.length)return 'working';
  return 'neutral';
}
export function directionFromVector(dx,dy,fallback='down'){
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<.5)return fallback;
  // Close diagonal vectors retain the same axis to avoid flickering at corners.
  const ax=Math.abs(dx),ay=Math.abs(dy),horizontal=['left','right'].includes(fallback);
  return ax>ay*1.08||horizontal&&ax>=ay*.92?(dx<0?'left':'right'):(dy<0?'up':'down');
}
export function createCharacterAnimator(){
  const poses=new WeakMap();
  return {pose(actor,time,{paused=false,reduced=false,facePoint=null,emotion=characterEmotion(actor)}={}){
    const previous=poses.get(actor)??{direction:'down',distance:0,x:actor.x,y:actor.y};
    const walking=!!actor.path?.length&&!paused&&actor.chatWith!=='player';
    let direction=previous.direction,distance=previous.distance;
    if(walking){const next=actor.path[0];direction=directionFromVector(next.x-actor.x,next.y-actor.y,direction);distance+=Math.min(40,Math.hypot(actor.x-previous.x,actor.y-previous.y));}
    else if(facePoint)direction=directionFromVector(facePoint.x-actor.x,facePoint.y-actor.y,direction);
    const start=DIRECTION_FRAMES[direction];let frame=start;
    if(walking&&!reduced)frame=start+[0,1,0,2][Math.floor(distance/9)%4];
    else if(direction==='down'){
      frame=EXPRESSION_FRAMES[validEmotion(emotion)??'neutral'];
      // Brief, staggered blinks; animation freezes while paused or motion reduced.
      const seed=String(actor.id??'').length*317;
      if(emotion==='neutral'&&!paused&&!reduced&&(time+seed)%5100<130)frame=EXPRESSION_FRAMES.blink;
    }
    poses.set(actor,{direction,distance,x:actor.x,y:actor.y});
    return {frame,direction,walking,emotion:validEmotion(emotion)??'neutral'};
  }};
}
