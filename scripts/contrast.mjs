#!/usr/bin/env node
/* ============================================================================
   contrast — WCAG check for the RUNTIME-coloured components. `npm run contrast`
   ============================================================================
   WHY THIS EXISTS, AND IT IS NOT A NICE-TO-HAVE

   The theme's own colours were measured once, carefully, when the dark set was
   written: 47 pairings, every one recorded in theme.css. Then four components
   were added that colour themselves from USER DATA at runtime — .mood,
   .cat-chip, .week-slot, .step-card — and they were eyeballed against one
   palette entry and one backdrop instead. Three of them shipped broken:

     .mood on the hero card        1.07:1   invisible
     .hero-count over the gradient 3.15:1   measured at one end of a gradient
     .week-count on a day wash     3.97:1   worst palette entry never tried
     .mood on a card              4.49:1

   None of that was a hard problem. It was a missing habit: the harness existed
   and was not re-run. So it is a script now, and it runs over EVERY palette
   colour in EVERY context rather than the one that happened to be on screen.

   Two rules this encodes, both learned the hard way:

   1. A GRADIENT HAS TWO ENDS. --on-dark-muted measured 4.72:1 against the dark
      stop and 4.02:1 against the light one. Checking one end is not checking.

   2. WHEN THE INK IS THE COLOUR, A HEAVIER WASH COSTS CONTRAST. .mood inks with
      the same colour its background is a wash of, so raising the wash moves the
      background toward the text. 22% failed; 14% passes.
   ========================================================================== */

const PALETTE = ['#C5DE6B', '#F5C542', '#FF7A5C', '#7FD1E8',
                 '#C89BFF', '#5FD9A6', '#FF9ECF', '#FFB067']

/* Kept in step with theme.css by hand. If a value here disagrees with the
   theme, the theme wins and this file is stale — fix it. */
const T = {
  bg: '#131011', surface: '#201C1E',
  text: '#F6F0F1', muted: '#A79A9E',
  onDark: '#1A0F12',
  onDarkMuted: { hex: '#1A0F12', a: 0.88 },
  onDarkVeil:  { hex: '#FFFFFF', a: 0.28 },
  heroStops: ['#FFB3C0', '#FF4D6D'],   // .card-hero's gradient, BOTH ends
  moodWash: 0.14,
  stepChipVeil: 0.12,
  weekSlotWash: 0.18,
}

const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const L = r => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2])
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const over = (fg, a, bg) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)))
const inkFor = fill => (ratio(fill, hex('#141414')) >= ratio(fill, hex('#FFFFFF')) ? hex('#141414') : hex('#FFFFFF'))

let fail = 0
const check = (label, fg, bg, min = 4.5) => {
  const r = ratio(fg, bg)
  const ok = r >= min
  if (!ok) fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${r.toFixed(2).padStart(6)}  (min ${min})  ${label}`)
  return r
}
/** Worst case across every palette colour — the only number that means anything
 *  for a component whose colour the user picks. */
const worstOfPalette = (label, fn, min = 4.5) => {
  let worst = Infinity, which = null
  for (const c of PALETTE) { const r = fn(hex(c)); if (r < worst) { worst = r; which = c } }
  const ok = worst >= min
  if (!ok) fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${worst.toFixed(2).padStart(6)}  (min ${min})  ${label}  ← worst: ${which}`)
}

console.log('\n── .mood / .cat-chip — ink IS the colour, on a wash of itself ──')
worstOfPalette('.mood on --surface', c => ratio(c, over(c, T.moodWash, hex(T.surface))))
worstOfPalette('.mood on --bg', c => ratio(c, over(c, T.moodWash, hex(T.bg))))

console.log('\n── .mood-on-dark — the hero variant, measured on BOTH stops ──')
for (const [i, stop] of T.heroStops.entries()) {
  const chip = over(hex(T.onDarkVeil.hex), T.onDarkVeil.a, hex(stop))
  check(`--on-dark on --on-dark-veil, hero stop ${i + 1} (${stop})`, hex(T.onDark), chip)
  const seen = ratio(chip, hex(stop))
  console.log(`        ${seen.toFixed(2)}  (min 1.06)  …and the chip still reads as a chip`)
  if (seen < 1.06) fail++
}

console.log('\n── .figure and .hero-count on the hero gradient ──')
for (const [i, stop] of T.heroStops.entries()) {
  check(`--on-dark (figure), stop ${i + 1}`, hex(T.onDark), hex(stop), 3)
  const muted = over(hex(T.onDarkMuted.hex), T.onDarkMuted.a, hex(stop))
  check(`--on-dark-muted (hero-count), stop ${i + 1}`, muted, hex(stop))
}

console.log('\n── .week-slot and .week-count on a day-coloured wash ──')
worstOfPalette('--text (slot label) on an 18% wash', c => ratio(hex(T.text), over(c, T.weekSlotWash, hex(T.surface))))
worstOfPalette('--text (week-count) on an 18% wash', c => ratio(hex(T.text), over(c, T.weekSlotWash, hex(T.surface))))

console.log('\n── .step-card — fill is user data, ink is picked by getContrastText ──')
worstOfPalette('step ink on its own fill', c => ratio(inkFor(c), c))
worstOfPalette('.step-chip ink on a 12% ink veil', c => {
  const ink = inkFor(c)
  return ratio(ink, over(ink, T.stepChipVeil, c))
})
worstOfPalette('.step-warn — fill as text on ink as background', c => ratio(c, inkFor(c)))

console.log(fail ? `\n${fail} FAILED` : '\nAll contrast checks passed')
process.exit(fail ? 1 : 0)
