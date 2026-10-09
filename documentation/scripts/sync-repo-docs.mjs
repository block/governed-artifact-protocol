#!/usr/bin/env node
/**
 * Copies repository markdown into documentation/docs so the website renders
 * the same content that lives next to the specification and code.
 *
 * The repository files remain the source of truth. This script:
 *   - copies selected markdown files and the images they reference,
 *   - flattens directories that contain only a README into a single page,
 *   - rewrites relative links so they point at the synced pages or at
 *     committed site pages, or at the file on GitHub when the target is not
 *     part of the site,
 *   - converts GitHub alert blockquotes (> [!NOTE]) into Docusaurus admonitions,
 *   - moves the H1 into front matter (title) so Docusaurus finds it even when
 *     an admonition precedes it, and adds per-page front matter (slug),
 *   - writes a few pages as .mdx and inserts site components (the artifact
 *     examples and the lifecycle illustrations) before marked headings,
 *   - replaces the protocol's diagram images with the SVG files' own markup,
 *     so the diagrams render inline and take the page's fonts and theme,
 *   - bundles every schema and example JSON file as raw text for schema browsing,
 *     and keeps the parsed src/data/records bundles for artifact examples,
 *   - runs the demo's manifest script and writes src/data/tools.json for the
 *     tool reference, so the documented tools are the registered tools.
 *
 * Run from documentation/: `node scripts/sync-repo-docs.mjs`
 * Environment: GAP_REPO_URL, GAP_REPO_BRANCH (default main).
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");
const DOCS_DIR = path.resolve(here, "..", "docs");
const DATA_DIR = path.resolve(here, "..", "src", "data", "records");
const JSON_FILES_FILE = path.resolve(here, "..", "src", "data", "json-files.json");
const CORE_REQUIREMENTS_FILE = path.resolve(here, "..", "src", "data", "core-requirements.json");
const TOOLS_FILE = path.resolve(here, "..", "src", "data", "tools.json");
const MANIFEST_SCRIPT = path.join("demo", "src", "manifest.ts");
const REPO_URL = (process.env.GAP_REPO_URL ?? "https://github.com/block/governed-artifact-protocol").replace(/\/$/, "");
const REPO_BRANCH = process.env.GAP_REPO_BRANCH ?? "main";

const IGNORED_DIRS = new Set(["node_modules", "dist", ".local-workspace", ".local-tls", ".git"]);
const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/**
 * What gets synced. `source` is repository-relative; `dest` is relative to
 * documentation/docs. Directories are copied recursively (markdown + images)
 * and their previous output is removed first. Single files replace only
 * their own destination, so committed pages beside them are kept.
 */
const SECTIONS = [
  { source: "specification", dest: "specification" },
];

const JSON_FILES_IMPORT = 'import JsonFiles from "@site/src/components/JsonFiles";';
const ARTIFACT_EXAMPLE_IMPORT = 'import ArtifactExample from "@site/src/components/ArtifactExample";';
const REQUIREMENTS_COVERAGE_IMPORT = 'import RequirementsCoverage from "@site/src/components/RequirementsCoverage";';

/**
 * Per-page adjustments keyed by repository path: extra front matter; for
 * pages written as .mdx, the imports to add and the components to insert
 * before a heading (the heading line must match exactly); and
 * `inlineDiagrams`, which pastes each SVG under the page's diagrams/ folder
 * into the page in place of its image. The page stays CommonMark, where raw
 * HTML renders as is, so the draft's HTML anchors keep working; the SVG
 * carries its own title and description.
 */
