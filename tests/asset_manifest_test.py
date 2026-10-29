"""Source-coordinate regression for the generated party atlas, without editing pixels."""
from pathlib import Path
import json
import unittest
import hashlib
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class EventAtlasCoordinates(unittest.TestCase):
    def test_legacy_coordinate_fixes_preserve_original_source_bytes(self):
        records = json.loads((ROOT / 'art-prototype/final/2026-10-28-legacy-frame-bounds.json').read_text(encoding='utf-8'))['assets']
        for name, record in records.items():
            self.assertEqual(hashlib.sha256((ROOT / 'assets/art' / (name + '.png')).read_bytes()).hexdigest(), record['sha256'])

    def test_rug_reads_whole_rug_without_the_sofa_leg(self):
        frames = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']['furniture-atlas']['frames']
        x, y, w, h = frames[14]['rect']
        self.assertGreaterEqual(x, 681, 'the rug must exclude the sofa leg ending at x=637')
        self.assertEqual(x + w, 963, 'the rug right border crosses the nominal x=940 cell edge')
        self.assertEqual((y, h), (988, 185), 'keep the complete original rug')
        sofa_x, _, sofa_w, _ = frames[13]['rect']
        self.assertEqual(sofa_x + sofa_w, 637, 'keep the sofa leg in its own sprite')
        self.assertGreaterEqual(frames[15]['rect'][0], 1017, 'the sign must exclude the rug right border')

    def test_player_frames_exclude_previous_shoes_and_keep_their_own(self):
        frames = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']['player-atlas']['frames']
        # Pixel inspection of the unchanged source: every standing/walking row
        # crosses its nominal quarter-height boundary; real transparent gaps
        # separate those shoes from the next row's hair.
        row_gaps = [0, 330, 646, 950, 1254]
        shoe_bottoms = [[322, 322, 323, 323], [640, 640, 638, 638], [946, 945, 946, 946], [1230, 1231, 1237, 1237]]
        with Image.open(ROOT / 'assets/art/player-atlas.png') as image:
            alpha = image.getchannel('A')
            for gap in row_gaps[1:-1]:
                self.assertLessEqual(alpha.crop((0, gap, image.width, gap + 1)).getextrema()[1], 40)
        for index, frame in enumerate(frames):
            _, top, _, height = frame['rect']
            row, column = divmod(index, 4)
            self.assertGreaterEqual(top, row_gaps[row], 'neighboring shoes must not float above the head')
            self.assertEqual(top + height, shoe_bottoms[row][column], 'keep complete shoes in their own frame')
            self.assertLessEqual(top + height, row_gaps[row + 1])

    def test_cellar_uses_the_user_jpeg_and_inspected_room_coordinates(self):
        if not (ROOT / 'assets/art/cellar-room.jpg').exists():
            self.skipTest('cellar source has not been installed')
        asset = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']['cellar-room']
        self.assertEqual(asset['src'], 'assets/art/cellar-room.jpg')
        self.assertEqual(asset['sourceRect'], [24, 21, 816, 530])
        self.assertEqual(asset['worldSize'], [816, 530])

    def test_motion_sheets_keep_original_png_bytes_and_all_twenty_frames(self):
        manifest=json.loads((ROOT/'assets/manifest.json').read_text(encoding='utf-8'))['assets']
        records=json.loads((ROOT/'art-prototype/final/2026-10-28-motion-assets.json').read_text(encoding='utf-8'))
        self.assertEqual(len(records),13)
        for record in records:
            path=ROOT/record['path'];self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),record['sha256'])
            asset=manifest['crew-'+record['id']+'-motion-v2-atlas']
            self.assertEqual(len(asset['frames']),20)
            self.assertEqual(set(asset['directions']),{'down','up','left','right'})
            with Image.open(path) as im:
                self.assertEqual(im.mode,'RGBA');self.assertEqual(im.getchannel('A').getextrema(),(0,255))
                samples=[]
                for frame in asset['frames']:
                    x,y,w,h=frame['rect'];self.assertGreater(w,0);self.assertGreater(h,0)
                    self.assertLessEqual(x+w,im.width);self.assertLessEqual(y+h,im.height)
                    samples.append(hashlib.sha256(im.crop((x,y,x+w,y+h)).tobytes()).hexdigest())
                self.assertEqual(len(set(samples)),20,'animation/expression frames must not be literal duplicates')

    def test_motion_frames_read_complete_heads_and_shoes_across_nominal_rows(self):
        assets=json.loads((ROOT/'assets/manifest.json').read_text(encoding='utf-8'))['assets']
        qwen=assets['crew-qwen-motion-v2-atlas']['frames'][0]['rect']
        self.assertGreaterEqual(qwen[1]+qwen[3],287,'front shoes cross the nominal 280px line')
        gpt=assets['crew-gpt-motion-v2-atlas']['frames'][16]['rect']
        self.assertLessEqual(gpt[1],1092,'thinking pose hair starts before the nominal final row')

    def test_crew_transparency_complete_frames_and_mouse_tail(self):
        assets = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']
        for name in ['deepseek','qwen','z','gpt','claude','gemini','wenxin','tom','kimi','support','mouse']:
            asset = assets['crew-'+name+'-atlas']
            self.assertEqual(len(asset['frames']),4)
            with Image.open(ROOT / asset['src']) as image:
                self.assertEqual(image.mode,'RGBA')
                self.assertEqual(image.getchannel('A').getextrema(),(0,255))
                for frame in asset['frames']:
                    x,y,w,h=frame['rect']
                    self.assertGreater(w,0)
                    self.assertGreater(h,0)
                    self.assertLessEqual(x+w,image.width)
                    self.assertLessEqual(y+h,image.height)
        # The third mouse's tail crosses the nominal half-width. Its source
        # rect must include it, without taking pixels from the fourth mouse.
        x,_,w,_=assets['crew-mouse-atlas']['frames'][2]['rect']
        self.assertGreater(x+w,660)
        self.assertLess(x+w,735)

    def test_sprites_keep_feet_and_exclude_neighboring_rows(self):
        frames = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']['event-atlas']['frames']
        for frame in frames:
            _, top, _, height = frame['rect']
            row = frame['row']
            if row == 0:
                self.assertGreater(top + height, 340, 'cameo boots must be included')
            elif row == 1:
                self.assertGreaterEqual(top, 365, 'recipe/bill icons must exclude cameo boots')
            elif row == 2:
                self.assertGreaterEqual(top, 650, 'cocktails must exclude the book strap above')
            else:
                self.assertGreaterEqual(top, 940)

    def test_drinks_use_transparent_gaps_instead_of_cutting_sprite_rows(self):
        asset = json.loads((ROOT / 'assets/manifest.json').read_text(encoding='utf-8'))['assets']['drinks-atlas']
        self.assertEqual(len(asset['frames']), 16)
        with Image.open(ROOT / 'assets/art/drinks-atlas.png') as image:
            self.assertEqual(image.mode, 'RGBA')
            alpha = image.getchannel('A')
            for y in [343, 630, 915]:
                self.assertLessEqual(alpha.crop((0, y, image.width, y + 1)).getextrema()[1], 40)
        first = asset['frames'][0]['rect']
        self.assertGreater(first[1] + first[3], 314, 'the beer base crosses the nominal quarter boundary')
        for frame in asset['frames']:
            x, y, w, h = frame['rect']
            self.assertGreater(w, 0)
            self.assertGreater(h, 0)
            self.assertLessEqual(x + w, asset['width'])
            self.assertLessEqual(y + h, asset['height'])
