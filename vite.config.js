import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// read rather than import: JSON import assertions differ across Node versions
const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'))
const pkg = read('./package.json')
const info = read('./buildinfo.json')

const git = cmd => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return null }
}

// Short SHA of what's actually running. Vercel hands it to us in an env var;
// otherwise ask local git.
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || git('git rev-parse --short HEAD') || 'dev'

/* How many commits exist.
 *
 * `git rev-list --count HEAD` is exact — but only against full history, and
 * Vercel clones shallow, where it reports the truncated depth instead. So:
 * trust live git only when the clone is complete, otherwise use the count that
 * scripts/bump-deploy.js recorded on a machine that had the whole history.
 * Take the larger of the two, so neither source can make the number go
 * backwards between builds. */
const shallow = git('git rev-parse --is-shallow-repository') === 'true'
const liveCount = shallow ? 0 : Number(git('git rev-list --count HEAD')) || 0
const commitCount = Math.max(liveCount, info.commitsAtLastBump || 0)

/* How many deploys have been cut. This one cannot come from git: a Vercel build
 * is ephemeral and can't write a counter anywhere the next build would see it.
 * It's incremented by `npm run deploy` and committed. */
const deployCount = info.deploys || 0

/* Stamp the service worker's cache name at build time.
 *
 * `define` can't reach public/sw.js — Vite copies that directory verbatim,
 * it never goes through the transform pipeline. So rewrite the copy in dist/
 * after the bundle is written. This is what removes the old app's hand-bumped
 * `stack-v2` cache string, and the class of bug where forgetting to bump it
 * left an installed PWA serving stale HTML.
 */
const stampServiceWorker = () => ({
  name: 'stamp-service-worker',
  apply: 'build',
  closeBundle() {
    const out = resolve(process.cwd(), 'dist/sw.js')
    if (!existsSync(out)) {
      this.warn('dist/sw.js not found — is public/sw.js still there?')
      return
    }
    const stamp = `${pkg.version}-${deployCount}-${commit}`
    writeFileSync(out, readFileSync(out, 'utf8').replaceAll('__SW_VERSION__', stamp))
  },
})

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  define: {
    __APP_VERSION__:  JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_DATE__:   JSON.stringify(new Date().toISOString()),
    __COMMIT_COUNT__: JSON.stringify(commitCount),
    __DEPLOY_COUNT__: JSON.stringify(deployCount),
  },
})