const PAGES = {
  "specification/README.md": {
    frontMatter: { title: "Specification", slug: "/specification" },
  },
  "specification/draft/README.md": {
    frontMatter: { title: "Working draft", slug: "/specification/working-draft" },
    inlineDiagrams: true,
  },
  "specification/draft/schemas/README.md": {
    frontMatter: { title: "Record schemas", slug: "/specification/record-schemas" },
    mdx: {
      imports: [JSON_FILES_IMPORT],
      append: '<JsonFiles collection="schemas" />',
    },
  },
  "specification/draft/examples/README.md": {
    frontMatter: { title: "Example records", slug: "/specification/example-records" },
    mdx: {
      imports: [ARTIFACT_EXAMPLE_IMPORT],
      before: [
        ["## Issue tracking", '<ArtifactExample set="cms" artifactId="blog-post:monarch-migration" id="example-monarch-migration" />'],
        ["## Research publishing", '<ArtifactExample set="issue-tracking" artifactId="ticket:subtraction" id="example-subtraction-ticket" />'],
        ["### Previously published study", '<ArtifactExample set="research" artifactId="paper:floating-gummy-worm-recall" id="example-recall-paper" />'],
        ["### Previously published methods paper", '<ArtifactExample set="research" artifactId="paper:zero-gravity-story-pace" id="example-pace-study" />'],
        ["### Peer-review report", '<ArtifactExample set="research" artifactId="paper:jellybean-quiz" id="example-jellybean-quiz" />'],
        ["### Editor notes", '<ArtifactExample set="research" artifactId="review:floating-gummy-worm-recall" id="example-peer-report" />'],
        ["### Publication evidence", '<ArtifactExample set="research" artifactId="editor-notes:floating-gummy-worm-recall" id="example-editor-notes" />'],
      ],
    },
  },
  "specification/draft/conformance/README.md": {
    frontMatter: { title: "Requirements and coverage", slug: "/specification/requirements-and-coverage" },
    mdx: {
      imports: [REQUIREMENTS_COVERAGE_IMPORT],
      replaceBlocks: [{
        start: "<!-- BEGIN CORE REQUIREMENTS -->",
        end: "<!-- END CORE REQUIREMENTS -->",
        replacement: "<RequirementsCoverage />",
      }],
    },
  },
};

/**
 * Example record collections bundled for the website.
 */
const EXAMPLES_DIR = "specification/draft/examples";
/* Every JSON file in each example folder is bundled. */
const RECORD_SETS = ["cms", "issue-tracking", "research"];

const ALERT_TO_ADMONITION = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "info",
  WARNING: "warning",
  CAUTION: "danger",
};

const toPosix = (p) => p.split(path.sep).join("/");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Build the map of repository markdown files to their destination paths. */
export async function planFiles() {
  /** @type {Map<string, {dest: string, frontMatter: object, mdx?: object}>} sourceRel -> plan */
  const plan = new Map();

  const finish = (sourceRel, dest, extraFrontMatter = {}) => {
    const page = PAGES[sourceRel] ?? {};
    if (page.mdx) dest = dest.replace(/\.md$/, ".mdx");
    plan.set(sourceRel, { dest, frontMatter: { ...extraFrontMatter, ...(page.frontMatter ?? {}) }, mdx: page.mdx, inlineDiagrams: page.inlineDiagrams });
  };

  for (const section of SECTIONS) {
    const sourceAbs = path.join(REPO_ROOT, section.source);
    if (!(await exists(sourceAbs))) {
      console.warn(`warning: skipping ${section.source}; it does not exist in the repository`);
      continue;
    }
    const stat = await fs.stat(sourceAbs);
    if (stat.isFile()) {
      finish(toPosix(section.source), section.dest, section.frontMatter);
      continue;
    }

    const files = (await walk(sourceAbs)).filter((f) => f.endsWith(".md"));
    const byDir = new Map();
    for (const f of files) {
      const dir = path.dirname(f);
      byDir.set(dir, [...(byDir.get(dir) ?? []), f]);
    }

    for (const f of files) {
      const rel = toPosix(path.relative(REPO_ROOT, f));
      const relInSection = toPosix(path.relative(sourceAbs, f));
      const dirAbs = path.dirname(f);
      const siblings = byDir.get(dirAbs);
      const isReadme = path.basename(f).toLowerCase() === "readme.md";
      const dirHasSubdocs = files.some((other) => other !== f && other.startsWith(dirAbs + path.sep));
      const isSectionRoot = dirAbs === sourceAbs;

      let dest;
      if (isReadme && siblings.length === 1 && !dirHasSubdocs && !isSectionRoot) {
        // A directory whose only page is its README becomes a single page.
        dest = toPosix(path.join(section.dest, path.dirname(relInSection) + ".md"));
      } else {
        dest = toPosix(path.join(section.dest, relInSection));
      }
      finish(rel, dest);
    }
  }

  return plan;
}

