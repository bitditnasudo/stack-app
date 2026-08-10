#!/usr/bin/env node
/* ============================================================================
   bump-deploy — increment the deploy counter before shipping.
   ============================================================================
   Run via `npm run deploy` (bump + commit) or `npm run deploy:bump` (bump only).

   WHY THIS IS A SCRIPT AND NOT PART OF THE BUILD
   A Vercel build runs in a throwaway container cloned fresh from git. It can
   increment a number in memory, but it has nowhere to put it that the *next*
   build would see — it cannot push back to the repo. So a deploy counter has to
   be incremented on your machine and committed, which is what this does.

   It also records the commit count at bump time. Vercel clones shallow, so
   `git rev-list --count HEAD` can under-report inside a build; the recorded
   number is captured here where the full history exists, and vite falls back to
   it. See vite.config.js.
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const FILE = new URL('../buildinfo.json', import.meta.url)

const git = cmd => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return null }
}

const willCommit = process.argv.includes('--commit')
const info = JSON.parse(readFileSync(FILE, 'utf8'))
const commits = Number(git('git rev-list --count HEAD')) || info.commitsAtLastBump || 0

const next = {
  deploys: (info.deploys || 0) + 1,
  // +1 when we're about to add the counter's own commit: this file has to be
  // written before that commit exists, so counting now would be one short of
  // the history the deployed build is actually built from.
  commitsAtLastBump: willCommit ? commits + 1 : commits,
  lastBumpedAt: new Date().toISOString(),
}

writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n')
console.log(`buildinfo: deploy #${next.deploys}, ${next.commitsAtLastBump} commits`)

// `--commit` stages and commits the counter so the deployed build carries it.
// Nothing is pushed — that stays your call.
if (willCommit) {
  if (!git('git rev-parse --git-dir')) {
    console.error('not a git repository — bumped the file but skipped the commit')
    process.exit(0)
  }
  execSync('git add buildinfo.json', { stdio: 'inherit' })
  execSync(`git commit -m "chore: deploy #${next.deploys}"`, { stdio: 'inherit' })
  console.log('\nCommitted. Push when ready:\n  git push')
}
