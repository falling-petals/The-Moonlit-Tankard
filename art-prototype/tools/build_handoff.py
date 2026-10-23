"""Build deterministic map data and technical diagram (not generated concept art)."""
from pathlib import Path
from collections import deque
import json, html
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PALETTE = [
    ('午夜蓝', '#182535', '夜景、UI底色'), ('墨色', '#151923', '轮廓与最深阴影'),
    ('胡桃木', '#352A28', '墙体、木器暗部'), ('暖橡木', '#895638', '木地板与桌面'),
    ('琥珀', '#D99B45', '烛光、金币、选中'), ('羊皮纸', '#E9D7AC', '正文、高光'),
    ('鼠尾草', '#7F9373', '员工服、确认'), ('砖红', '#A35445', '灶炉、紧急状态'),
    ('月光蓝', '#8BA9BC', '窗光、次级信息')]

def room(id, name, x, y, w, h, color):
    return dict(id=id, name=name, x=x, y=y, w=w, h=h, color=color)

def make_floor(id, w, h):
    walls = {(x,y) for x in range(w) for y in range(h) if x in (0,w-1) or y in (0,h-1)}
    return dict(id=id, width=w, height=h, tileSize=16, rooms=[], objects=[], doors=[],
                transitions=[], walls=walls, spawn=[w//2,h-2])

def obj(f, id, name, x,y,w=1,h=1, approach=None, kind='furniture', solid=True):
    f['objects'].append(dict(id=id,name=name,x=x,y=y,w=w,h=h,solid=solid,kind=kind,
                            interactionTile=approach))

g = make_floor('ground',32,24)
g['spawn']=[15,22]
g['rooms']=[room('pantry','储藏室',1,1,10,6,'#596450'),room('kitchen','后厨',12,1,14,6,'#725047'),
            room('stairs','楼梯间',27,1,4,6,'#4B6678'),room('bar','吧台工作区',7,8,18,4,'#916438'),
            room('hall','大厅与座位区',1,12,30,11,'#6D4A36')]
g['walls'].update((x,7) for x in range(1,31))
g['walls'].update((11,y) for y in range(1,7))
g['walls'].update((26,y) for y in range(1,7))
for id,name,tiles in [('pantry-door','储藏室门',[[6,7],[7,7]]),('kitchen-door','后厨门',[[19,7],[20,7]]),
                      ('stairs-door','楼梯门',[[26,4]]),('entry','南侧入口',[[15,23],[16,23]])]:
    for xy in tiles: g['walls'].discard(tuple(xy))
    g['doors'].append(dict(id=id,name=name,tiles=tiles,open=True))
obj(g,'pantry-shelf','干货架',2,1,7,1,[6,2])
obj(g,'grain-crates','粮袋与木箱',2,4,2,2,[4,4])
obj(g,'reserve-ale','备用酒桶',8,4,2,2,[7,4])
obj(g,'oven','石砖烤炉',13,1,3,2,[14,3])
obj(g,'prep','备餐台',18,2,4,1,[19,3])
obj(g,'sink','清洗台',23,2,2,2,[23,4])
obj(g,'stairs-down','下行楼梯',28,2,2,3,[28,5],kind='transition')
obj(g,'bar','长吧台',8,9,16,2,[12,11])
obj(g,'hearth','大厅壁炉',1,11,2,3,[3,12])
for i,x in enumerate((10,13,18,21),1): obj(g,f'stool-{i}','吧凳',x,11,approach=[x,12],kind='seat')
for i,(x,y) in enumerate([(5,13),(23,13),(5,17),(23,17),(10,20),(19,20)],1):
    obj(g,f'table-{i:02}','餐桌',x,y,2,2,[x,y-1],kind='table')
    obj(g,f'chair-{i}-l','餐椅',x-1,y,approach=[x-1,y+1],kind='seat')
    obj(g,f'chair-{i}-r','餐椅',x+2,y,approach=[x+2,y+1],kind='seat')
g['servicePoints']=[dict(id='bar-staff',tile=[12,8]),dict(id='bar-pickup',tile=[12,11]),
                     dict(id='kitchen-pickup',tile=[19,6]),dict(id='queue',tile=[16,20])]
g['transitions']=[dict(id='to-cellar',tile=[28,5],targetFloor='cellar',targetTile=[13,4])]

c=make_floor('cellar',16,12)
c['spawn']=[13,4]
c['rooms']=[room('cellar','地窖',1,1,14,10,'#45515B')]
obj(c,'stairs-up','上行楼梯',12,1,2,3,[13,4],kind='transition')
for i,x in enumerate((2,5,8),1): obj(c,f'cask-{i}','大型熟成酒桶',x,1,2,2,[x,3])
for i,x in enumerate((2,5,8),1): obj(c,f'keg-{i}','发酵酒桶',x,7,2,2,[x,6])
obj(c,'bottle-rack','瓶装酒架',1,4,1,2,[2,4])
obj(c,'cellar-crates','储物箱',12,8,2,2,[12,7])
c['servicePoints']=[]
c['transitions']=[dict(id='to-ground',tile=[13,4],targetFloor='ground',targetTile=[28,5])]

def finalize(f):
    w,h=f['width'],f['height']; occ=set(f['walls'])
    for o in f['objects']:
        if o['solid']:
            cells={(x,y) for x in range(o['x'],o['x']+o['w']) for y in range(o['y'],o['y']+o['h'])}
            assert not cells & occ, f"overlap {o['id']}"
            assert all(0<=x<w and 0<=y<h for x,y in cells)
            occ.update(cells)
    f['collision']=[[int((x,y) in occ) for x in range(w)] for y in range(h)]
    reachable={tuple(f['spawn'])}; queue=deque(reachable)
    while queue:
        x,y=queue.popleft()
        for xy in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
            a,b=xy
            if 0<=a<w and 0<=b<h and xy not in occ and xy not in reachable:
                reachable.add(xy);queue.append(xy)
    targets=[(o['id'],o['interactionTile']) for o in f['objects'] if o['interactionTile']]
    targets += [(s['id'],s['tile']) for s in f['servicePoints']+f['transitions']]
    targets += [(d['id'],t) for d in f['doors'] for t in d['tiles']]
    for name,t in targets: assert tuple(t) in reachable, f'unreachable {f["id"]}/{name}: {t}'
    f['walls']=[list(p) for p in sorted(f['walls'], key=lambda p:(p[1],p[0]))]
    return dict(floor=f['id'],reachableTiles=len(reachable),interactionTargets=len(targets),allReachable=True)

checks=[finalize(g),finalize(c)]
data=dict(title='月光酒馆',version='1.0',coordinateSystem='zero-based x=column y=row; origin top-left; rectangles half-open',
          palette=[dict(name=n,hex=h,usage=u) for n,h,u in PALETTE],floors=[g,c],
          layers=['ground','decals','wall-base','objects-base','actors-ysort','objects-overhead','lighting','world-ui','screen-ui'])
for f in data['floors']:
    for t in f['transitions']:
        target=next(x for x in data['floors'] if x['id']==t['targetFloor'])
        x,y=t['targetTile'];assert target['collision'][y][x]==0
(ROOT/'data'/'tavern-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'data'/'map-data.js').write_text('window.TAVERN_MAP = '+json.dumps(data,ensure_ascii=False)+';',encoding='utf-8')
(ROOT/'data'/'validation.json').write_text(json.dumps(dict(mapChecks=checks,transitionsValid=True),indent=2),encoding='utf-8')

FONT = Path('C:/Windows/Fonts/msyh.ttc')
def font(size): return ImageFont.truetype(str(FONT),size)

def render(f):
    s=36;ox,oy=70,120;w=ox*2+f['width']*s;h=oy+f['height']*s+110
    im=Image.new('RGB',(w,h),'#182535');d=ImageDraw.Draw(im)
    d.text((ox,24),'月光酒馆 / '+('地面层' if f['id']=='ground' else '地窖')+' · 精确网格图',font=font(28),fill='#E9D7AC')
    d.text((ox,65),f'{f["width"]} × {f["height"]} 格  |  1格 = 16逻辑像素  |  原点左上，坐标从0开始',font=font(16),fill='#8BA9BC')
    for y in range(f['height']):
        for x in range(f['width']):
            color='#352A28'
            for r in f['rooms']:
                if r['x']<=x<r['x']+r['w'] and r['y']<=y<r['y']+r['h']:color=r['color']
            if [x,y] in f['walls']:color='#151923'
            d.rectangle((ox+x*s,oy+y*s,ox+(x+1)*s,oy+(y+1)*s),fill=color,outline='#283342')
    for x in range(f['width']):d.text((ox+x*s+9,oy-24),str(x),font=font(12),fill='#8BA9BC')
    for y in range(f['height']):d.text((ox-28,oy+y*s+9),str(y),font=font(12),fill='#8BA9BC')
    for r in f['rooms']:
        d.text((ox+r['x']*s+6,oy+(r['y']+r['h']-1)*s+8),r['name'],font=font(16),fill='#E9D7AC')
    for o in f['objects']:
        x,y=ox+o['x']*s,oy+o['y']*s
        d.rectangle((x+3,y+3,x+o['w']*s-3,y+o['h']*s-3),fill='#895638',outline='#D99B45',width=2)
        label=o['id'].replace('table-','T').replace('chair-','C').replace('stool-','S')
        if o['w']>=2:d.text((x+5,y+5),label,font=font(12),fill='#E9D7AC')
        if o['interactionTile']:
            a,b=o['interactionTile'];cx,cy=ox+a*s+s//2,oy+b*s+s//2
            d.ellipse((cx-4,cy-4,cx+4,cy+4),fill='#7F9373')
    for door in f['doors']:
        for a,b in door['tiles']:
            d.rectangle((ox+a*s+3,oy+b*s+3,ox+(a+1)*s-3,oy+(b+1)*s-3),outline='#8BA9BC',width=3)
    for t in f['transitions']:
        a,b=t['tile'];d.text((ox+a*s+7,oy+b*s+6),'⇅',font=font(20),fill='#8BA9BC')
    x,y=f['spawn'];d.rectangle((ox+x*s+11,oy+y*s+11,ox+x*s+25,oy+y*s+25),fill='#E9D7AC')
    d.text((ox,h-82),'琥珀框：家具占格    绿点：交互站位    蓝框：门洞    米色方块：出生点',font=font(17),fill='#E9D7AC')
    d.text((ox,h-48),'通行以 collision[y][x] 为准；四向寻路；角色脚底点参与排序。',font=font(15),fill='#8BA9BC')
    im.save(ROOT/'boards'/('07-grid-'+f['id']+'.png'))

for f in data['floors']:render(f)
print(json.dumps(checks))