function splitFences(text) {
  // Returns [{code: boolean, text}] segments so transforms skip fenced blocks.
  const lines = text.split("\n");
  const segments = [];
  let buffer = [];
  let inFence = false;
  let fenceMarker = null;
  const flush = (code) => {
    if (buffer.length) segments.push({ code, text: buffer.join("\n") });
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!inFence && match) {
      flush(false);
      inFence = true;
      fenceMarker = match[1][0];
      buffer.push(line);
    } else if (inFence && match && match[1][0] === fenceMarker) {
      buffer.push(line);
      flush(true);
      inFence = false;
      fenceMarker = null;
    } else {
      buffer.push(line);
    }
  }
  flush(inFence);
  return segments;
}

function convertAlerts(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/);
    if (!match) {
      out.push(lines[i]);
      continue;
    }
    const body = [];
    let j = i + 1;
    while (j < lines.length && /^>/.test(lines[j])) {
      body.push(lines[j].replace(/^>\s?/, ""));
      j += 1;
    }
    out.push(`:::${ALERT_TO_ADMONITION[match[1]]}`, ...body, ":::");
    i = j - 1;
  }
  return out.join("\n");
}

function extractTitle(text) {
  const match = text.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

/** Insert MDX snippets before the given heading lines (outside code fences). */
function insertBeforeHeadings(text, inserts) {
  const lines = text.split("\n");
  let inFence = false;
  const pending = new Map(inserts);
  const out = [];
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    const key = line.trimEnd();
    if (!inFence && pending.has(key)) {
      out.push(pending.get(key), "");
      pending.delete(key);
    }
    out.push(line);
  }
  for (const heading of pending.keys()) throw new Error(`insert marker not found: ${JSON.stringify(heading)}`);
  return out.join("\n");
}

/**
 * Replace each diagram image with the SVG file itself. The markup is one HTML
 * block with no blank lines, which CommonMark passes through untouched.
 */
async function inlineDiagrams(text, sourceAbs, sourceRel, warnings) {
  const pattern = /^!\[[^\]]*\]\((?:\.\/)?(diagrams\/[\w-]+\.svg)\)[ \t]*$/gm;
  for (const match of [...text.matchAll(pattern)]) {
    const file = path.join(path.dirname(sourceAbs), match[1]);
    if (!(await exists(file))) {
      warnings.push(`${sourceRel}: diagram not found: ${match[1]}`);
      continue;
    }
    const svg = (await fs.readFile(file, "utf8")).trim();
    if (/\n\s*\n/.test(svg)) throw new Error(`${match[1]}: a blank line would end the HTML block`);
    text = text.replace(match[0], () => svg);
  }
  return text;
}

/** Stable, path-based IDs distinguish files with the same name in different sets. */
export const jsonFileAnchor = (collection, relativePath) => `json-${collection}/${relativePath}`;

