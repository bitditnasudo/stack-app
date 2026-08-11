# STACK

Daily skincare, supplement and training protocol tracker. One user, no server,
no accounts. Installed as a PWA.

Built on the [Vantarco UI template](../../VANTARCO%20APP%20DATABASE/) — React 18
+ Vite 5 + react-router-dom, on the kit's **wine** theme.

**Live:** <https://stack-app-flame-phi.vercel.app> — Vercel project
`vantarco/stack-app`, building from `main` of this repo.

```bash
npm install
npm run dev
```

- **[CLAUDE.md](CLAUDE.md)** — project knowledge: the domain, the architecture,
  the bugs not to reintroduce. Read this first.
- **[MIGRATION.md](MIGRATION.md)** — moving your history off the old GitHub
  Pages build.
- `node verify.mjs` — domain assertions (day classification, task-id contract,
  local date keys, week maths).

Ship with:

```bash
npm run deploy && git push
```
