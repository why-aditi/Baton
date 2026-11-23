# Baton Custom UI

React 18 + Vite + Atlaskit, served by the `jira:globalPage` module from `build/`.

```sh
npm install
npm test          # Vitest + jsdom
npm run build     # typecheck, then build/ for forge deploy
npm run dev       # then open /preview.html?screen=list|new|handover with test data (&theme=dark)
```

- Screens never import `@forge/bridge`. `src/main.tsx` wires the bridge into a `Platform` context
  (`src/platform.tsx`), so tests and the preview swap in fakes.
- Routes (`src/route.ts`): `/` handover list, `/new` New handover, `/handover/<id>` (the link Rovo uses;
  `?build=1` starts reading the graph on open), `/dev` resolver test page (dev only, remove before submission).
- Shared types and logic come straight from the backend in `../src` (types, `buildInventory`,
  `reasonPoints`), so the UI and the resolvers can't drift.
