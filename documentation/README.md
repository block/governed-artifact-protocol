# Documentation website

The GAP site is published at <https://block.github.io/governed-artifact-protocol/>. It uses [Docusaurus](https://docusaurus.io/). The [Documentation workflow](../.github/workflows/docs.yml) builds pull requests and deploys changes to `main` through GitHub Pages.

## Run locally

Use Node.js 22 (see [`.nvmrc`](../.nvmrc)) and pnpm. From the repository root:

```bash
pnpm install
pnpm docs:dev
```

The dev server runs at http://localhost:3000. Changes to repository sources need `pnpm docs:sync` or a server restart; authored site pages reload automatically.

## Content generation

`scripts/sync-repo-docs.mjs` runs before development, typechecking, testing, and production builds. It:

- Copies maintained Markdown from `specification/` into `docs/specification/`, preserving the specification as the source of truth.
- Assigns public slugs, rewrites links, converts GitHub alerts, and sets edit links to the source files.
- Inlines protocol SVG diagrams so they follow the site's fonts and color scheme.
- Bundles complete maintained JSON schemas and example files, plus the parsed artifact-example data, into `src/data/`.
- Runs `demo/src/manifest.ts` and writes `src/data/tools.json` for the tool reference.

Generated `docs/specification/` and `src/data/` files are ignored by git. Edit their sources, not the generated copies. The script's `SECTIONS` and `PAGES` tables control generation. A missing insertion heading fails the sync.

The protocol authors each diagram as a `<figure class="gap-diagram-figure">` in `specification/draft/README.md`. Its `.gap-diagram-header` contains the title and introduction, and its `<figcaption>` contains the explanatory paragraphs. The SVG keeps the drawing labels and accessibility metadata. The sync script inlines the drawing inside this figure; `src/clientModules/diagramZoom.ts` enlarges the whole figure, including its page-authored text. The inlined SVGs use CSS-variable colors. Drawing rules stay in [AGENTS.md](../AGENTS.md#diagrams-follow-the-sites-design-language).

Other pages under `docs/` are authored here. Docusaurus front matter supplies their titles, descriptions, and slugs. Domain authoring guidance lives in [the template](docs/domains/_template.mdx) and [AGENTS.md](../AGENTS.md); demo architecture lives in [`demo/ARCHITECTURE.md`](../demo/ARCHITECTURE.md). Project guidance stays in the repository, not in generated website pages.

## Docusaurus navigation

`sidebars.ts` defines the documentation hierarchy. Domain demos use native `displayed_sidebar: docsSidebar` front matter so direct visits retain the sidebar without adding the demos to it. Their modeling guides link to them on the page.

The site has no redirects. When a page moves, update every link to its new route; the build fails on any link left behind.

Use native `draft: true` front matter for any future unpublished doc. Docusaurus omits drafts from production builds. A draft must not remain a visible navbar or sidebar destination in a production build. The case studies in this change are included in normal builds for review.

## Check a change

From the repository root:

```bash
pnpm docs:test
pnpm --dir documentation typecheck
pnpm docs:build
pnpm docs:serve
```

The build fails on broken internal links, Markdown links, and anchors. The test runner discovers `documentation/test/*.test.*` with Node’s test runner and `tsx`. Tests cover the agreed route map, on-page-only demos, preserved conversation prompts, and generated JSON fidelity. The production server is needed to test redirect pages.

Also build under a subpath, as GitHub Pages does:

```bash
DOCS_BASE_URL=/governed-artifact-protocol/ pnpm docs:build
pnpm docs:serve
```

Inspect desktop and mobile navigation, both color themes, and a directly opened demo. JSON browsers display maintained files; rendering is not verification. Run `pnpm check:specification` to validate records, digests, and signatures.

## Blog

Posts live in `blog/` as `YYYY-MM-DD-slug.md` files. Use an `authors` entry defined in `blog/authors.yml`, a `description`, and `<!-- truncate -->` after the introduction. `page: true` on an author creates an author page. Tags are disabled. Do not put non-post Markdown in that directory.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `GAP_REPO_URL` | `https://github.com/block/governed-artifact-protocol` | Repository, edit, source, and GitHub navbar links |
| `GAP_REPO_BRANCH` | `main` | Branch used in edit and source links |
| `DOCS_URL` | `https://<org>.github.io` | Production origin |
| `DOCS_BASE_URL` | `/` | Site path (`/governed-artifact-protocol/` on a project Pages site) |

The workflow sets these from the repository and its Pages configuration.

## Deployment

The workflow deploys pushes to `main` and manual runs to <https://block.github.io/governed-artifact-protocol/>. It needs **Actions → General → Allow GitHub Actions**, and **Pages → Build and deployment → Source: GitHub Actions** in repository settings. Pull requests build without deploying.
