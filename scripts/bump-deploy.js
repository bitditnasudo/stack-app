#!/usr/bin/env node
/* ============================================================================
   bump-deploy — bump the version before shipping.
   ============================================================================
   Run via `npm run deploy` (bump + commit) or `npm run deploy:bump` (bump only).

   THE VERSION IS THE COUNTER.
   Every ship bumps the MINOR: 2.0 → 2.1 → 2.2 … → 2.9 → 2.10 → 2.11. It never
   rolls over into 3.0 — a new major is a decision someone makes on purpose, not
   something that happens because you shipped ten times.

   This replaced a separate "deploy #N" counter that sat beside the version in
   the footer. Two numbers that both counted deploys meant every reader had to
   work out which one mattered; now there is one, and it is the one already
   printed on the build.

   Note 2.10 comes AFTER 2.9 and is not 2.1 — that is semver's rule (fields are
   integers, not decimals) and it is why the parts are compared as numbers here
   and never as a float.

   WHY THIS IS A SCRIPT AND NOT PART OF THE BUILD
   A Vercel build runs in a throwaway container cloned fresh from git. It can
   increment a number in memory, but it has nowhere to put it that the *next*
   build would see — it cannot push back to the repo. So the bump happens on
   your machine and is committed, which is what this does.

   It also records the commit count at bump time. Vercel clones shallow, so
   `git rev-list --count HEAD` can under-report inside a build; the recorded
   number is captured here where the full history exists, and vite falls back to
   it. See vite.config.js.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const PKG  = new URL('../package.json', import.meta.url)
const LOCK = new URL('../package-lock.json', import.meta.url)
const INFO = new URL('../buildinfo.json', import.meta.url)

const git = cmd => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return null }
}

const readJson = u => JSON.parse(readFileSync(u, 'utf8'))
// Trailing newline: npm writes one, and without it every bump shows a spurious
// "\ No newline at end of file" in the diff.
const writeJson = (u, o) => writeFileSync(u, JSON.stringify(o, null, 2) + '\n')

const willCommit = process.argv.includes('--commit')

/* ── Bump the minor ──────────────────────────────────────────────────────── */
const pkg = readJson(PKG)
const [major, minor] = pkg.version.split('.').map(Number)
if (!Number.isInteger(major) || !Number.isInteger(minor)) {
  console.error(`package.json version is not a semver triple: ${pkg.version}`)
  process.exit(1)
}
const next = `${major}.${minor + 1}.0`
pkg.version = next
writeJson(PKG, pkg)

/* package-lock carries the version in two places and npm rewrites both. Keeping
   them in step here means `npm ci` never warns that the lock is out of date. */
let lockTouched = false
try {
  const lock = readJson(LOCK)
  if (lock.version) { lock.version = next; lockTouched = true }
  if (lock.packages?.['']?.version) { lock.packages[''].version = next; lockTouched = true }
  if (lockTouched) writeJson(LOCK, lock)
} catch {
  // No lock file, or it is not readable. The bump still stands.
}

/* ── Record the commit count ─────────────────────────────────────────────── */
const info = readJson(INFO)
const commits = Number(git('git rev-list --count HEAD')) || info.commitsAtLastBump || 0
writeJson(INFO, {
  // +1 when we're about to add the bump's own commit: this file has to be
  // written before that commit exists, so counting now would be one short of
  // the history the deployed build is actually built from.
  commitsAtLastBump: willCommit ? commits + 1 : commits,
  lastBumpedAt: new Date().toISOString(),
})

const label = next.replace(/\.0$/, '')   // 2.1.0 → 2.1, matching the footer
console.log(`version: v${label} (${commits + (willCommit ? 1 : 0)} commits)`)

// `--commit` stages and commits the bump so the deployed build carries it.
// Nothing is pushed — that stays your call, except via `npm run ship`.
if (willCommit) {
  if (!git('git rev-parse --git-dir')) {
    console.error('not a git repository — bumped the files but skipped the commit')
    process.exit(0)
  }
  execSync(`git add package.json buildinfo.json${lockTouched ? ' package-lock.json' : ''}`, { stdio: 'inherit' })
  execSync(`git commit -m "chore: v${label}"`, { stdio: 'inherit' })
  console.log('\nCommitted. Push when ready:\n  git push')
}
