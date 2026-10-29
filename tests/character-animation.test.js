import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterAnimator,EXPRESSION_FRAMES,motionAtlas,emotionFromText,characterEmotion} from '../src/character-animation.js';
import {parseReply} from '../src/ai.js';

test('walking uses distinct authored north south left and right frame ranges and retains stopping direction',()=>{
  const animator=createCharacterAnimator(),w={id:'qwen',x:200,y:200,path:[]};
  for(const [point,direction,start] of [[{x:200,y:100},'up',4],[{x:100,y:200},'left',8],[{x:300,y:200},'right',12],[{x:200,y:300},'down',0]]){
    w.path=[point];const p=animator.pose(w,900);assert.equal(p.direction,direction);assert.ok(p.frame>=start&&p.frame<=start+2);
    w.path=[];assert.equal(animator.pose(w,900).direction,direction);
  }
});
test('gait depends on physical travel and freezes with pause or reduced motion',()=>{
  const a=createCharacterAnimator(),w={id:'z',x:100,y:200,path:[{x:400,y:200}]};
  assert.equal(a.pose(w,0).frame,12);w.x+=10;assert.equal(a.pose(w,100).frame,13);
  w.x+=18;assert.equal(a.pose(w,200).frame,14);
  assert.equal(a.pose(w,5000,{paused:true}).frame,12);assert.equal(a.pose(w,5000,{reduced:true}).frame,12);
});
test('a stationary conversation faces its real partner; portrait expressions cannot force a back-facing body forward',()=>{
  const a=createCharacterAnimator(),w={id:'gpt',x:200,y:200,path:[]};
  assert.equal(a.pose(w,500,{facePoint:{x:200,y:100},emotion:'happy'}).frame,4);
  assert.equal(a.pose(w,500,{facePoint:{x:200,y:300},emotion:'happy'}).frame,EXPRESSION_FRAMES.happy);
});
test('employee chatting with the owner faces them despite retaining its work route for later',()=>{
  const a=createCharacterAnimator(),w={id:'qwen',x:600,y:700,path:[{x:900,y:700}],chatWith:'player'};
  const pose=a.pose(w,700,{facePoint:{x:600,y:780},emotion:'happy'});
  assert.equal(pose.walking,false);assert.equal(pose.direction,'down');assert.equal(pose.frame,EXPRESSION_FRAMES.happy);
  assert.deepEqual(w.path,[{x:900,y:700}]);
});
test('expression hints expire, working is grounded in real jobs and text has a neutral fallback',()=>{
  const w={expression:'happy',expressionUntil:2000,path:[]};assert.equal(characterEmotion(w,1000),'happy');assert.equal(characterEmotion(w,3000),'neutral');
  w.job={stage:'prepare'};assert.equal(characterEmotion(w,3000),'working');w.chatWith='player';assert.equal(characterEmotion(w,3000),'neutral');w.chatWith=null;w.job.suspended=true;assert.equal(characterEmotion(w,3000),'neutral');
  assert.equal(emotionFromText('哈气！'),'angry');assert.equal(emotionFromText('谢谢，交给我！'),'happy');assert.equal(emotionFromText('这一批还需十秒。'),'neutral');
  assert.equal(motionAtlas('crew-qwen-atlas'),'crew-qwen-motion-v2-atlas');assert.equal(motionAtlas('customers-atlas'),null);assert.equal(motionAtlas('crew-mouse-atlas'),null);
});
test('model emotions are optional and constrained; unsupported animation commands are discarded',()=>{
  assert.equal(parseReply('{"speech":"好呀","emotion":"happy"}').emotion,'happy');
  assert.equal(parseReply('{"speech":"好呀","emotion":"give-gold"}').emotion,undefined);
  assert.equal(parseReply('{"speech":"好呀"}').emotion,undefined);
});