// Reading aids only: the draft defines these shapes and their meaning.
const EXAMPLE_TYPES = {
  "profile-revision": ["Profile revision", "The ratified content model, its contract digest, and ratification decision. Artifact versions pin this revision.", "ProfileRevision"],
  "artifact-version": ["Artifact version", "Content, authorship, and the exact profile revision the version follows.", "ArtifactVersion"],
  "release-approval": ["Release approval", "An approval authority's decision on the exact version. It does not release the content.", "ReleaseApproval"],
  "release-rejection": ["Release rejection", "An approval authority's rejection of the exact version. It adds a record and does not by itself block a later decision.", "ReleaseRejection"],
  "release-authorization": ["Release authorization", "The decision permitting release of the exact artifact version, payload digest, and profile pin.", "ReleaseAuthorization"],
  "release-withdrawal": ["Release withdrawal", "A later decision withdrawing a released version without changing its existing records or selecting another version.", "ReleaseWithdrawal"],
  "release-proof-withdrawn": ["Release proof with withdrawal", "The original proof with a withdrawal attached; the original records remain unchanged.", "ReleaseProof"],
  "release-proof": ["Release proof", "Profile revision, authorization, release, and any attached decisions for a consumer to verify together.", "ReleaseProof"],
  release: ["Release", "The payload and profile pin as received by a consumer through the release boundary.", "Release"],
  "trust-store": ["Trust store configuration", "The reader's trusted public keys and permitted authority actions. Configuration, not a GAP record or part of a proof.", "TrustStore"],
};

/** Read every JSON file recursively. Keep the original text, including whitespace. */
export async function collectJsonFiles({ repoRoot = REPO_ROOT, repoUrl = REPO_URL, repoBranch = REPO_BRANCH } = {}) {
  const files = [];
  for (const collection of ["schemas", "examples"]) {
    const root = path.join(repoRoot, "specification", "draft", collection);
    const paths = (await walk(root)).filter((file) => file.endsWith(".json")).sort();
    for (const absolute of paths) {
      const relativePath = toPosix(path.relative(root, absolute));
      const sourcePath = toPosix(path.relative(repoRoot, absolute));
      const source = await fs.readFile(absolute, "utf8");
      const json = JSON.parse(source);
      const name = path.basename(relativePath);
      const kind = Object.keys(EXAMPLE_TYPES).find((type) => name === `${type}.json` || name.startsWith(`${type}_`));
      const [title, description, definition] = EXAMPLE_TYPES[kind] ?? ["Example JSON", "A maintained example file. Consult the set's explanation for its role.", null];
      files.push({
        collection,
        name,
        relativePath,
        path: sourcePath,
        group: path.posix.dirname(relativePath) === "." ? collection : path.posix.dirname(relativePath),
        anchor: jsonFileAnchor(collection, relativePath),
        title: collection === "schemas" ? (json.title ?? name) : title,
        description: collection === "schemas" ? (json.description ?? "JSON Schema definitions; the working draft is normative.") : description,
        kind: collection === "schemas" ? "schema" : (kind ?? "unknown"),
        definition: collection === "examples" ? definition : null,
        github: `${repoUrl.replace(/\/$/, "")}/blob/${repoBranch}/${sourcePath}`,
        source,
      });
    }
  }
  return { files };
}

