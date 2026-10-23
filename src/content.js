export const DAY_LENGTH=600;
export const WORLD={width:1536,height:1024,entry:{x:768,y:900},bar:{x:790,y:185}};
export const DRINKS={
  ale:{id:'ale',name:'琥珀麦酒',subtitle:'麦芽香气 · 微苦回甘',price:24,cost:6,brew:12,icon:0,color:'#d9b878'},
  citrus:{id:'citrus',name:'青柠气泡',subtitle:'新鲜青柠 · 清爽低甜',price:20,cost:4,brew:9,icon:1,color:'#a8be9c'},
  tea:{id:'tea',name:'晚安花茶',subtitle:'温热花香 · 不含酒精',price:18,cost:3,brew:10,icon:2,color:'#d7ab95'}
};
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
export const ROLE_NAMES={all:'全能服务',bar:'调饮专注',floor:'接待专注'};
export const CUSTOMER_NAMES=['米娅','诺亚','艾琳','林恩'];
export function staffDefinition(id){return STAFF.find(x=>x.id===id);}
export function gameClock(elapsed){const minutes=12*60+Math.floor(elapsed/DAY_LENGTH*12*60);return `${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
