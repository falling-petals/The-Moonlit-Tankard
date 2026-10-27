const SEEN='moonlit-invitation-v1';
const REDUCED=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
// 只看推门时，镜头已经推到门前，省掉从全景慢慢摇近的那一段。
const WALK_FROM=2.3;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
const clamp01=n=>n<0?0:n>1?1:n;
const ease=n=>{n=clamp01(n);return n<.5?4*n*n*n:1-Math.pow(-2*n+2,3)/2};
const lerp=(a,b,n)=>a+(b-a)*n;

// full：首次，信封 → 信纸 → 接受 → 推门。walk：之后每次开门只看推门那一段。
export function introMode(){
  try{
    const query=new URLSearchParams(location.search);
    if(query.has('intro'))return 'full';
    if(query.get('walk')==='1')return 'walk';
  }catch{}
  try{return localStorage.getItem(SEEN)==='1'?'walk':'full';}catch{return 'full';}
}
const markSeen=()=>{try{localStorage.setItem(SEEN,'1');}catch{}};

const TEMPLATE=`<div class="intro-night"><div class="intro-glow"></div><div class="intro-moon" aria-hidden="true"></div></div>
<div class="intro-envelope" aria-hidden="true"><div class="envelope-body"><div class="envelope-fold"></div><div class="envelope-flap"></div><div class="envelope-seal">☾</div></div></div>
<article class="intro-letter">
  <p class="letter-kicker">The Moonlit Tankard</p>
  <h2 class="letter-title">接手人 收</h2>
  <span class="letter-rule"></span>
  <div class="letter-body">
    <p class="letter-salute">这间酒馆，归你了。</p>
    <p class="letter-quiet">接，还是不接？</p>
  </div>
  <footer class="letter-sign"><span><b>上一位掌柜</b></span><span>钥匙在信封里</span></footer>
</article>
<div class="intro-cta-wrap"><button class="intro-cta" type="button">接受</button><span class="intro-cta-hint">点下就算数</span></div>
<button class="intro-skip" type="button">跳过序章</button>
<canvas class="intro-cinema" aria-hidden="true"></canvas>
<p class="intro-caption" role="status"></p>`;

const CAPTIONS=[
  [0.9,'门口的地灯还亮着。','序章 · 门外'],
  [2.55,'钥匙在门框上，铜的那把。',''],
  [4.15,'锁有点卡，往上抬一下。',''],
  [5.35,'门开了。灯一直没关。','序章 · 完']
];

const ART='assets/art/tavern-night.png';
const AW=1536,AH=1024;
// 双开门玻璃区（坐标量自 tavern-night.png）
const DOOR={x0:671,y0:848,x1:884,y1:919,mid:777.5};

function loadArt(){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=ART;
  });
}

function drawPortal(ctx,door){
  const {x0,y0,x1,y1}=DOOR;
  const w=x1-x0,h=y1-y0;
  ctx.save();
  ctx.beginPath();ctx.rect(x0,y0,w,h);ctx.clip();
  // 室内底色：上暖白、下转琥珀
  const g=ctx.createLinearGradient(0,y0,0,y1);
  g.addColorStop(0,'#fff6e2');g.addColorStop(.34,'#f8c885');g.addColorStop(.78,'#dd9149');g.addColorStop(1,'#8f471f');
  ctx.fillStyle=g;ctx.fillRect(x0,y0,w,h);
  // 远处吊灯光斑，制造纵深
  for(const [ox,oy,r,a] of [[-44,20,34,.7],[26,15,28,.62],[68,26,22,.5],[-72,34,20,.4]]){
    const lg=ctx.createRadialGradient(DOOR.mid+ox,y0+oy,1,DOOR.mid+ox,y0+oy,r);
    lg.addColorStop(0,`rgba(255,250,232,${a*door})`);
    lg.addColorStop(.55,`rgba(255,214,150,${a*.45*door})`);
    lg.addColorStop(1,'rgba(255,196,120,0)');
    ctx.fillStyle=lg;ctx.beginPath();ctx.arc(DOOR.mid+ox,y0+oy,r,0,6.283);ctx.fill();
  }
  // 室内地面暗边，让洞口有厚度
  const floor=ctx.createLinearGradient(0,y1-h*.22,0,y1);
  floor.addColorStop(0,'rgba(90,48,20,0)');floor.addColorStop(1,'rgba(58,28,10,.5)');
  ctx.fillStyle=floor;ctx.fillRect(x0,y1-h*.22,w,h*.22);
  // 左右门框内壁的暗过渡
  const eL=ctx.createLinearGradient(x0,0,x0+w*.11,0);
  eL.addColorStop(0,'rgba(16,22,26,.6)');eL.addColorStop(1,'rgba(16,22,26,0)');
  ctx.fillStyle=eL;ctx.fillRect(x0,y0,w*.11,h);
  const eR=ctx.createLinearGradient(x1,0,x1-w*.11,0);
  eR.addColorStop(0,'rgba(16,22,26,.6)');eR.addColorStop(1,'rgba(16,22,26,0)');
  ctx.fillStyle=eR;ctx.fillRect(x1-w*.11,y0,w*.11,h);
  ctx.restore();
}

