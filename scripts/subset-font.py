"""Optional asset-generation step: pip install fonttools[woff].

Keep the original font as the fallback for every character outside this
common UI subset. Runtime/builds use checked-in WOFF2, with no Python dependency.
"""
from pathlib import Path
import re
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
source = root / 'public/fonts/inter-latin-variable.woff2'
target = root / 'src/assets/inter-ui.woff2'
target.parent.mkdir(parents=True, exist_ok=True)
font = TTFont(source)
original = font.getBestCmap()
ranges = [(0x0,0xFF),(0x2000,0x206F),(0x20A0,0x20CF),(0x2190,0x21FF),(0x2212,0x2212),(0xFEFF,0xFEFF),(0xFFFD,0xFFFD)]
codepoints = {cp for start,end in ranges for cp in range(start,end+1)}
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
worker = subset.Subsetter(options=options)
worker.populate(unicodes=codepoints)
worker.subset(font)
font.save(target)
assert set(font.getBestCmap()) == set(original).intersection(codepoints)
# Exact coverage avoids downloading the fallback font for emoji it does not
# contain. All original non-subset glyphs are still available on demand.
remaining = sorted(set(original) - codepoints)
spans = []
for cp in remaining:
    if spans and spans[-1][1] + 1 == cp:
        spans[-1][1] = cp
    else:
        spans.append([cp, cp])
coverage = ', '.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a,b in spans)
css = root / 'src/styles/tokens.css'
css.write_text(re.sub(r'unicode-range: [^;]+;', f'unicode-range: {coverage};', css.read_text(encoding='utf-8'), count=1), encoding='utf-8')
print(f'{source.stat().st_size} -> {target.stat().st_size} bytes; remaining glyphs use original font')
