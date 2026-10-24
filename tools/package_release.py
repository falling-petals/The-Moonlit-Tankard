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

game=[ROOT/p for p in ['index.html','style.css','party.css','package.json','start.cmd','README.md','tools/launch.py','docs/art-guide.md','docs/validation.md','docs/qa-report.json','docs/qa-review-report.json','docs/qa-party-report.json']]
game+=list((ROOT/'src').glob('*.js'))+list((ROOT/'assets').rglob('*'))
game+=list((ROOT/'art-prototype'/'final').glob('*.json'))
package('moonlit-tankard-mvp.zip',game)
art=list((ROOT/'assets').rglob('*'))+[ROOT/'docs/art-guide.md']+list((ROOT/'art-prototype'/'final').glob('*.json'))
package('moonlit-tankard-art-pack.zip',art)
