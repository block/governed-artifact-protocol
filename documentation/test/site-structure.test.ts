import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sidebars from "../sidebars";
import config from "../docusaurus.config";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const docs = "documentation/docs/";

const pages: Record<string, string> = {
  "intro/index.mdx": "/intro",
  "intro/why-gap.md": "/intro/why-gap",
  "intro/what-is-gap.md": "/intro/what-is-gap",
  "intro/anatomy-of-gap.mdx": "/intro/anatomy-of-gap",
  "intro/lifecycle.mdx": "/intro/lifecycle",
  "intro/application-actions.mdx": "/intro/application-actions",
  "case-studies/index.mdx": "/case-studies",
  "case-studies/software-support.mdx": "/case-studies/software-support",
  "case-studies/in-app-content.mdx": "/case-studies/in-app-content",
  "domains/index.mdx": "/domains",
  "domains/blog-website.mdx": "/domains/blog-website",
  "domains/blog-website/demo.mdx": "/domains/blog-website/demo",
  "domains/issue-tracking.mdx": "/domains/issue-tracking",
  "domains/issue-tracking/demo.mdx": "/domains/issue-tracking/demo",
  "domains/research.mdx": "/domains/research",
  "domains/research/demo.mdx": "/domains/research/demo",
  "domains/how-the-demos-work.mdx": "/domains/how-the-demos-work",
  "domains/run-the-demos.md": "/domains/run-the-demos",
  "domains/evaluation-guide.md": "/domains/evaluation-guide",
  "specification/README.md": "/specification",
  "specification/draft/README.md": "/specification/working-draft",
  "specification/draft/schemas.mdx": "/specification/record-schemas",
  "specification/draft/examples.mdx": "/specification/example-records",
  "specification/draft/conformance.mdx": "/specification/requirements-and-coverage",
};

function frontMatter(content: string) {
  assert(content.startsWith("---\n"));
  return content.split("---")[1];
}

test("all agreed documentation pages have unique production routes and content", () => {
  const slugs = new Set<string>();
  for (const [file, slug] of Object.entries(pages)) {
    const text = read(docs + file);
    const fm = frontMatter(text);
    const actual = fm.match(/^slug:\s*["']?([^"'\s]+)["']?$/m)?.[1];
    assert.equal(actual, slug, file);
    assert(!slugs.has(slug), `duplicate ${slug}`);
    slugs.add(slug);
    assert(!/^draft:\s*true/m.test(fm), `${file} must be reviewable in production builds`);
    assert(text.split("---").slice(2).join("---").trim().length > 200, `${file} is not a placeholder`);
  }
});

test("the four section headings follow #218 without Project or a second Demo section", () => {
  const categories = sidebars.docsSidebar as { type: string; label: string; items: unknown[] }[];
  assert.deepEqual(categories.map((item) => item.label), ["Intro", "Case studies", "Domains", "Specification"]);
  assert.deepEqual(categories.map((category) => category.items.map((item) => typeof item === "string" ? item : (item as { id: string }).id)), [
    ["intro/index", "intro/what-is-gap", "intro/why-gap", "intro/anatomy-of-gap", "intro/lifecycle", "intro/application-actions"],
    ["case-studies/index", "case-studies/software-support", "case-studies/in-app-content"],
    ["domains/index", "domains/blog-website", "domains/issue-tracking", "domains/research", "domains/run-the-demos", "domains/how-the-demos-work", "domains/evaluation-guide"],
    ["specification/README", "specification/draft/README", "specification/draft/schemas", "specification/draft/examples", "specification/draft/conformance"],
  ]);
  const sidebarText = JSON.stringify(categories);
  assert(!sidebarText.includes("project/"));
  assert(!sidebarText.includes("/demo\""));
  assert(!existsSync(`${root}${docs}project/index.md`));
});

