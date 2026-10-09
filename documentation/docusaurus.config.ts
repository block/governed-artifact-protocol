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
const [organizationName, projectName] = new URL(repoUrl).pathname.split("/").filter(Boolean);

const config: Config = {
  title: "Governed Artifact Protocol",
  tagline: "An open protocol for keeping content, its rules, and its release evidence connected across systems.",
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
      links: [
        { label: "Contribute", href: `${repoUrl}/blob/${repoBranch}/CONTRIBUTING.md` },
        { label: "Blog", to: "/blog" },
        { label: "Discussions", href: `${repoUrl}/discussions` },
        { label: "Report a problem", href: `${repoUrl}/issues/new/choose` },
        { label: "Governance", href: `${repoUrl}/blob/${repoBranch}/GOVERNANCE.md` },
        { label: "Code of conduct", href: "https://github.com/block/.github/blob/main/CODE_OF_CONDUCT.md" },
        { label: "License", href: `${repoUrl}/blob/${repoBranch}/LICENSE` },
      ],
      copyright:
        'Governed Artifact Protocol · draft · Apache-2.0' +
        '<a class="built-by" href="https://block.xyz" target="_blank" rel="noreferrer" aria-label="Built by Block">' +
        'Built by <span class="block-mark" aria-hidden="true"></span></a>',
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
