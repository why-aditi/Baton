# Baton marketing site

The public page for Baton, in the "developer dark" design picked on Nov 23
([marketing pages canvas](https://claude.ai/artifact/WYzrLVa7dcu8xntdvEUqHj), sample 3).
Next.js 16 (App Router) with static export: `npm run build` writes plain files to `out/`, so any static
host works (GitHub Pages, Netlify, Vercel, S3).

**Live at https://why-aditi.github.io/Baton/.** `.github/workflows/site.yml` builds and publishes it to GitHub Pages
on every push to `main` that touches `site/` (or run it by hand from the Actions tab). It builds with
`BASE_PATH=/Baton`, since Pages serves the repo under `/Baton/`; locally the site stays at `/`.

```sh
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in out/
npm run lint     # typecheck
```

- **Copy and product facts** live in `app/content.ts`. Keep them in step with the app: the scoring weights
  with `app/src/scoring/risk.ts`, the tools with `app/manifest.yml`.
- **Fonts** (Manrope, JetBrains Mono) are downloaded by `next/font` at build time and served from the site,
  so the page makes no requests to Google.
- **Install link:** `installUrl` in `app/content.ts`, the Forge installation link from the developer console
  (Baton → Distribution). Every install button uses it. Generating a new link there invalidates the old one, so
  update it here too.
- The hero's inventory and the chat are examples from the Northwind Pay demo data and are labelled as such.
