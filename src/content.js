export const DAY_LENGTH=600;
export const WORLD={width:1536,height:1024,entry:{x:768,y:900},bar:{x:790,y:185},pass:{x:1080,y:355}};
export const DRINKS={
  coffee:{id:'coffee',name:'炉火咖啡',subtitle:'现磨深焙',price:30,cost:8,brew:14,icon:2,color:'#916448'},
  berry:{id:'berry',name:'莓果冰露',subtitle:'酸甜果香',price:34,cost:9,brew:16,icon:1,color:'#bd6484'},
  cocoa:{id:'cocoa',name:'云顶可可',subtitle:'浓厚热饮',price:38,cost:10,brew:18,icon:2,color:'#956345'},
  cider:{id:'cider',name:'秋苹果酒',subtitle:'清爽果酒',price:42,cost:12,brew:19,icon:0,color:'#d59c47'},
  mead:{id:'mead',name:'金蜜陈酿',subtitle:'温润醇香',price:50,cost:15,brew:23,icon:0,color:'#e1bc60'},
  moonwine:{id:'moonwine',name:'月影珍酿',subtitle:'珍藏葡萄',price:64,cost:20,brew:28,icon:0,color:'#99659a'},
  ale:{id:'ale',name:'琥珀麦酒',subtitle:'麦芽香气 · 微苦回甘',price:24,cost:6,brew:12,icon:0,color:'#d9b878'},
  citrus:{id:'citrus',name:'青柠气泡',subtitle:'新鲜青柠 · 清爽低甜',price:20,cost:4,brew:9,icon:1,color:'#a8be9c'},
  tea:{id:'tea',name:'晚安花茶',subtitle:'温热花香 · 不含酒精',price:18,cost:3,brew:10,icon:2,color:'#d7ab95'}
};
for(const [id,artFrame] of Object.entries({ale:0,citrus:1,tea:2,coffee:3,berry:4,cocoa:5,cider:6,mead:7,moonwine:8}))DRINKS[id].artFrame=artFrame;
export const STAFF=[
  {id:'qingya',name:'青芽',title:'温柔的全能伙伴',personality:'温和、细心，关心客人的感受。说话简短自然，遇到繁忙也沉着。喜欢植物和温热的茶。',color:'#a8be9c',column:0,hireCost:0,wage:18,pace:1,skill:'细心接待',greeting:'窗边的阳光正好。准备好开门了吗？'},
  {id:'tuantuan',name:'团团',title:'热情的调饮能手',personality:'热情直率、行动快，喜欢研究饮品配方。会开温暖的小玩笑，对工作认真，愿意帮同事。',color:'#df947d',column:1,hireCost:180,wage:22,pace:1.18,skill:'快速调饮',greeting:'杯子擦亮了！今天一起调出好心情。'},
  {id:'xinghe',name:'星禾',title:'好奇的气氛担当',personality:'好奇、活泼，喜欢音乐与尝试新口味。善于发起同事聊天和主题活动，表达轻快但不过分吵闹。',color:'#7dcbd0',column:2,hireCost:240,wage:26,pace:1.08,skill:'灵感与活动',greeting:'今晚的雨声，适合配一场小小的品饮会。'},
  {id:'xianyue',name:'弦月',title:'安静的夜班伙伴',personality:'安静、观察敏锐，习惯先听再说，喜欢夜景、阅读和有序的库存。文字有一点诗意但不长篇。',color:'#bdace3',column:3,hireCost:280,wage:24,pace:1.12,skill:'从容服务',greeting:'夜色还早，我会照看好每一桌。'}
];
export const UPGRADES={
  bar:{id:'bar',name:'精密调饮台',cost:120,description:'制作时间缩短 25%，忙时更从容。',icon:'cup'},
  ambience:{id:'ambience',name:'柔光与音乐',cost:160,description:'每笔满意订单增加 2 金币小费。',icon:'lamp'},
  cellar:{id:'cellar',name:'扩容储藏柜',cost:140,description:'每款饮品的备货上限从 24 提升至 40。',icon:'box'},
  plants:{id:'plants',name:'窗边绿意',cost:60,description:'增添室内绿植，顾客耐心增加 30 秒。',icon:'leaf'}
};
export const TABLE_LAYOUT=[{id:'t1',x:420,y:470,shape:0},{id:'t2',x:1110,y:470,shape:1},{id:'t3',x:420,y:705,shape:1},{id:'t4',x:1110,y:705,shape:0}];
export const ROLE_NAMES={all:'全能 · 较慢',bar:'厨师 · 制作',floor:'服务员 · 送餐收桌'};
export const TABLE_COSTS=[0,0,240,720,2160,6480];
export const MAX_STAFF=3;
export const REQUESTS={
  lowSugar:{id:'lowSugar',name:'少糖',description:'制作慢20%，满意小费+5。',brewModifier:1.2,tip:5,patience:0},
  warm:{id:'warm',name:'温热',description:'制作慢30%，耐心+20秒，小费+6。',brewModifier:1.3,tip:6,patience:20},
  express:{id:'express',name:'赶时间',description:'制作快25%，售价减少10%，小费+3。',brewModifier:.75,priceModifier:.9,tip:3,patience:0}
};
Object.assign(STAFF[0],{defaultRole:'all',autoRequests:true,brewPace:1,walkPace:1,cleanPace:1,tipBonus:1,traitDescription:'细心：调饮时自动回应要求，每单小费+1；全能工作较慢。'});
Object.assign(STAFF[1],{defaultRole:'bar',brewPace:1.3,walkPace:1,cleanPace:1,tipBonus:0,traitDescription:'调饮速度+30%，适合厨房。'});
Object.assign(STAFF[2],{defaultRole:'floor',brewPace:1,walkPace:1.2,cleanPace:1,tipBonus:3,traitDescription:'步速+20%，每单小费+3。'});
Object.assign(STAFF[3],{defaultRole:'floor',brewPace:1,walkPace:1.1,cleanPace:1.6,tipBonus:0,traitDescription:'步速+10%，清洁速度+60%。'});
TABLE_LAYOUT.push({id:'t5',x:765,y:470,shape:0},{id:'t6',x:765,y:705,shape:1});
export const CUSTOMER_NAMES=['米娅','诺亚','艾琳','林恩'];
export function staffDefinition(id){return STAFF.find(x=>x.id===id);}
export function gameClock(elapsed){const minutes=12*60+Math.floor(elapsed/DAY_LENGTH*12*60);return `${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
// 口碑换成星。4.2 是街坊早给的底子，后面三颗要自己挣，一晚最多点亮一颗。
export const STAR_BASE=2;
export const STAR_STEPS=[
  {star:3,rep:4.5,id:'cellar',name:'有人愿意等',opens:'地窖'},
  {star:4,rep:4.8,id:'regulars',name:'常客的名字',opens:'熟客的记忆'},
  {star:5,rep:5,id:'moonlit',name:'月烛',opens:'这一夜的收束'}
];
export function starTier(rep){let n=STAR_BASE;for(const step of STAR_STEPS)if(rep>=step.rep)n=step.star;return n;}
// 地窖：酒在桶里睡一夜才变好。占着桶位、也占着本可以今晚卖掉的库存。
export const CELLAR={maxLevel:3,perCask:6,baseSlots:2,extraSlots:2,priceStep:.18,tipStep:1};
export const cellarSlots=s=>CELLAR.baseSlots+(s?.upgrades?.cellar?CELLAR.extraSlots:0);
export const caskBonus=level=>1+CELLAR.priceStep*(level||0);
export const caskPercent=level=>Math.round(CELLAR.priceStep*100*(level||0));
