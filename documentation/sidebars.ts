import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Intro",
      collapsible: false,
      items: [
        "intro/index",
        "intro/what-is-gap",
        "intro/why-gap",
        "intro/anatomy-of-gap",
        "intro/lifecycle",
        "intro/application-actions",
      ],
    },
    {
      type: "category",
      label: "Case studies",
      collapsible: false,
      items: ["case-studies/index", "case-studies/software-support", "case-studies/in-app-content"],
    },
    {
      type: "category",
      label: "Domains",
      collapsible: false,
      // Demos use displayed_sidebar in front matter. They retain docs navigation
      // on direct entry without appearing in the sidebar or its pagination.
      items: [
        "domains/index",
        "domains/blog-website",
        "domains/issue-tracking",
        "domains/research",
        "domains/run-the-demos",
        "domains/how-the-demos-work",
        "domains/evaluation-guide",
      ],
    },
    {
      type: "category",
      label: "Specification",
      collapsible: false,
      items: [
        { type: "doc", id: "specification/README", label: "Overview" },
        { type: "doc", id: "specification/draft/README", label: "Working draft" },
        { type: "doc", id: "specification/draft/schemas", label: "Record schemas" },
        { type: "doc", id: "specification/draft/examples", label: "Example records" },
        { type: "doc", id: "specification/draft/conformance", label: "Requirements and coverage" },
      ],
    },
  ],
};

export default sidebars;
