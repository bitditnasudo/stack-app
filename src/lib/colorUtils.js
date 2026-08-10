/* ============================================================================
   COLOUR UTILITIES — lifted from Budget Tracker, unchanged in behaviour.
   ============================================================================
   These exist for one situation the token system cannot cover: colours chosen
   at RUNTIME. A user picks an account colour, a category gets a chart hue —
   and then something has to render readable 11px text in or on that colour.

   The rule the tokens encode statically, these encode dynamically:
   a colour that looks right as a 24px chart arc is usually illegal as text.
   Amber #F59E0B manages 2.15:1 on white. Pink #EC4899 manages 3.53:1.

   Use `readableInk` for the text, and `tint` to work out what background that
   text truly sits on. Deriving ink against white when the row is actually a
   tinted wash is exactly the bug that left four colours at 4.1–4.4:1.
   ========================================================================== */

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex) {
  const c = hex.replace('#', '')
  const [rs, gs, bs] = [0, 2, 4].map(i => {
    const v = parseInt(c.substring(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** WCAG contrast ratio between two colours. 4.5 is the AA floor for body text. */
export function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Picks the higher-contrast of dark/light text for a given solid background. */
export function getContrastText(hex, dark = '#141414', light = '#FFFFFF') {
  if (!hex) return light
  return contrastRatio(hex, dark) >= contrastRatio(hex, light) ? dark : light
}

/**
 * Flattens `hex` at `alpha` over `bg` into a solid colour.
 *
 * Returning a real colour rather than an 8-digit alpha hex is the point: the
 * result can be fed straight to readableInk, so text is measured against the
 * background it actually sits on rather than against the page beneath it.
 */
export function tint(hex, alpha, bg = '#FFFFFF') {
  if (!hex) return bg
  const channels = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').substring(i, i + 2), 16))
  const [fg, back] = [channels(hex), channels(bg)]
  return '#' + fg
    .map((v, i) => Math.round(v * alpha + back[i] * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Darkens an accent in sRGB until it clears `target` contrast on `bg`,
 * preserving hue — so a label can wear its category's colour and stay readable.
 *
 *   const wash = tint(cat.color, 0.12)            // the row's real background
 *   const ink  = readableInk(cat.color, wash)     // text that clears AA on it
 */
export function readableInk(hex, bg = '#FFFFFF', target = 4.5) {
  if (!hex) return '#141414'
  const c = hex.replace('#', '')
  const rgb = [0, 2, 4].map(i => parseInt(c.substring(i, i + 2), 16))
  for (let scale = 100; scale > 0; scale -= 4) {
    const shade = '#' + rgb
      .map(v => Math.round((v * scale) / 100).toString(16).padStart(2, '0'))
      .join('')
    if (contrastRatio(shade, bg) >= target) return shade
  }
  return '#141414'
}
