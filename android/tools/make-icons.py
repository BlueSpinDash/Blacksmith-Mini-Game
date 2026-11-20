#!/usr/bin/env python3
"""Generate every Android launcher icon asset from one square source image.

Usage: python3 android/tools/make-icons.py [source.png]

Writes legacy square icons, round icons, adaptive-icon foreground layers and
a Play Store icon into android/app/src/main/res/.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ANDROID = os.path.dirname(HERE)
RES = os.path.join(ANDROID, 'app', 'src', 'main', 'res')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ANDROID, 'icon-source.png')

# dp sizes per density bucket
DENSITIES = [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]
LEGACY_DP = 48      # classic launcher icon
ADAPTIVE_DP = 108   # adaptive icon layer; only the centre 72dp is guaranteed visible


def load_square(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    if w != h:                      # centre-crop to a square
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    return im


def resize(im, px):
    return im.resize((px, px), Image.LANCZOS)


def round_mask(px):
    # 4x supersampled circle for clean edges
    mask = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    return mask.resize((px, px), Image.LANCZOS)


def edge_colour(im):
    """Average the darker outer border, for the adaptive background layer."""
    small = im.convert('RGB').resize((32, 32), Image.LANCZOS)
    px = small.load()
    band = [px[x, y] for x in range(32) for y in range(32)
            if x < 3 or y < 3 or x > 28 or y > 28]
    band.sort(key=lambda c: sum(c))
    dark = band[:len(band) // 2]      # ignore the bright sparks in the corners
    n = len(dark)
    return tuple(sum(c[i] for c in dark) // n for i in range(3))


def out(*parts):
    path = os.path.join(RES, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def main():
    src = load_square(SRC)
    print(f'source: {src.size[0]}x{src.size[1]}')

    for name, scale in DENSITIES:
        legacy_px = int(LEGACY_DP * scale)
        adaptive_px = int(ADAPTIVE_DP * scale)

        square = resize(src, legacy_px)
        square.save(out(f'mipmap-{name}', 'ic_launcher.png'))

        rnd = square.copy()
        rnd.putalpha(round_mask(legacy_px))
        rnd.save(out(f'mipmap-{name}', 'ic_launcher_round.png'))

        # Adaptive foreground is full bleed: launchers mask it to their own
        # shape, and the rook sits inside the guaranteed-visible centre.
        resize(src, adaptive_px).save(out(f'mipmap-{name}', 'ic_launcher_foreground.png'))
        print(f'  {name:8} legacy {legacy_px}px  adaptive {adaptive_px}px')

    bg = edge_colour(src)
    hex_bg = '#%02X%02X%02X' % bg
    with open(out('values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                f'    <color name="ic_launcher_background">{hex_bg}</color>\n</resources>\n')
    print(f'adaptive background colour: {hex_bg}')

    adaptive = ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background" />\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
                '    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />\n'
                '</adaptive-icon>\n')
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(out('mipmap-anydpi-v26', name), 'w') as f:
            f.write(adaptive)

    # Play Store listing icon (not packaged in the APK)
    store = os.path.join(ANDROID, 'play-store-icon-512.png')
    resize(src, 512).convert('RGB').save(store)
    print('play store icon: android/play-store-icon-512.png')


if __name__ == '__main__':
    main()