test("header and footer follow #218, with Project destinations in the repository", () => {
  const theme = config.themeConfig as {
    navbar: { items: { to?: string; href?: string; label?: string; title?: string; "aria-label"?: string }[] };
    footer: { links: { title: string; items: { to?: string; href?: string; label?: string; html?: string }[] }[] };
  };
  assert.deepEqual(theme.navbar.items.filter((item) => item.to).map((item) => [item.label, item.to]), [
    ["Draft specification", "/specification/working-draft"],
    ["Intro", "/intro"], ["Case studies", "/case-studies"], ["Domains", "/domains"], ["Blog", "/blog"],
  ]);
  const github = theme.navbar.items.find((item) => item.href);
  assert.equal(github?.["aria-label"], "GitHub");
  assert.equal(github?.title, "GitHub");
  const [brand, ...columns] = theme.footer.links;
  assert.equal(brand.title, "Governed Artifact Protocol");
  assert.equal(brand.items[0].html, config.tagline);
  assert(brand.items.at(-1)?.html?.includes('href="https://block.xyz"'));
  assert.deepEqual(columns.map((column) => [column.title, column.items.map((item) => item.label)]), [
    ["Project", ["Contribute", "Governance", "License"]],
    ["Community", ["Blog", "Discussions", "Report a problem", "Code of conduct"]],
  ]);
  const footerLinks = columns.flatMap((column) => column.items);
  assert(footerLinks.find((item) => item.label === "Contribute")?.href?.endsWith("/CONTRIBUTING.md"));
  assert(!footerLinks.some((item) => item.to?.startsWith("/project")));
});

test("on-page-only demos keep native docs navigation on direct visits", () => {
  for (const [domain, next] of [["blog-website", "issue-tracking"], ["issue-tracking", "research"], ["research", "run-the-demos"]]) {
    const text = read(`${docs}domains/${domain}/demo.mdx`);
    const fm = frontMatter(text);
    assert.match(fm, /^displayed_sidebar: docsSidebar$/m);
    assert(fm.includes(`pagination_prev: domains/${domain}
`));
    assert(fm.includes(`pagination_next: domains/${next}
`));
    assert(text.includes(`<DomainNav domain="${domain}" />`));
    assert(read(`${docs}domains/${domain}.mdx`).includes(`<DomainNav domain="${domain}" />`));
  }
});

test("all 59 operational conversation prompts match the reviewed walkthroughs", () => {
  // Intentional walkthrough changes can update these receipts.
  for (const [domain, count, hash] of [
    ["blog-website", 22, "db4843dc8a4fe8a5c586ccfb50c767dc4bcdb4d633373c00609d2316c76f6f78"],
    ["issue-tracking", 12, "1203981e2785831748447d7081b18798d59f72660b192d70cc784521b6c940d6"],
    ["research", 25, "5e87995699e5982ef8ed5435f9323d39d6fc7b08812d5bb190f224832fbfb4ba"],
  ] as const) {
    const prompts = [...read(`${docs}domains/${domain}/demo.mdx`).matchAll(/<You>([\s\S]*?)<\/You>/g)].map((match) => match[1]);
    assert.equal(prompts.length, count, domain);
    assert.equal(digest(prompts.join("\n")), hash, domain);
  }
});

test("homepage leads into Intro without a duplicate summary", () => {
  const home = read("documentation/src/components/Home/index.tsx");
  assert(!home.includes("What GAP does"));
  assert(!home.includes("styles.summary"));
  assert(home.includes('to="/intro">Learn more →</Link>'), "the hero leads into Intro");

});

test("homepage closes on exploring the protocol, each path a real page", () => {
  const home = read("documentation/src/components/Home/index.tsx");
  assert(home.includes(">Explore the protocol.</h2>"));
  const routes = [...home.matchAll(/to: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, ["/intro", "/case-studies", "/domains", "/specification/working-draft"]);
  for (const route of routes) assert(Object.values(pages).includes(route), route);
});

test("tool manifest points to real canonical docs routes", () => {
  const manifest = JSON.parse(read("documentation/src/data/tools.json"));
  const slugs = Object.values(pages);
  for (const application of manifest.applications) {
    for (const route of Object.values(application.docs ?? {})) assert(slugs.includes(route as string), String(route));
  }
});
