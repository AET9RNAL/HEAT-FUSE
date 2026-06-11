"""Scan UI HTML/CSS/JS for font-family declarations to confirm actual usage."""
import os, re

ROOT = r'c:\Users\maksg\Documents\GitHub\HEAT_SACLOS\specs\ui_assets_full\ui'
fams = set()
ff_re = re.compile(r'font-family\s*:\s*([^;{}\n]+)')
for d, _, fs in os.walk(ROOT):
    for f in fs:
        if not f.endswith(('.css', '.html', '.js')):
            continue
        try:
            txt = open(os.path.join(d, f), 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for m in ff_re.finditer(txt):
            v = m.group(1).strip().strip('"\'')
            if len(v) < 200:
                fams.add(v)
for v in sorted(fams):
    print(v)
