"""Source-coordinate regression for the generated party atlas, without editing pixels."""
from pathlib import Path
import json
import unittest

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
