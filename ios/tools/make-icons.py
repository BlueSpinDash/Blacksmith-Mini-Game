#!/usr/bin/env python3
"""Generate the iOS app icon set from one square source image.

Usage: python3 ios/tools/make-icons.py [source.png]

Xcode 14 and later take a single 1024x1024 icon and derive the rest, but the
older per-size set is still accepted and is what older toolchains expect, so
both are written. iOS masks the corners itself and ignores alpha, so every
icon is flattened onto the app's own background colour rather than left
transparent.
"""
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.dirname(HERE)
ROOT = os.path.dirname(IOS)
ICONSET = os.path.join(IOS, 'Checksmith', 'Assets.xcassets', 'AppIcon.appiconset')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'android', 'icon-source.png')

BACKDROP = (20, 21, 26)          # --bg, so a letterboxed source never shows white

# (idiom, size in points, scale)
SIZES = [
    ('iphone', 20, 2), ('iphone', 20, 3),
    ('iphone', 29, 2), ('iphone', 29, 3),
    ('iphone', 38, 2), ('iphone', 38, 3),
    ('iphone', 40, 2), ('iphone', 40, 3),
    ('iphone', 60, 2), ('iphone', 60, 3),
    ('ipad', 20, 1), ('ipad', 20, 2),
    ('ipad', 29, 1), ('ipad', 29, 2),
    ('ipad', 38, 2),
    ('ipad', 40, 1), ('ipad', 40, 2),
    ('ipad', 76, 2),
    ('ipad', 83.5, 2),
    ('ios-marketing', 1024, 1),
]


def load_square(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    if w != h:                                  # centre-crop to a square
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    return im


def flatten(im, px):
    out = Image.new('RGB', (px, px), BACKDROP)
    out.paste(im.resize((px, px), Image.LANCZOS), (0, 0), im.resize((px, px), Image.LANCZOS))
    return out


def name_for(size, scale):
    label = ('%g' % size).replace('.', '_')
    return 'icon-%sx%s@%dx.png' % (label, label, scale)


def main():
    src = load_square(SRC)
    os.makedirs(ICONSET, exist_ok=True)
    for old in os.listdir(ICONSET):
        if old.endswith('.png'):
            os.remove(os.path.join(ICONSET, old))

    images = []
    written = {}
    for idiom, size, scale in SIZES:
        px = int(round(size * scale))
        filename = name_for(size, scale)
        if px not in written:
            flatten(src, px).save(os.path.join(ICONSET, filename), 'PNG', optimize=True)
            written[px] = filename
        images.append({
            'idiom': idiom,
            'size': '%gx%g' % (size, size),
            'scale': '%dx' % scale,
            'filename': written[px],
        })

    with open(os.path.join(ICONSET, 'Contents.json'), 'w') as fh:
        json.dump({'images': images, 'info': {'author': 'xcode', 'version': 1}}, fh, indent=2)
        fh.write('\n')
    print('wrote %d icons (%d distinct sizes) to %s'
          % (len(images), len(written), os.path.relpath(ICONSET, ROOT)))


if __name__ == '__main__':
    main()
