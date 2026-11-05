# WCAG 2.1 contrast of every text and outline pair in palette.json (specs/003-desktop-redesign, research R1).
# Usage: python contrast.py palette.json   (each pair is printed; "FAILS: none" when all pass)
def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def cr(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
import sys, json
themes = json.load(open(sys.argv[1]))
for name, t in themes.items():
    print(f'== {name}')
    fails = []
    for fg in ['ink', 'muted', 'primary-text', 'credit-text', 'debt-text']:
        for bg in ['bg', 'surface', 'surface-2']:
            r = cr(t[fg], t[bg]); print(f'  {fg:13} on {bg:9} {r:5.2f}'); fails += [] if r >= 4.5 else [f'{fg}/{bg} {r:.2f}']
    for fg, bg, need in [('on-primary', 'primary', 4.5), ('on-block', 'block', 4.5), ('on-block-muted', 'block', 4.5),
                         ('toast-fg', 'toast-bg', 4.5), ('toast-action', 'toast-bg', 4.5), ('on-fill', 'ai', 4.5),
                         ('control-line', 'bg', 3), ('control-line', 'surface', 3), ('control-line', 'surface-2', 3),
                         ('card-edge', 'bg', 0), ('card-edge', 'surface', 0), ('surface', 'bg', 0), ('sticker-shadow', 'bg', 3)]:
        r = cr(t[fg], t[bg]); print(f'  {fg:14} on {bg:9} {r:5.2f}' + ('' if r >= need else '  <-- FAIL'))
        if r < need: fails.append(f'{fg}/{bg} {r:.2f}')
    print('  FAILS:', fails or 'none')
