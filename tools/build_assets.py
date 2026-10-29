"""Inspect generated atlases and build a lossless runtime coordinate manifest.

Only reads source images; never crops, resizes or overwrites generated artwork.
"""
from pathlib import Path
from PIL import Image
import json
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    'player-atlas': ['店长正面', '店长背面', '店长向左', '店长向右'],
    'staff-atlas': ['青芽', '团团', '星禾', '弦月'],
    'customers-atlas': ['米娅', '诺亚', '艾琳', '林恩'],
    'furniture-atlas': ['方桌', '圆桌', '餐椅', '吧凳', '绿植', '球灯', '服务车', '酒柜', '酒头', '咖啡机', '原料箱', '冰柜', '酒桶', '沙发', '地毯', '招牌'],
    'items-atlas': ['琥珀麦酒', '青柠气泡', '晚安花茶', '咖啡', '啤酒花', '柑橘', '茶叶', '水', '谷物', '纸袋', '托盘', '金币', '声望', '好感', '笔记', '时钟'],
    'event-atlas': ['买单客串正面', '买单客串行走一', '买单客串行走二', '买单客串背面', '全场买单账单', '派对入场券', '配方书', '灵感星光', '青柠特调', '琥珀特调', '派对特调', '花茶特调', '派对彩纸', '黑胶唱片', '金币爆发', '调饮杯'],
    'drinks-atlas': ['琥珀麦酒', '青柠气泡', '晚安花茶', '炉火咖啡', '莓果冰露', '云顶可可', '秋苹果酒', '金蜜陈酿', '月影珍酿', '莓色极光', '薄荷青柠', '玫瑰晚安', '月酿琥珀', '月下花宴', '月蚀之冠', '丝绒浓咖'],
}
FILES = ['tavern-day', 'tavern-night', 'staff-atlas', 'customers-atlas', 'player-atlas', 'furniture-atlas', 'items-atlas', 'event-atlas', 'drinks-atlas', 'zone-studies']
CREW = {'deepseek':'DeepSeek 鲸鱼娘','qwen':'Qwen 千问娘','z':'Z 智谱娘','gpt':'GPT 白龙娘','claude':'Claude 橙发圣女','gemini':'Gemini 哈基米','wenxin':'文心娘','tom':'Tom 捕鼠伙伴','kimi':'Kimi 月光少女','support':'Tencent / Grok / Mistral / Seed 备用角色','mouse':'地窖小鼠'}
FILES += ['crew-'+name+'-atlas' for name in CREW if (ROOT/'assets/art'/('crew-'+name+'-atlas.png')).exists()]
if (ROOT/'assets/art/community-lineup.png').exists():FILES.append('community-lineup')
EXTENSIONS = {'cellar-room': 'jpg'}
if (ROOT/'assets/art/cellar-room.jpg').exists():FILES.append('cellar-room')
MOTION_CREW={**{k:v for k,v in CREW.items() if k not in ('support','mouse')},'tencent':'Tencent','grok':'Grok','mistral':'Mistral','seed':'Seed'}
MOTION_NAMES=['正面站立','正面走 A','正面走 B','眨眼','背面站立','背面走 A','背面走 B','高兴','左侧站立','左侧走 A','左侧走 B','难过','右侧站立','右侧走 A','右侧走 B','生气','思考','惊讶','工作','疲倦']
MOTION_BOUNDS=json.loads((ROOT/'art-prototype/final/2026-10-28-motion-frame-bounds.json').read_text(encoding='utf-8'))['assets']
LEGACY_BOUNDS=json.loads((ROOT/'art-prototype/final/2026-10-28-legacy-frame-bounds.json').read_text(encoding='utf-8'))['assets']
FILES += ['crew-'+name+'-motion-v2-atlas' for name in MOTION_CREW if (ROOT/'assets/art'/('crew-'+name+'-motion-v2-atlas.png')).exists()]
manifest = {'version': 1, 'world': {'width': 1536, 'height': 1024}, 'assets': {}}
for name in FILES:
    filename = name + '.' + EXTENSIONS.get(name, 'png')
    path = ROOT/'assets'/'art'/filename
    if not path.exists():
        raise SystemExit('Missing asset: '+name)
    with Image.open(path) as im:
        entry = {'src': 'assets/art/'+filename, 'width': im.width, 'height': im.height}
        if name == 'cellar-room':
            entry.update(sourceRect=[24, 21, 816, 530], worldSize=[816, 530])
        if name.endswith('atlas'):
            assert im.mode == 'RGBA', f'{name}: real alpha required, got {im.mode}'
            alpha=im.getchannel('A')
            assert alpha.getextrema()[0] == 0, f'{name}: transparent background required'
            motion=name.endswith('-motion-v2-atlas')
            cols,rows=(4,5) if motion else (2,2) if name.startswith('crew-') else (4,4)
            entry.update(columns=cols,rows=rows,frames=[])
            for row in range(rows):
                for col in range(cols):
                    x,y=round(col*im.width/cols),round(row*im.height/rows)
                    right,bottom=round((col+1)*im.width/cols),round((row+1)*im.height/rows)
                    if name=='crew-mouse-atlas' and row==1:
                        bands=[0,735,im.width];x,right=bands[col],bands[col+1]
                    # The generated event sheet uses uneven row spacing: boots and
                    # a book strap cross nominal quarter boundaries. Read complete
                    # sprites from the transparent gaps, leaving the PNG untouched.
                    if name == 'event-atlas':
                        bands = [0, 365, 650, 940, im.height]
                        y, bottom = bands[row], bands[row + 1]
                    if name == 'drinks-atlas':
                        bands = [0, 343, 630, 915, im.height]
                        y, bottom = bands[row], bands[row + 1]
                    if name in LEGACY_BOUNDS:
                        # Shoes and sofa/rug borders cross the nominal grid.
                        # Read each complete sprite between transparent gaps.
                        x, y, width, height = LEGACY_BOUNDS[name]['cells'][row * cols + col]
                        right, bottom = x + width, y + height
                    bbox=alpha.crop((x,y,right,bottom)).point(lambda a: 255 if a>40 else 0).getbbox()
                    assert bbox, f'{name} empty cell {col},{row}'
                    a,b,c,d=bbox
                    label=(MOTION_NAMES[row*4+col] if motion else ['正面待机','行走 A','行走 B','背面待机'][row*2+col] if name.startswith('crew-') else NAMES[name][col] if name in ('staff-atlas','customers-atlas','player-atlas') else NAMES[name][row*4+col])
                    if name=='crew-support-atlas':label=['Tencent','Grok','Mistral','Seed'][row*2+col]
                    if name=='crew-mouse-atlas':label=['待机','小跑 A','小跑 B','惊讶'][row*2+col]
                    if motion:
                        # Generated heads and shoes can cross nominal grid lines.
                        # Use inspected complete-body coordinates, leaving PNG intact.
                        sx,sy,sw,sh=MOTION_BOUNDS[name][row*4+col]
                        x,y,right,bottom=sx,sy,sx+sw,sy+sh
                        a,b,c,d=0,0,sw,sh
                    entry['frames'].append({'column':col,'row':row,'name':label,'cell':[x,y,right-x,bottom-y],
                                            'rect':[x+a,y+b,c-a,d-b],**({'anchor':[(right-x)/2-a,d-b]} if motion else {})})
            if motion:
                entry.update(layout='crew-motion-v2',referenceHeight=round(median(entry['frames'][i]['rect'][3] for i in (0,4,8,12))),
                    directions={'down':[0,1,2],'up':[4,5,6],'left':[8,9,10],'right':[12,13,14]},
                    expressions={'neutral':0,'blink':3,'happy':7,'sad':11,'angry':15,'thinking':16,'surprised':17,'working':18,'tired':19})
            entry['transparentPixelFraction']=round(alpha.histogram()[0]/(im.width*im.height),3)
        manifest['assets'][name]=entry