export async function bundleJsonFiles(options = {}, destination = JSON_FILES_FILE) {
  const inventory = await collectJsonFiles(options);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

/** Remove retired generated copies only; never remove an authored Project page. */
export async function cleanLegacyDocs(docsDir = DOCS_DIR) {
  const generated = /GENERATED by documentation\/scripts\/sync-repo-docs\.mjs from /;
  for (const legacy of ["index.md", "reference-implementations", "examples", "project/deferred.md", "project/contributing.md"]) {
    const target = path.join(docsDir, legacy);
    if (!(await exists(target))) continue;
    const files = (await fs.stat(target)).isDirectory() ? await walk(target) : [target];
    for (const file of files) {
      if (!/\.mdx?$/.test(file)) continue;
      if (generated.test(await fs.readFile(file, "utf8"))) await fs.unlink(file);
    }
  }
  // Empty directories are harmless, but removing this one avoids suggesting
  // that Project is still an authored website section. Nonempty stays intact.
  try { await fs.rmdir(path.join(docsDir, "project")); }
  catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
}

async function bundleRecordSets(warnings) {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  let count = 0;
  for (const name of RECORD_SETS) {
    const files = [];
    const names = (await fs.readdir(path.join(REPO_ROOT, EXAMPLES_DIR, name))).filter((f) => f.endsWith(".json")).sort();
    for (const file of names) {
      const rel = `${EXAMPLES_DIR}/${name}/${file}`;
      const abs = path.join(REPO_ROOT, rel);
      if (!(await exists(abs))) {
        warnings.push(`record not found: ${rel}`);
        continue;
      }
      files.push({
        name: file,
        path: rel,
        github: `${REPO_URL}/blob/${REPO_BRANCH}/${rel}`,
        json: JSON.parse(await fs.readFile(abs, "utf8")),
      });
    }
    await fs.writeFile(path.join(DATA_DIR, `${name}.json`), `${JSON.stringify({ set: name, files }, null, 2)}\n`);
    count += files.length;
  }
  return count;
}

/**
 * Ask the demo for its tool manifest and store it for the tool reference. The
 * demo is TypeScript, so this runs it through tsx from the repository root.
 */
async function bundleToolManifest() {
  const json = execFileSync(process.execPath, ["--import", "tsx", MANIFEST_SCRIPT], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const manifest = JSON.parse(json);
  await fs.mkdir(path.dirname(TOOLS_FILE), { recursive: true });
  await fs.writeFile(TOOLS_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.applications.reduce((total, application) => total + application.groups.reduce((sum, group) => sum + group.actions.length, 0), 0);
}

async function main() {
  const plan = await planFiles();
  const warnings = [];
  const assetsToCopy = new Map(); // sourceAbs -> destAbs

  // Remove previously generated output so deleted sources disappear. Section
  // directories are wholly generated; single files replace only themselves.
  // The legacy locations came from earlier site layouts (the domain pages were
  // once synced from reference-implementations/ into docs/examples/). Removing
  // them prevents an existing checkout from retaining stale pages.
  await cleanLegacyDocs();
  for (const section of SECTIONS) {
    await fs.rm(path.join(DOCS_DIR, section.dest), { recursive: true, force: true });
    await fs.rm(path.join(DOCS_DIR, section.dest.replace(/\.md$/, ".mdx")), { force: true });
  }

  for (const [sourceRel, { dest, frontMatter, mdx, inlineDiagrams: inline }] of plan) {
    const sourceAbs = path.join(REPO_ROOT, sourceRel);
    const destAbs = path.join(DOCS_DIR, dest);
    const raw = await fs.readFile(sourceAbs, "utf8");

    const rewriteLink = (target) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/")) return target;
      const [pathPart, anchor] = target.split("#");
      const anchorSuffix = anchor ? `#${anchor}` : "";
      let resolved = path.resolve(path.dirname(sourceAbs), decodeURI(pathPart));
      let resolvedRel = toPosix(path.relative(REPO_ROOT, resolved));

      // Directory links resolve to their README.
      if (plan.has(`${resolvedRel}/README.md`)) resolvedRel = `${resolvedRel}/README.md`;

      // Links to committed site pages (documentation/docs/*) become relative
      // doc links, so repository markdown can point at pages that exist only
      // on the site; on GitHub they still open the page source.
      if (resolvedRel.startsWith("documentation/docs/")) {
        let rel = toPosix(path.relative(path.dirname(destAbs), path.join(DOCS_DIR, resolvedRel.slice("documentation/docs/".length))));
        if (!rel.startsWith(".")) rel = `./${rel}`;
        return `${rel}${anchorSuffix}`;
      }

      const targetPlan = plan.get(resolvedRel);
      if (targetPlan) {
        let rel = toPosix(path.relative(path.dirname(destAbs), path.join(DOCS_DIR, targetPlan.dest)));
        if (!rel.startsWith(".")) rel = `./${rel}`;
        return `${rel}${anchorSuffix}`;
      }

      if (IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
        const assetDest = path.join(path.dirname(destAbs), pathPart);
        assetsToCopy.set(resolved, assetDest);
        return target;
      }

      return { external: resolvedRel, anchorSuffix, resolved };
    };

    const transformed = await Promise.all(
      splitFences(raw).map(async (segment) => {
        if (segment.code) return segment.text;
        let text = convertAlerts(segment.text);
        if (inline) text = await inlineDiagrams(text, sourceAbs, sourceRel, warnings);
        const replacements = [];
        text.replace(/(!?)\[((?:[^\[\]]|!\[[^\]]*\]\([^)]*\))*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (full, bang, label, target, title = "") => {
          replacements.push({ full, bang, label, target, title });
          return full;
        });
        for (const r of replacements) {
          const result = rewriteLink(r.target);
          let newTarget;
          if (typeof result === "string") {
            newTarget = result;
          } else if (await exists(result.resolved)) {
            const isDir = (await fs.stat(result.resolved)).isDirectory();
            newTarget = `${REPO_URL}/${isDir ? "tree" : "blob"}/${REPO_BRANCH}/${result.external}${result.anchorSuffix}`;
          } else {
            warnings.push(`${sourceRel}: link target not found: ${r.target}`);
            continue;
          }
          if (newTarget !== r.target) {
            text = text.replace(r.full, `${r.bang}[${r.label}](${newTarget}${r.title})`);
          }
        }
        return text;
      }),
    );

    let body = transformed.join("\n");
    const title = extractTitle(body);
    if (title) body = body.replace(/^#\s+.+?\s*$\n?/m, "");
    for (const block of mdx?.replaceBlocks ?? []) {
      const start = body.indexOf(block.start);
      const end = body.indexOf(block.end, start + block.start.length);
      if (start < 0 || end < 0) throw new Error(`${sourceRel}: missing replacement block ${block.start}`);
      body = `${body.slice(0, start)}${block.replacement}${body.slice(end + block.end.length)}`;
    }
    if (mdx?.before) body = insertBeforeHeadings(body, mdx.before);
    if (mdx?.append) body = `${body.trimEnd()}\n\n${mdx.append}\n`;

    const fm = {
      ...(title ? { title } : {}),
      custom_edit_url: `${REPO_URL}/edit/${REPO_BRANCH}/${sourceRel}`,
      ...frontMatter,
    };
    const fmText = Object.entries(fm)
      .map(([k, v]) => `${k}: ${typeof v === "number" ? v : JSON.stringify(v)}`)
      .join("\n");
    const bannerText = `GENERATED by documentation/scripts/sync-repo-docs.mjs from ${sourceRel}. Edit the source file, not this copy.`;
    const head = mdx ? [`{/* ${bannerText} */}`, "", ...mdx.imports].join("\n") : `<!-- ${bannerText} -->`;

    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.writeFile(destAbs, `---\n${fmText}\n---\n\n${head}\n\n${body.trimEnd()}\n`);
  }

  for (const [src, dst] of assetsToCopy) {
    if (!(await exists(src))) {
      warnings.push(`asset not found: ${toPosix(path.relative(REPO_ROOT, src))}`);
      continue;
    }
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  const jsonFiles = await bundleJsonFiles();
  const requirements = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "specification/draft/conformance/core-requirements.json"), "utf8"));
  await fs.writeFile(CORE_REQUIREMENTS_FILE, `${JSON.stringify({ ...requirements, repositoryUrl: `${REPO_URL}/blob/${REPO_BRANCH}` }, null, 2)}\n`);
  const records = await bundleRecordSets(warnings);
  const tools = await bundleToolManifest();

  console.log(
    `Bundled ${jsonFiles.files.length} JSON files. Synced ${plan.size} pages and ${assetsToCopy.size} assets into ${toPosix(path.relative(REPO_ROOT, DOCS_DIR))}/, ${records} example records into ${toPosix(path.relative(REPO_ROOT, DATA_DIR))}/, and ${tools} demo tools into ${toPosix(path.relative(REPO_ROOT, TOOLS_FILE))}`,
  );
  for (const w of warnings) console.warn(`warning: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