function drawLeafs(ctx,door){
  const {x0,y0,x1,y1}=DOOR;
  const ang=door*1.22;
  const k=Math.max(.3,Math.cos(ang));
  const dip=Math.sin(ang)*.07;
  const w=(x1-x0)/2,h=y1-y0;

  const paint=()=>{
    ctx.fillStyle='#161d21';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#29333a';ctx.fillRect(2,2,w-4,h-4);
    const gy0=7,gy1=h-7;
    const gl=ctx.createLinearGradient(0,gy0,0,gy1);
    gl.addColorStop(0,'#5d8a86');gl.addColorStop(.4,'#3d6b70');gl.addColorStop(1,'#264448');
    ctx.fillStyle=gl;ctx.fillRect(7,gy0,w-14,gy1-gy0);
    ctx.fillStyle='rgba(206,236,230,.26)';ctx.fillRect(7+w*.15,gy0+3,w*.08,gy1-gy0-6);
    ctx.fillStyle='rgba(206,236,230,.12)';ctx.fillRect(7+w*.3,gy0+3,w*.04,gy1-gy0-6);
    ctx.fillStyle='rgba(8,16,18,.3)';ctx.fillRect(7,gy1-13,w-14,13);
    // 门板内边缘被室内灯照亮
    ctx.fillStyle='rgba(255,206,142,.5)';ctx.fillRect(w-4,3,2,h-6);
    ctx.fillStyle='#cba464';ctx.fillRect(w-6,h*.46,2.5,15);
  };

  const dim=Math.sin(ang)*.42;
  ctx.save();ctx.translate(x0,y0);ctx.transform(k,dip,0,1,0,0);paint();
  ctx.fillStyle=`rgba(6,10,12,${dim})`;ctx.fillRect(0,0,w,h);ctx.restore();
  ctx.save();ctx.translate(x1,y0);ctx.transform(-k,dip,0,1,0,0);paint();
  ctx.fillStyle=`rgba(6,10,12,${dim})`;ctx.fillRect(0,0,w,h);ctx.restore();
}

