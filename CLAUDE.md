# pcui-ai fork guidance

Read `AGENTS.md` before changing this repository. Its build, test, and style
commands remain authoritative.

## Library/application boundary

`src/components-ai/` is the reusable React + PCUI layer. Code there must be
generic: it may import React, `@playcanvas/observer`, and this repository's
PCUI internals, but never Porcellana, Undertow, an application registry shape,
an application URL, or an application transport. Domain data, preview
renderers, mutations, and network behavior enter through typed props.

The Undertow palette is reusable presentation, not application logic.
`src/scss/pcui-theme-undertow.scss` is a complete PCUI theme and imports the
AI-component styles. Do not move layout or feature-specific selectors from a
consumer application into this repository.

## Source aliases and HMR

Porcellana consumes this checkout as source during development. Use exact-match
Vite aliases in this order:

```ts
{ find: /^@playcanvas\/pcui\/ai$/, replacement: '<repo>/packages/pcui-ai/src/components-ai/index.tsx' },
{ find: /^@playcanvas\/pcui\/undertow-styles$/, replacement: '<repo>/packages/pcui-ai/src/scss/pcui-theme-undertow.scss' },
{ find: /^@playcanvas\/pcui$/, replacement: '<repo>/packages/pcui-ai/src/index.ts' },
```

The exact matches prevent the core alias from swallowing the two fork-only
entry points. Source aliases are preferred over a `file:` dependency because
they preserve Vite module identity and hot-module replacement without requiring
a PCUI rebuild after every edit. The consuming Vite config must deduplicate
`react`, `react-dom`, and `@playcanvas/observer`, and allow the submodule source
path when it sits outside the configured server root.

## Publishing and the gitlink bump

The fork commit must be pushed before Porcellana points at it; a gitlink to an
unreachable local commit breaks every other checkout.

1. In `packages/pcui-ai`, update from the fork branch, run the relevant lint,
   type, style, and build checks, then commit and push the fork changes.
2. Record the pushed commit SHA. In the Porcellana checkout, make the submodule
   resolve to exactly that SHA.
3. Stage only `packages/pcui-ai` for the gitlink change, plus the explicitly
   reviewed consumer alias/import changes. Inspect with
   `git diff --cached --submodule=log`.
4. Re-run the Porcellana verification on the parent commit that contains the
   gitlink bump, then land it through the parent's normal short-lived-branch,
   rebase, and fast-forward flow.

Do not rewrite or force-push the fork commit after a parent repository has
recorded it.

## Upstream merges

Keep fork divergence concentrated in `src/components-ai/`, the Undertow theme,
and this guidance file. Merge upstream PCUI into a dedicated sync branch,
preserve upstream behavior outside those paths, and resolve fork conflicts by
reapplying the smallest generic extension. Run the full PCUI checks on the
merged tip before advancing the fork branch or Porcellana gitlink. Application
features belong in the application even when an upstream merge makes a local
shortcut tempting.
