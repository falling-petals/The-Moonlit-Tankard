import {DRINKS} from './content.js';

export const RARITIES={common:{name:'普通',color:'#aaa49b',probability:.55},rare:{name:'稀有',color:'#78b5e0',probability:.3},epic:{name:'史诗',color:'#c59dea',probability:.13},legendary:{name:'传说',color:'#f4c46c',probability:.02}};
export const RECIPES={
  velvetCoffee:{id:'velvetCoffee',name:'丝绒浓咖',base:'coffee',rarity:'common',description:'售价提高15%。',frame:11,brewModifier:1,priceModifier:1.15,tipModifier:1},
  berryAurora:{id:'berryAurora',name:'莓色极光',base:'berry',rarity:'rare',description:'售价提高35%。',frame:10,brewModifier:1.05,priceModifier:1.35,tipModifier:2},
  cocoaCloud:{id:'cocoaCloud',name:'云海可可',base:'cocoa',rarity:'rare',description:'售价提高40%。',frame:11,brewModifier:1.1,priceModifier:1.4,tipModifier:2},
  autumnGold:{id:'autumnGold',name:'金秋秘藏',base:'cider',rarity:'epic',description:'售价提高65%。',frame:9,brewModifier:1.15,priceModifier:1.65,tipModifier:3},
  royalMead:{id:'royalMead',name:'王庭金蜜',base:'mead',rarity:'epic',description:'售价提高75%。',frame:9,brewModifier:1.2,priceModifier:1.75,tipModifier:4},
  eclipse:{id:'eclipse',name:'月蚀之冠',base:'moonwine',rarity:'legendary',description:'售价翻倍，小费+8。',frame:9,brewModifier:1.3,priceModifier:2,tipModifier:8},
  honeyAle:{id:'honeyAle',name:'蜂蜜麦浪',base:'ale',rarity:'common',description:'柔和蜂蜜收尾，麦酒售价提高10%。',frame:9,brewModifier:1,priceModifier:1.1,tipModifier:0},
  mintCitrus:{id:'mintCitrus',name:'薄荷青柠',base:'citrus',rarity:'common',description:'清新薄荷与气泡，制作加快15%。',frame:8,brewModifier:.85,priceModifier:1,tipModifier:0},
  roseTea:{id:'roseTea',name:'玫瑰晚安',base:'tea',rarity:'common',description:'花瓣香气更温柔，每桌增加1金币小费。',frame:11,brewModifier:1,priceModifier:1.05,tipModifier:1},
  amberReserve:{id:'amberReserve',name:'月酿琥珀',base:'ale',rarity:'rare',description:'慢酿麦芽，售价提高30%，制作稍慢10%。',frame:9,brewModifier:1.1,priceModifier:1.3,tipModifier:1},
  starlitFizz:{id:'starlitFizz',name:'星光气泡',base:'citrus',rarity:'rare',description:'明亮柑橘香，售价提高25%，制作加快10%。',frame:10,brewModifier:.9,priceModifier:1.25,tipModifier:1},
  moonflower:{id:'moonflower',name:'月下花宴',base:'tea',rarity:'epic',description:'珍藏花茶，售价提高55%，每桌增加3金币小费。',frame:11,brewModifier:1.15,priceModifier:1.55,tipModifier:3}
};
export const STRATEGIES={
  quick:{id:'quick',name:'轻快出杯',brewModifier:.65,priceModifier:.9},
  premium:{id:'premium',name:'精酿慢享',brewModifier:1.25,priceModifier:1.45}
};
for(const [id,frame] of Object.entries({honeyAle:0,mintCitrus:10,roseTea:11,amberReserve:12,starlitFizz:1,moonflower:13,velvetCoffee:15,berryAurora:9,cocoaCloud:5,autumnGold:6,royalMead:7,eclipse:14}))Object.assign(RECIPES[id],{frame,atlas:'drinks-atlas'});

