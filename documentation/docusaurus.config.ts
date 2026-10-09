import type { Config } from "@docusaurus/types";
import type { Options as BlogOptions } from "@docusaurus/plugin-content-blog";
import type { Options as DocsOptions } from "@docusaurus/plugin-content-docs";
import type { Options as PagesOptions } from "@docusaurus/plugin-content-pages";
import type { Options as ThemeOptions } from "@docusaurus/theme-classic";
import type { UserThemeConfig } from "@docusaurus/theme-common";
import { gapTheme } from "./src/prism/gapTheme";

const repoUrl = (process.env.GAP_REPO_URL ?? "https://github.com/block/governed-artifact-protocol").replace(/\/$/, "");
const repoBranch = process.env.GAP_REPO_BRANCH ?? "main";
const baseUrl = process.env.DOCS_BASE_URL ?? "/";
// The one short description of GAP: the site tagline, the footer, the home
// page's meta description, and the GitHub repository description all use it.
const tagline = "An open protocol for keeping context with content across systems and teams.";
const [organizationName, projectName] = new URL(repoUrl).pathname.split("/").filter(Boolean);

const config: Config = {
  title: "Governed Artifact Protocol",
  tagline,
  favicon: "img/favicon.svg",
  headTags: [
    { tagName: "link", attributes: { rel: "icon", type: "image/png", sizes: "32x32", href: `${baseUrl}img/favicon-32.png` } },
    { tagName: "link", attributes: { rel: "apple-touch-icon", sizes: "180x180", href: `${baseUrl}img/apple-touch-icon.png` } },
  ],

  url: process.env.DOCS_URL ?? `https://${organizationName}.github.io`,
  baseUrl,

  organizationName,
  projectName,

  clientModules: [require.resolve("./src/clientModules/diagramZoom.ts")],

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  markdown: {
    format: "detect",
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      {
        routeBasePath: "/",
        sidebarPath: "./sidebars.ts",
        editUrl: `${repoUrl}/edit/${repoBranch}/documentation/`,
        showLastUpdateTime: false,
        versions: {
          current: { label: "Draft" },
        },
      } satisfies DocsOptions,
    ],
    [
      "@docusaurus/plugin-content-blog",
      {
        path: "blog",
        routeBasePath: "blog",
        blogTitle: "Blog",
        blogDescription: "Notes from the GAP project as the draft develops.",
        blogSidebarCount: 0,
        showReadingTime: true,
        editUrl: `${repoUrl}/edit/${repoBranch}/documentation/`,
        feedOptions: {
          type: ["rss", "atom"],
          xslt: true,
        },
        tags: false,
        onInlineTags: "throw",
        onInlineAuthors: "warn",
        onUntruncatedBlogPosts: "warn",
      } satisfies BlogOptions,
    ],
    [
      "@docusaurus/plugin-content-pages",
      {
        path: "src/pages",
      } satisfies PagesOptions,
    ],
  ],

  themes: [
    [
      "@docusaurus/theme-classic",
      {
        customCss: [
          require.resolve("@fontsource/bungee/400.css"),
          require.resolve("@fontsource/karla/400.css"),
          require.resolve("@fontsource/karla/400-italic.css"),
          require.resolve("@fontsource/karla/700.css"),
          require.resolve("@fontsource/karla/700-italic.css"),
          "./src/css/custom.css",
        ],
      } satisfies ThemeOptions,
    ],
  ],

  themeConfig: {
    // Link previews. Docusaurus adds og:image and twitter:image from `image`, as absolute URLs; the tags below are
    // ones it leaves out. Blog posts replace og:type with "article".
    image: "img/social-card.png",
    metadata: [
      { property: "og:site_name", content: "Governed Artifact Protocol" },
      { property: "og:type", content: "website" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Governed Artifact Protocol" },
      { name: "twitter:image:alt", content: "Governed Artifact Protocol" },
    ],
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: false,
        autoCollapseCategories: false,
      },
    },
    navbar: {
      title: "",
      // On a phone the bar slides away while reading down and returns on the way back up; the stylesheet keeps
      // it in place on the wide layout.
      hideOnScroll: true,
      items: [
        {
          to: "/specification/working-draft",
          label: "Draft specification",
          position: "left",
          className: "version-menu",
        },
        { to: "/intro", label: "Intro", position: "right" },
        { to: "/case-studies", label: "Case studies", position: "right" },
        { to: "/domains", label: "Domains", position: "right" },
        { to: "/blog", label: "Blog", position: "right" },
        { href: repoUrl, "aria-label": "GitHub", title: "GitHub", className: "navbar-github", position: "right" },
      ],
    },
    footer: {
      style: "light",
      // Columns: the project, its tagline, and its credit, then two groups of
      // links. The credit sits at the bottom of its column, level with the
      // longest list.
      links: [
        {
          title: "Governed Artifact Protocol",
          className: "footer__brand",
          items: [
            { html: tagline, className: "footer__tagline" },
            {
              html:
                '<a class="built-by" href="https://block.xyz" target="_blank" rel="noreferrer" aria-label="Built by Block">' +
                'Built by <span class="block-mark" aria-hidden="true"></span></a>',
            },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "Contribute", href: `${repoUrl}/blob/${repoBranch}/CONTRIBUTING.md` },
            { label: "Governance", href: `${repoUrl}/blob/${repoBranch}/GOVERNANCE.md` },
            { label: "License", href: `${repoUrl}/blob/${repoBranch}/LICENSE` },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "Blog", to: "/blog" },
            { label: "Discussions", href: `${repoUrl}/discussions` },
            { label: "Report a problem", href: `${repoUrl}/issues/new/choose` },
            { label: "Code of conduct", href: "https://github.com/block/.github/blob/main/CODE_OF_CONDUCT.md" },
          ],
        },
      ],
    },
    prism: {
      // One theme built from CSS variables; it follows html[data-theme] itself.
      theme: gapTheme,
      darkTheme: gapTheme,
      additionalLanguages: ["json", "bash", "typescript"],
    },
  } satisfies UserThemeConfig,
};

export default config;
