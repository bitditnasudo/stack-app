# Brand source

`stack-logo.jpg` is the master artwork — 1024×1024, a white dumbbell on a green
layered gradient. **It is a JPEG.** It arrived named `stack_logo.png` in the
outer folder; the bytes were always JPEG (`ffd8ff…`), and the extension is
corrected here so tooling does not have to guess.

Everything in `public/` is generated from it:

| File | Size | Used by |
|---|---|---|
| `icon-512.png` | 512 | the manifest — `any` **and** `maskable` |
| `icon-192.png` | 192 | the manifest, the favicon, and notifications |
| `apple-touch-icon.png` | 180 | the iOS home-screen icon |

## Regenerating

```bash
python -c "
from PIL import Image
src = Image.open('brand/stack-logo.jpg').convert('RGB')
for path, size in {'public/icon-512.png':512, 'public/icon-192.png':192, 'public/apple-touch-icon.png':180}.items():
    src.resize((size, size), Image.LANCZOS).quantize(colors=256, dither=Image.NONE).save(path, 'PNG', optimize=True)
"
```

Two things that choice encodes, both measured rather than assumed:

- **PNG-8, 256 colours, no dither.** The artwork is a smooth gradient, so a
  truecolour PNG is mostly incompressible noise: 283KB at 512px against 120KB
  as a palette, for a mean error of 1.0/255. Dithering makes it *larger* (it
  adds exactly the high-frequency noise PNG cannot pack) and no more accurate.
- **No alpha, and no padding.** iOS composites a transparent touch icon onto
  black, so the icon is deliberately opaque. And it is full-bleed because it can
  be: Android crops a `maskable` icon to a circle of 40% radius, and the white
  ink here reaches only **33.1%** — zero pixels of the mark fall outside the
  safe zone. Re-check that if the artwork ever changes; padding it "just in
  case" would shrink the mark on every platform to satisfy one.
