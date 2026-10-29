"""Package explicit public deliverables only; never read environment credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'release';OUT.mkdir(exist_ok=True)
def package(name,files):
    unique=sorted({p for p in files if p.is_file() and '__pycache__' not in p.parts})
    with ZipFile(OUT/name,'w',ZIP_DEFLATED) as archive:
        for p in unique:archive.write(p,p.relative_to(ROOT))
    print(f'{name}: {len(unique)} files, {(OUT/name).stat().st_size} bytes')

game=[ROOT/p for p in ['index.html','style.css','party.css','package.json','start.cmd','README.md','tools/launch.py','docs/art-guide.md','docs/validation.md','docs/qa-report.json','docs/qa-review-report.json','docs/qa-party-report.json','docs/qa-service-report.json','docs/qa-overlays-report.json']]
game+=list(ROOT.glob('*.css'))+list((ROOT/'src').glob('*.js'))+list((ROOT/'src').glob('*.css'))+list((ROOT/'assets').rglob('*'))
game+=[ROOT/'start-ai.cmd',ROOT/'docs/design/2026-10-27-team-cellar-memory-debug-proposal.md']
game+=[ROOT/'docs/superpowers/plans/2026-10-27-ai-crew-cellar.md',ROOT/'docs/qa-crew-integration-report.json',ROOT/'docs/qa-crew-ai-report.json']
game+=[ROOT/'docs/design/2026-10-28-character-motion-expressions.md',ROOT/'docs/qa-character-motion-report.json']
game+=[ROOT/'docs/design/2026-10-28-cellar-room-and-stock-fixes.md',ROOT/'docs/qa-cellar-map-report.json',ROOT/'docs/qa-stock-panel-report.json',ROOT/'docs/qa-cellar-return-report.json']
game+=list((ROOT/'art-prototype'/'final').glob('*.json'))
package('moonlit-tankard-mvp.zip',game)
art=[ROOT/'src/character-animation.js']+list((ROOT/'assets').rglob('*'))+[ROOT/'docs/art-guide.md']+list((ROOT/'art-prototype'/'final').glob('*.json'))
package('moonlit-tankard-art-pack.zip',art)