(ROOT/'assets'/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
cards=[]
labels=['日景空场','夜景空场','AI店员 · 4角色×4状态','顾客 · 4人物×4状态','人类店长 · 4方向×4状态','家具与设施 · 16件','饮品与物品 · 16件','买单客串、配方与派对 · 16件','经营饮品与珍藏特调 · 16件','四区场景参考']
labels += ['用户提供的地窖房间参考' if name == 'cellar-room' else MOTION_CREW[name[5:-16]]+' · 四向行走与八种表情' if name.endswith('-motion-v2-atlas') else CREW[name[5:-6]]+' · 四动作' if name.startswith('crew-') else '用户提供的酒窖地图 · 实际工作场景' if name=='cellar-room' else '用户提供的社区角色像素参考 · DeepSeek / 文心 / Z / Tencent / Grok / Mistral / Seed' for name in FILES[10:]]
for name,label in zip(FILES,labels):
    e=manifest['assets'][name]
    filename = name + '.' + EXTENSIONS.get(name, 'png')
    cards.append(f'<section><div class="title"><h2>{label}</h2><a href="art/{filename}" target="_blank">查看原图 ↗</a></div><div class="art"><img src="art/{filename}" alt="{label}"></div><p>{filename} · {e["width"]} × {e["height"]} px'+(' · RGBA透明图集' if name.endswith('atlas') else '')+'</p></section>')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月下酒馆 · 美术资产图册</title><style>
*{box-sizing:border-box}body{margin:0;background:#101c20;color:#efe5d0;font:15px/1.7 "Microsoft YaHei",sans-serif}header,main,footer{max-width:1320px;margin:auto;padding:36px}header{border-bottom:1px solid #41524a}small{letter-spacing:3px;color:#d9b878}h1{font-family:Georgia,"Microsoft YaHei",serif;font-size:40px;margin:14px 0}h2{font-size:19px;font-weight:500}a{color:#a8be9c;text-decoration:none}p{color:#94a8a3}main{display:grid;grid-template-columns:1fr 1fr;gap:28px}section{min-width:0}.title{display:flex;align-items:center;justify-content:space-between;gap:12px}.art{background-color:#203236;background-image:linear-gradient(45deg,#ffffff05 25%,transparent 25%),linear-gradient(-45deg,#ffffff05 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ffffff05 75%),linear-gradient(-45deg,transparent 75%,#ffffff05 75%);background-size:24px 24px;padding:10px;border:1px solid #41524a}img{width:100%;display:block;image-rendering:pixelated}section:last-child{grid-column:1/-1}.links{display:flex;gap:24px;flex-wrap:wrap}@media(max-width:700px){main{grid-template-columns:1fr}header,main{padding:20px}}@media print{body{background:white;color:black}section{break-inside:avoid}header a{display:none}}
</style><header><small>THE MOONLIT TANKARD / ASSET LIBRARY</small><h1>一间温室，两种月色。</h1><p>现代像素酒馆 · 原始PNG、透明图集与可复用坐标。角色参考由玩家提供；已完成像素化并接入店员与地窖伙伴。</p><div class="links"><a href="../index.html">← 返回游戏</a><a href="characters.html">角色动作与表情预览</a><a href="manifest.json">图集坐标 JSON</a><a href="../docs/art-guide.md">中文视觉规范</a><a href="../art-prototype/final/generation-prompts.json">生成提示词</a></div></header><main>'''+''.join(cards)+'''</main><footer><p>概念构图与像素簇用于美术参考；精灵切片和交互坐标由manifest与游戏配置确定。生成使用内置image_gen，原图完整保留。</p></footer></html>'''
(ROOT/'assets'/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({name:{'size':[e['width'],e['height']],'frames':len(e.get('frames',[])), 'transparent':e.get('transparentPixelFraction')} for name,e in manifest['assets'].items()}))