// Permanent: inspiration/draws/pity/collection/equipped/strategy/lastDraw.
// Daily: combo, party, cameo, goals. All times are elapsed game seconds.
// Cameo pot is deferred real drink revenue, not a bonus or a second sale.
export function createProgression(){
  return {version:1,inspiration:30,draws:0,pity:0,collection:[],equipped:null,strategy:'quick',lastDraw:null,
    combo:{count:0,best:0,expiresAt:0,tier:0,rewarded:[]},
    party:{status:'idle',startAt:0,endsAt:0,served:0,rewarded:false},
    cameo:{status:'waiting',startsAt:120,endsAt:180,pot:0,orders:0,paid:false},
    goals:{served:false,party:false}};
}
export function publicProgression(value){
  const p=value??createProgression(),c=p.combo,t=p.party,v=p.cameo;
  return {version:p.version,inspiration:p.inspiration,draws:p.draws,pity:p.pity,collection:[...p.collection],equipped:p.equipped,strategy:p.strategy,
    lastDraw:p.lastDraw?{id:p.lastDraw.id,duplicate:p.lastDraw.duplicate,rarity:p.lastDraw.rarity}:null,
    combo:{count:c.count,best:c.best,expiresAt:c.expiresAt,tier:c.tier,rewarded:[...c.rewarded]},
    party:{status:t.status,startAt:t.startAt,endsAt:t.endsAt,served:t.served,rewarded:t.rewarded},
    cameo:{status:v.status,startsAt:v.startsAt,endsAt:v.endsAt,pot:v.pot,orders:v.orders,paid:v.paid},
    goals:{served:p.goals.served,party:p.goals.party}};
}
const n=(v,max=1e9)=>Number.isFinite(v)&&v>=0&&v<=max;
const integer=(v,max=1e9)=>Number.isInteger(v)&&n(v,max);
const bool=v=>typeof v==='boolean';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const tier=count=>count>=10?10:count>=6?6:count>=3?3:0;
export function parseProgression(raw,state={}){
  if(raw===undefined){
    const p=createProgression();
    if(state.event==='tasting')p.party.status='complete';
    if(state.elapsed>=180||state.phase==='closed'){p.cameo.status='complete';p.cameo.paid=true;}
    return p;
  }
  if(!object(raw))return null;
  const p=raw,c=p.combo,t=p.party,v=p.cameo,g=p.goals;
  if(p.version!==1||!integer(p.inspiration)||!integer(p.draws)||!integer(p.pity,4)||p.pity>p.draws||
    !Array.isArray(p.collection)||p.collection.length>12||new Set(p.collection).size!==p.collection.length||
    !p.collection.every(id=>Object.hasOwn(RECIPES,id))||p.collection.length>p.draws||
    !(p.equipped===null||p.collection.includes(p.equipped))||!Object.hasOwn(STRATEGIES,p.strategy))return null;
  if(p.lastDraw!==null&&(!object(p.lastDraw)||!p.collection.includes(p.lastDraw.id)||!bool(p.lastDraw.duplicate)||RECIPES[p.lastDraw.id]?.rarity!==p.lastDraw.rarity))return null;
  if(!object(c)||!integer(c.count)||!integer(c.best)||c.count>c.best||!n(c.expiresAt,655)||c.tier!==tier(c.count)||
    !Array.isArray(c.rewarded)||c.rewarded.length>3||new Set(c.rewarded).size!==c.rewarded.length||!c.rewarded.every(x=>[3,6,10].includes(x)))return null;
  if(!object(t)||!['idle','scheduled','active','complete'].includes(t.status)||!n(t.startAt,480)||!n(t.endsAt,600)||
    !integer(t.served)||!bool(t.rewarded)||(t.rewarded&&(t.status!=='complete'||t.served<3))||
    (['scheduled','active'].includes(t.status)&&t.endsAt-t.startAt!==120))return null;
  if(!object(v)||!['waiting','active','complete'].includes(v.status)||v.startsAt!==120||v.endsAt!==180||
    !integer(v.pot,1000)||!integer(v.orders)||!bool(v.paid)||(v.paid&&v.status!=='complete')||
    (v.status==='complete'&&!v.paid)||(v.status==='waiting'&&(v.pot!==0||v.orders!==0)))return null;
  if(!object(g)||!bool(g.served)||!bool(g.party)||g.party!==t.rewarded)return null;
  return publicProgression(p);
}
export function drinkInfo(s,id){
  const base=DRINKS[id];if(!base)return undefined;
  const p=s.progression??createProgression(),strategy=STRATEGIES[p.strategy]??STRATEGIES.quick;
  const selected=RECIPES[p.equipped],recipe=selected?.base===id?selected:null;
  return {...base,name:recipe?.name??base.name,price:Math.round(base.price*strategy.priceModifier*(recipe?.priceModifier??1)),
    brew:base.brew*strategy.brewModifier*(recipe?.brewModifier??1),tipModifier:recipe?.tipModifier??0,
    ...(recipe?{recipeFrame:recipe.frame,recipeAtlas:recipe.atlas}: {})};
}
