"""Inspect generated atlases and build a lossless runtime coordinate manifest.

Only reads source images; never crops, resizes or overwrites generated artwork.
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    'player-atlas': ['店长正面', '店长背面', '店长向左', '店长向右'],
    'staff-atlas': ['青芽', '团团', '星禾', '弦月'],
    'customers-atlas': ['米娅', '诺亚', '艾琳', '林恩'],
    'furniture-atlas': ['方桌', '圆桌', '餐椅', '吧凳', '绿植', '球灯', '服务车', '酒柜', '酒头', '咖啡机', '原料箱', '冰柜', '酒桶', '沙发', '地毯', '招牌'],
    'items-atlas': ['琥珀麦酒', '青柠气泡', '晚安花茶', '咖啡', '啤酒花', '柑橘', '茶叶', '水', '谷物', '纸袋', '托盘', '金币', '声望', '好感', '笔记', '时钟'],
}
FILES = ['tavern-day', 'tavern-night', 'staff-atlas', 'customers-atlas', 'player-atlas', 'furniture-atlas', 'items-atlas', 'zone-studies']
manifest = {'version': 1, 'world': {'width': 1536, 'height': 1024}, 'assets': {}}
for name in FILES:
    path = ROOT/'assets'/'art'/(name+'.png')
    if not path.exists():
        raise SystemExit('Missing asset: '+name)
    with Image.open(path) as im:
        entry = {'src': 'assets/art/'+name+'.png', 'width': im.width, 'height': im.height}
        if name.endswith('atlas'):
            assert im.mode == 'RGBA', f'{name}: real alpha required, got {im.mode}'
            alpha=im.getchannel('A')
            assert alpha.getextrema()[0] == 0, f'{name}: transparent background required'
            entry.update(columns=4,rows=4,frames=[])
            for row in range(4):
                for col in range(4):
                    x,y=round(col*im.width/4),round(row*im.height/4)
                    right,bottom=round((col+1)*im.width/4),round((row+1)*im.height/4)
                    bbox=alpha.crop((x,y,right,bottom)).point(lambda a: 255 if a>40 else 0).getbbox()
                    assert bbox, f'{name} empty cell {col},{row}'
                    a,b,c,d=bbox
                    label=NAMES[name][col] if name in ('staff-atlas','customers-atlas','player-atlas') else NAMES[name][row*4+col]
                    entry['frames'].append({'column':col,'row':row,'name':label,'cell':[x,y,right-x,bottom-y],
                                            'rect':[x+a,y+b,c-a,d-b]})
            entry['transparentPixelFraction']=round(alpha.histogram()[0]/(im.width*im.height),3)
        manifest['assets'][name]=entry
(ROOT/'assets'/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
cards=[]
labels=['日景空场','夜景空场','AI店员 · 4角色×4状态','顾客 · 4人物×4状态','人类店长 · 4方向×4状态','家具与设施 · 16件','饮品与物品 · 16件','四区场景参考']
for name,label in zip(FILES,labels):
    e=manifest['assets'][name]
    cards.append(f'<section><div class="title"><h2>{label}</h2><a href="art/{name}.png" target="_blank">查看原图 ↗</a></div><div class="art"><img src="art/{name}.png" alt="{label}"></div><p>{name}.png · {e["width"]} × {e["height"]} px'+(' · RGBA透明图集' if name.endswith('atlas') else '')+'</p></section>')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月下酒馆 · 美术资产图册</title><style>
*{box-sizing:border-box}body{margin:0;background:#101c20;color:#efe5d0;font:15px/1.7 "Microsoft YaHei",sans-serif}header,main,footer{max-width:1320px;margin:auto;padding:36px}header{border-bottom:1px solid #41524a}small{letter-spacing:3px;color:#d9b878}h1{font-family:Georgia,"Microsoft YaHei",serif;font-size:40px;margin:14px 0}h2{font-size:19px;font-weight:500}a{color:#a8be9c;text-decoration:none}p{color:#94a8a3}main{display:grid;grid-template-columns:1fr 1fr;gap:28px}section{min-width:0}.title{display:flex;align-items:center;justify-content:space-between;gap:12px}.art{background-color:#203236;background-image:linear-gradient(45deg,#ffffff05 25%,transparent 25%),linear-gradient(-45deg,#ffffff05 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ffffff05 75%),linear-gradient(-45deg,transparent 75%,#ffffff05 75%);background-size:24px 24px;padding:10px;border:1px solid #41524a}img{width:100%;display:block;image-rendering:pixelated}section:last-child{grid-column:1/-1}.links{display:flex;gap:24px;flex-wrap:wrap}@media(max-width:700px){main{grid-template-columns:1fr}header,main{padding:20px}}@media print{body{background:white;color:black}section{break-inside:avoid}header a{display:none}}
</style><header><small>THE MOONLIT TANKARD / ASSET LIBRARY</small><h1>一间温室，两种月色。</h1><p>现代像素酒馆 · 原始PNG、透明图集与可复用坐标。原创AI店员可在后续替换为你提供的形象。</p><div class="links"><a href="../index.html">← 返回游戏</a><a href="manifest.json">图集坐标 JSON</a><a href="../docs/art-guide.md">中文视觉规范</a><a href="../art-prototype/final/generation-prompts.json">生成提示词</a></div></header><main>'''+''.join(cards)+'''</main><footer><p>概念构图与像素簇用于美术参考；精灵切片和交互坐标由manifest与游戏配置确定。生成使用内置image_gen，原图完整保留。</p></footer></html>'''
(ROOT/'assets'/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({name:{'size':[e['width'],e['height']],'frames':len(e.get('frames',[])), 'transparent':e.get('transparentPixelFraction')} for name,e in manifest['assets'].items()}))
