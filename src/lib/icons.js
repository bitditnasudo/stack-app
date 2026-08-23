/* ============================================================================
   ICONS — the one glyph set, and the registry a habit picks from.
   ============================================================================
   LUCIDE, AND ONLY LUCIDE. It is MIT, actively maintained, and — the part that
   decided it — already the app's icon dependency, so standardising on it costs
   nothing and mixing in a second set would cost consistency immediately. Two
   sets never agree on stroke weight, optical size or corner radius, and a stack
   of fifteen rows is exactly where that shows.

   WHY THIS FILE EXISTS RATHER THAN `lucide-react[name]`.
   A habit stores its glyph as a NAME (`'Dumbbell'`), because a routine is user
   data that goes through JSON, Drive sync and a backup file — a component
   reference cannot survive any of those. Resolving that name by indexing the
   whole `lucide-react` namespace would work and would also defeat tree-shaking:
   the bundler cannot know which of ~1500 icons are reachable, so it ships all
   of them. An explicit import list is the version that stays small, and it
   doubles as the picker's contents.

   ADDING ONE IS TWO LINES — an import and a CATALOGUE row. Keep the `name`
   exactly Lucide's export name so the two never drift.

   THE FALLBACK IS NOT AN ERROR STATE. Most habits have no glyph, and that is
   fine: `iconFor` falls back to the category's, then to a neutral dot. A habit
   is identified by its NAME on every screen it appears on; the glyph is
   recognition at a glance, not identity, so a missing one degrades to plainer
   rather than to broken.
   ========================================================================== */

import {
  // ── Fitness ──
  Dumbbell, Bike, Footprints, PersonStanding, Waves, Mountain, Timer, Activity,
  Flame, TrendingUp, Trophy, Target,
  // ── Health ──
  Pill, HeartPulse, Heart, Stethoscope, Syringe, Thermometer, Brain, Bone,
  Eye, Ear, Smile, Cross,
  // ── Food & drink ──
  GlassWater, Coffee, Apple, Salad, Soup, Egg, Beef, Cookie, Milk, Utensils,
  // ── Care & routine ──
  Droplet, Droplets, Sun, Moon, Sparkles, ShowerHead, Bath, Scissors, Shirt,
  Wind, SprayCan, Hand,
  // ── Mind & rest ──
  BookOpen, Music, Headphones, Feather, Leaf, TreePine, Bed, CloudMoon,
  // ── Doing ──
  Briefcase, Laptop, PenLine, Phone, MessageCircle, ShoppingCart, Home, Car,
  Dog, Camera, Gamepad2, Wallet,
  // ── Neutral ──
  Circle, CheckCircle2, Star, Zap, Clock, Calendar,
} from 'lucide-react'

/**
 * The picker's contents, in the order it shows them.
 *
 * GROUPED, BECAUSE A FLAT GRID OF SIXTY IS A SEARCH PROBLEM. The groups are the
 * kinds of thing this app actually tracks — the spec asks for "fitness, health
 * and daily-routine categories" and these are those, split finely enough that
 * the group heading does most of the finding.
 *
 * They are NOT the app's categories and must not be confused with them.
 * Categories are user data and can be renamed or deleted; these headings are
 * fixed, and a Skincare habit is free to take a glyph from any of them.
 */
export const ICON_GROUPS = [
  { label: 'Fitness', icons: [
    ['Dumbbell', Dumbbell], ['Bike', Bike], ['Footprints', Footprints],
    ['PersonStanding', PersonStanding], ['Waves', Waves], ['Mountain', Mountain],
    ['Timer', Timer], ['Activity', Activity], ['Flame', Flame],
    ['TrendingUp', TrendingUp], ['Trophy', Trophy], ['Target', Target],
  ] },
  { label: 'Health', icons: [
    ['Pill', Pill], ['HeartPulse', HeartPulse], ['Heart', Heart],
    ['Stethoscope', Stethoscope], ['Syringe', Syringe], ['Thermometer', Thermometer],
    ['Brain', Brain], ['Bone', Bone], ['Eye', Eye], ['Ear', Ear],
    ['Smile', Smile], ['Cross', Cross],
  ] },
  { label: 'Food & drink', icons: [
    ['GlassWater', GlassWater], ['Coffee', Coffee], ['Apple', Apple],
    ['Salad', Salad], ['Soup', Soup], ['Egg', Egg], ['Beef', Beef],
    ['Cookie', Cookie], ['Milk', Milk], ['Utensils', Utensils],
  ] },
  { label: 'Care & routine', icons: [
    ['Droplet', Droplet], ['Droplets', Droplets], ['Sun', Sun], ['Moon', Moon],
    ['Sparkles', Sparkles], ['ShowerHead', ShowerHead], ['Bath', Bath],
    ['Scissors', Scissors], ['Shirt', Shirt], ['Wind', Wind],
    ['SprayCan', SprayCan], ['Hand', Hand],
  ] },
  { label: 'Mind & rest', icons: [
    ['BookOpen', BookOpen], ['Music', Music], ['Headphones', Headphones],
    ['Feather', Feather], ['Leaf', Leaf], ['TreePine', TreePine],
    ['Bed', Bed], ['CloudMoon', CloudMoon],
  ] },
  { label: 'Doing', icons: [
    ['Briefcase', Briefcase], ['Laptop', Laptop], ['PenLine', PenLine],
    ['Phone', Phone], ['MessageCircle', MessageCircle], ['ShoppingCart', ShoppingCart],
    ['Home', Home], ['Car', Car], ['Dog', Dog], ['Camera', Camera],
    ['Gamepad2', Gamepad2], ['Wallet', Wallet],
  ] },
  { label: 'Other', icons: [
    ['Circle', Circle], ['CheckCircle2', CheckCircle2], ['Star', Star],
    ['Zap', Zap], ['Clock', Clock], ['Calendar', Calendar],
  ] },
]

/** name → component, flattened once. */
export const ICONS = Object.fromEntries(
  ICON_GROUPS.flatMap(g => g.icons)
)

export const ICON_NAMES = Object.keys(ICONS)

/**
 * The glyph a habit shows, resolved through its fallbacks.
 *
 * Habit's own → its category's → a neutral dot. Returning a component rather
 * than null at the end is deliberate: every row in a stack is the same height
 * and the same shape, and a row that drops its glyph because nobody picked one
 * makes the list look ragged for a reason the user cannot see.
 */
export function iconFor(habit, category) {
  return ICONS[habit?.icon] || ICONS[category?.icon] || Circle
}

/** Resolve a stored name on its own, for anything that is not a habit. */
export function iconByName(name, fallback = Circle) {
  return ICONS[name] || fallback
}