function drawArt(ctx,W,H,dpr,t,img){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#05080a';ctx.fillRect(0,0,W,H);

  const push=ease((t-.95)/2.7);
  const fine=ease((t-3.7)/2.3);
  const fit=Math.max(W/AW,H/AH);
  const s=fit*(lerp(1.03,2.2,push)+fine*.32);
  const sw=W/s,sh=H/s;
  const cx=lerp(768,DOOR.mid,push),cy=lerp(492,898,push);
  let sx=cx-sw/2,sy=cy-sh/2;
  sx=sw>=AW?(AW-sw)/2:Math.min(Math.max(sx,0),AW-sw);
  sy=sh>=AH?(AH-sh)/2:Math.min(Math.max(sy,0),AH-sh);

  if(img){
    ctx.drawImage(img,sx,sy,sw,sh,0,0,W,H);
  }else{
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#1b262b');g.addColorStop(1,'#080c0f');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }

  const door=ease((t-3.4)/.88);
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.scale(s,s);ctx.translate(-sx,-sy);

  if(door>0){
    drawPortal(ctx,door);
    const a=Math.min(1,door*1.3);
    // 地面光池：柔边叠层，避免出现硬梯形
    ctx.save();
    ctx.beginPath();ctx.rect(DOOR.x0-150,DOOR.y1-8,DOOR.x1-DOOR.x0+300,AH-DOOR.y1+8);ctx.clip();
    for(let i=0;i<6;i++){
      const ox=(i/5-.5)*(DOOR.x1-DOOR.x0)*.8;
      const oy=DOOR.y1+22+(i%2)*26;
      const r=132+(i%3)*22;
      const pg=ctx.createRadialGradient(DOOR.mid+ox,oy,3,DOOR.mid+ox,oy,r);
      pg.addColorStop(0,`rgba(255,220,164,${.34*a})`);
      pg.addColorStop(.42,`rgba(246,186,120,${.16*a})`);
      pg.addColorStop(1,'rgba(238,168,98,0)');
      ctx.fillStyle=pg;ctx.fillRect(DOOR.x0-150,DOOR.y1-8,DOOR.x1-DOOR.x0+300,AH-DOOR.y1+8);
    }
    // 门槛正下方的核心亮区
    const core=ctx.createLinearGradient(0,DOOR.y1-4,0,DOOR.y1+120);
    core.addColorStop(0,`rgba(255,246,222,${.62*a})`);
    core.addColorStop(.45,`rgba(255,212,150,${.24*a})`);
    core.addColorStop(1,'rgba(255,196,126,0)');
    ctx.fillStyle=core;ctx.fillRect(DOOR.x0+10,DOOR.y1-4,DOOR.x1-DOOR.x0-20,126);
    ctx.restore();
  }
  drawLeafs(ctx,door);

  // 光里的尘埃
  if(door>.25){
    ctx.save();ctx.globalAlpha=(door-.25)/.75;
    for(let i=0;i<22;i++){
      const ph=((t*.3+i*.41)%1);
      const x=DOOR.mid+Math.sin(i*2.3+t*.8)*74;
      const y=lerp(DOOR.y1+96,DOOR.y0-8,ph);
      ctx.fillStyle=`rgba(255,232,190,${.18+Math.sin(i+t*3)*.12})`;
      ctx.fillRect(x,y,1.6,1.6);
    }
    ctx.restore();
  }
  ctx.restore();

  // 暗角
  const vig=ctx.createRadialGradient(W/2,H*.5,Math.min(W,H)*.2,W/2,H*.5,Math.max(W,H)*.7);
  vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(4,7,8,.8)');
  ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
  // 遮幅
  const bar=Math.round(H*.072*ease(t/.9));
  ctx.fillStyle='#060808';ctx.fillRect(0,0,W,bar);ctx.fillRect(0,H-bar,W,bar);
  // 暖白渐显
  const white=clamp01((t-5.9)/.7)*.93;
  if(white>0){
    const wg=ctx.createRadialGradient(W/2,H*.56,0,W/2,H*.56,Math.max(W,H)*.92);
    wg.addColorStop(0,`rgba(255,246,226,${white})`);
    wg.addColorStop(1,`rgba(236,214,180,${white})`);
    ctx.fillStyle=wg;ctx.fillRect(0,0,W,H);
  }
}


function createSequence(root,onReveal,mode){
  const walk=mode==='walk';
  const from=walk?WALK_FROM:0;
  const q=s=>root.querySelector(s);
  const el={env:q('.intro-envelope'),letter:q('.intro-letter'),cta:q('.intro-cta-wrap'),ctaBtn:q('.intro-cta'),skip:q('.intro-skip'),canvas:q('.intro-cinema'),cap:q('.intro-caption'),night:q('.intro-night')};
  const ctx=el.canvas.getContext('2d');
  const artJob=loadArt();
  let W=0,H=0,dpr=1,raf=0,t0=0,artImg=null;
  const state={skipped:false,revealed:false,done:null,confirm:null};

  function size(){
    const rect=el.canvas.getBoundingClientRect();
    W=Math.max(1,rect.width||innerWidth);H=Math.max(1,rect.height||innerHeight);
    dpr=Math.min(2,window.devicePixelRatio||1);
    el.canvas.width=Math.round(W*dpr);el.canvas.height=Math.round(H*dpr);
  }

  function motes(){
    const host=el.night,frag=document.createDocumentFragment();
    for(let i=0;i<26;i++){
      const dot=document.createElement('i');dot.className='intro-mote';
      dot.style.cssText=`left:${(Math.random()*100).toFixed(2)}%;top:${(35+Math.random()*62).toFixed(2)}%;opacity:0;animation-duration:${(7+Math.random()*7).toFixed(1)}s;animation-delay:${(-Math.random()*10).toFixed(1)}s`;
      frag.append(dot);
    }
    host.append(frag);
  }
  function caption(t){
    if(t>5.8){el.cap.classList.remove('show');return;}
    let current=null;
    for(const [at,text,sub] of CAPTIONS)if(t>=at)current=[text,sub];
    if(!current){el.cap.classList.remove('show');return;}
    if(el.cap.dataset.text!==current[0]){
      el.cap.dataset.text=current[0];
      el.cap.innerHTML=`${current[0]}${current[1]?`<small>${current[1]}</small>`:''}`;
    }
    el.cap.classList.add('show');
  }

  function loop(now){
    const t=(now-t0)/1000+from;
    drawArt(ctx,W,H,dpr,t,artImg);if(!walk)caption(t);
    if(t>=6.1&&!state.revealed){state.revealed=true;onReveal?.();}
    if(t>=6.75){raf=0;el.cap.classList.remove('show');state.done?.();return;}
    raf=requestAnimationFrame(loop);
  }

  async function startCinema(){
    root.classList.add('cinema-open');
    size();
    artImg=await artJob;
    if(REDUCED){drawArt(ctx,W,H,dpr,walk?6.2:6.4,artImg);onReveal?.();state.revealed=true;return;}
    return new Promise(resolve=>{
      state.done=resolve;t0=performance.now();raf=requestAnimationFrame(loop);
    });
  }

  function finish(){
    state.skipped=true;state.confirm?.();
    root.classList.add('leaving');
    if(state.done&&!state.revealed){state.revealed=true;onReveal?.();raf&&cancelAnimationFrame(raf);raf=0;state.done();}
    else if(state.done){raf&&cancelAnimationFrame(raf);raf=0;state.done();}
  }

  root.addEventListener('click',event=>{
    if(event.target.closest('.intro-cta')){
      el.cta.classList.remove('show');el.letter.classList.remove('show');el.skip.hidden=true;
      state.confirm?.();
    }
  });
  el.skip.addEventListener('click',finish);
  const onKey=event=>{
    if(event.key==='Escape'){finish();return;}
    if(event.key==='Enter'&&document.activeElement===el.ctaBtn){event.preventDefault();el.ctaBtn.click();}
  };
  document.addEventListener('keydown',onKey);
  const onResize=()=>{if(root.classList.contains('cinema-open'))size();};
  window.addEventListener('resize',onResize);

  return {
    async play(){
      await frame();
      root.classList.add('is-in');
      if(walk){await startCinema();return;}
      motes();
      if(REDUCED){
        el.env.classList.add('drift','open');el.letter.classList.add('show');el.env.classList.add('gone');
      }else{
        await wait(50);el.env.classList.add('drift');
        await wait(2150);el.env.classList.add('open');
        await wait(640);el.letter.classList.add('show');el.env.classList.add('gone');
        await wait(880);
      }
      el.cta.classList.add('show');
      el.ctaBtn.focus({preventScroll:true});
      await new Promise(resolve=>{state.confirm=resolve;if(state.skipped)resolve();});
      if(state.skipped){document.removeEventListener('keydown',onKey);window.removeEventListener('resize',onResize);return;}
      await startCinema();
      document.removeEventListener('keydown',onKey);window.removeEventListener('resize',onResize);
    }
  };
}

export async function playIntro({mode='full',onReveal}={}){
  const host=document.querySelector('#intro-root');
  if(!host)return;
  const walk=mode==='walk';
  const root=document.createElement('div');
  root.className='intro';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');
  root.setAttribute('aria-label',walk?'月下酒馆 · 进门':'月下酒馆 · 序章');
  root.innerHTML=TEMPLATE;
  if(walk){
    root.classList.add('is-walk');
    const skip=root.querySelector('.intro-skip');
    skip.textContent='跳过';
  }
  host.replaceChildren(root);
  document.body.classList.add('intro-open');
  try{
    await createSequence(root,onReveal,mode).play();
  }finally{
    if(!walk)markSeen();
    root.classList.add('leaving');
    await wait(REDUCED?60:780);
    root.remove();
    document.body.classList.remove('intro-open');
  }
}
