import {EXPRESSION_FRAMES,DIRECTION_FRAMES} from '../src/character-animation.js';
const names={deepseek:'DeepSeek',qwen:'Qwen',z:'Z',gpt:'GPT',claude:'Claude',gemini:'Gemini',wenxin:'文心',tom:'Tom',kimi:'Kimi',tencent:'Tencent',grok:'Grok',mistral:'Mistral',seed:'Seed'};
const labels={neutral:'站立',happy:'高兴',sad:'难过',angry:'生气',surprised:'惊讶',thinking:'思考',working:'工作',tired:'疲倦',blink:'眨眼'};
const manifest=await fetch('manifest.json').then(r=>r.json()),host=document.querySelector('#characters'),selector=document.querySelector('#pose'),play=document.querySelector('#play');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,entries=[];
let paused=reduced,clock=0,previous=performance.now();
const observer=new IntersectionObserver(changes=>{for(const change of changes){const entry=entries.find(e=>e.card===change.target);if(entry){entry.visible=change.isIntersecting;if(entry.visible)load(entry);}}},{rootMargin:'240px'});
for(const [id,name] of Object.entries(names)){
  const asset=manifest.assets[`crew-${id}-motion-v2-atlas`];if(!asset)continue;
  const card=document.createElement('article');card.className='character';card.dataset.character=id;
  card.innerHTML=`<div class="stage"><canvas width="460" height="360" aria-label="${name}动作预览"></canvas></div><div class="info"><header><h2>${name}</h2><span class="tag">${['kimi','tencent','grok','mistral','seed'].includes(id)?'备用角色':id==='tom'?'地窖伙伴':['gemini','wenxin'].includes(id)?'地窖店员':'酒馆店员'}</span></header><div class="expressions">${Object.entries(labels).filter(([key])=>key!=='neutral').map(([key,label])=>`<button type="button" data-emotion="${key}">${label}</button>`).join('')}</div><a href="../${asset.src}" target="_blank" rel="noopener">查看透明原图 ↗</a></div>`;
  const entry={card,asset,canvas:card.querySelector('canvas'),image:null,visible:false,loading:false};entries.push(entry);host.append(card);observer.observe(card);
  card.addEventListener('click',event=>{const button=event.target.closest('[data-emotion]');if(!button)return;card.dataset.pose=button.dataset.emotion;for(const b of card.querySelectorAll('button'))b.classList.toggle('active',b===button);draw(entry);});
}
async function load(entry){if(entry.image||entry.loading)return;entry.loading=true;const image=new Image();image.src='../'+entry.asset.src;try{await image.decode();entry.image=image;draw(entry);}catch{entry.card.querySelector('.tag').textContent='素材读取失败';}finally{entry.loading=false;}}
function draw(entry){
  if(!entry.image)return;let pose=entry.card.dataset.pose||selector.value;
  if(pose==='cycle')pose=['down','left','up','right'][Math.floor(clock/1800)%4];
  const index=Object.hasOwn(DIRECTION_FRAMES,pose)?DIRECTION_FRAMES[pose]+(paused?0:[0,1,0,2][Math.floor(clock/150)%4]):EXPRESSION_FRAMES[pose]??0;
  const f=entry.asset.frames[index],[x,y,w,h]=f.rect,ctx=entry.canvas.getContext('2d'),scale=240/entry.asset.referenceHeight;
  ctx.clearRect(0,0,460,360);ctx.imageSmoothingEnabled=false;ctx.drawImage(entry.image,x,y,w,h,230-f.anchor[0]*scale,320-f.anchor[1]*scale,w*scale,h*scale);
  entry.canvas.dataset.frame=String(index);entry.canvas.dataset.direction=pose;
}
selector.addEventListener('change',()=>{for(const e of entries){delete e.card.dataset.pose;for(const b of e.card.querySelectorAll('button'))b.classList.remove('active');if(e.visible)draw(e);}});
function playLabel(){play.textContent=paused?'播放预览':'暂停预览';play.setAttribute('aria-pressed',String(!paused));}playLabel();
play.addEventListener('click',()=>{paused=!paused;playLabel();for(const e of entries)if(e.visible)draw(e);});
document.querySelector('#status').textContent=`${entries.length} 位角色 · 260 帧`;
function tick(time){const dt=Math.min(100,time-previous);previous=time;if(!paused&&!document.hidden)clock+=dt;for(const e of entries)if(e.visible)draw(e);requestAnimationFrame(tick);}requestAnimationFrame(tick);
