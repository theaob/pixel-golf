"""Generate Android launcher icons and splash screens from a 16x16 pixel-art grid.

Run from the repo root after `npx cap add android`:  python3 scripts/android-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

RES = Path('android/app/src/main/res')
BG = (0x2B, 0x6A, 0x4F, 255)

# Same art as public/icon.svg. '.' = background.
ART = [
    '................',
    '................',
    '.......PFFFF....',
    '.......PFFFF....',
    '.......PFFFF....',
    '.......P........',
    '.......P........',
    '.......P........',
    '.......P........',
    '.LLLLLLPLLLLLLL.',
    '.GGGGGGPGGGGGGG.',
    '.GGGGKKKGGGGGGG.',
    '.GGGGGGGGGWWGGG.',
    '.GGGGGGGGGWWGGG.',
    '.GGGGGGGGGGGGGG.',
    '................',
]
COLORS = {
    'P': (0xF4, 0xF4, 0xF4, 255),
    'F': (0xFF, 0x4F, 0x5E, 255),
    'L': (0xA8, 0xE6, 0x7A, 255),
    'G': (0x6C, 0xC2, 0x4A, 255),
    'K': (0x1A, 0x14, 0x26, 255),
    'W': (0xFF, 0xFF, 0xFF, 255),
}


def art(px):
    """The art as an image with `px` screen pixels per art pixel (transparent bg)."""
    img = Image.new('RGBA', (16 * px, 16 * px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y, row in enumerate(ART):
        for x, ch in enumerate(row):
            if ch in COLORS:
                d.rectangle([x * px, y * px, (x + 1) * px - 1, (y + 1) * px - 1], fill=COLORS[ch])
    return img


def centered(size, art_frac, bg):
    w, h = size
    px = max(1, int(min(w, h) * art_frac) // 16)
    a = art(px)
    img = Image.new('RGBA', size, bg)
    img.alpha_composite(a, ((w - a.width) // 2, (h - a.height) // 2))
    return img


def save(img, path):
    img.save(path)
    print(path, img.size)


for d in sorted(RES.glob('mipmap-*dpi')):
    size = Image.open(d / 'ic_launcher.png').size[0]
    square = centered((size, size), 0.9, BG)
    save(square, d / 'ic_launcher.png')
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    rnd = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    rnd.paste(centered((size, size), 0.72, BG), (0, 0), mask)
    save(rnd, d / 'ic_launcher_round.png')
    fsize = Image.open(d / 'ic_launcher_foreground.png').size[0]
    # Adaptive icons: keep the art inside the 66/108 safe zone.
    save(centered((fsize, fsize), 0.56, (0, 0, 0, 0)), d / 'ic_launcher_foreground.png')

for p in sorted(RES.glob('drawable*/splash.png')):
    size = Image.open(p).size
    save(centered(size, 0.4, BG), p)

# Notification icon: white silhouette of the flag on transparent (Android tints it).
FLAG = [
    '................',
    '................',
    '.....PFFFFF.....',
    '.....PFFFFFF....',
    '.....PFFFFF.....',
    '.....P..........',
    '.....P..........',
    '.....P..........',
    '.....P..........',
    '.....P..........',
    '.....P..........',
    '..GGGPGGGGGG....',
    '..GGGGGGGGGG....',
    '................',
    '................',
    '................',
]
for density, size in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
    px = size // 16
    off = (size - 16 * px) // 2
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y, row in enumerate(FLAG):
        for x, ch in enumerate(row):
            if ch != '.':
                d.rectangle([off + x * px, off + y * px, off + (x + 1) * px - 1, off + (y + 1) * px - 1], fill=(255, 255, 255, 255))
    out = RES / f'drawable-{density}'
    out.mkdir(exist_ok=True)
    save(img, out / 'ic_stat_pixelgolf.png')
