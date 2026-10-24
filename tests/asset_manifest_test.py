"""Source-coordinate regression for the generated party atlas, without editing pixels."""
from pathlib import Path
import json
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class EventAtlasCoordinates(unittest.TestCase):
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
