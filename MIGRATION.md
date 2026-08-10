# Moving your history off the old app

Your completion history lives in your phone browser's `localStorage`, and
`localStorage` is tied to the **origin** — the domain the app is served from.
Moving from GitHub Pages to Vercel changes the origin, so the data does not
follow on its own. This is a one-time transfer.

**Do this before you uninstall anything.**

---

## Step 1 — dump the old data

Open the **old** app (the GitHub Pages URL, not the Vercel one) in a browser
where you can reach the developer console.

Easiest route is your laptop, if you ever opened the old app there. If the
history only exists on your phone, use Chrome on Android with USB debugging, or
skip to Step 3 and accept starting fresh.

Paste this into the console and press Enter:

```js
copy(JSON.stringify(Object.fromEntries(
  Object.keys(localStorage)
    .filter(k => k.startsWith('stack_checked_'))
    .map(k => [
      k.slice(14),
      {
        checked: JSON.parse(localStorage[k] || '{}'),
        total: Number(localStorage['stack_total_' + k.slice(14)]) || 0,
      },
    ])
)))
```

`copy()` puts the result on your clipboard. If your console doesn't have
`copy()`, swap it for `console.log()` and copy the output by hand.

To check it worked before you move on:

```js
Object.keys(localStorage).filter(k => k.startsWith('stack_checked_')).length
```

That number is how many days you're carrying over. If it's `0`, this browser
never had the data — try the device you actually used the app on.

---

## Step 2 — import into the new app

1. Open the new app on Vercel.
2. **Settings → Data → Restore from backup**.
3. Paste into the **"…or paste JSON"** box and press **Import**.

It merges by date, so importing the same dump twice does nothing bad. It will
tell you how many days came in — compare that against the number from Step 1.

---

## Step 3 — from here on, back up on purpose

**Settings → Data → Download backup** writes a JSON file of every logged day.
That file is the only backup this app has. Clearing your browser data, or your
phone deciding to evict the site's storage, takes everything with it.

Worth doing every month or so, and definitely before you reinstall anything.

---

## What about the old app?

Leave it installed until you've confirmed the import worked. After that you can
remove it — but the GitHub Pages deployment itself costs nothing, so there's no
reason to delete the repo.

The Play Store package in `../STACK - Google Play package/` still points at the
GitHub Pages URL. If you want the installed Android app to follow to Vercel, it
has to be re-wrapped against the new URL and its `assetlinks.json` updated.
That hasn't been done.
