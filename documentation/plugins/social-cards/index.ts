import { promises as fs } from "node:fs";
import path from "node:path";
import type { LoadContext, Plugin } from "@docusaurus/types";
import type { BlogContent } from "@docusaurus/plugin-content-blog";
import { cardPath } from "./path";
import { renderCard } from "./render";

/**
 * Renders a link-preview card for every blog post into static/img/og/, so the
 * dev server and the build both serve it. BlogPostPage/Metadata points each
 * post's og:image at its card unless the post sets `image` in front matter.
 * The directory is generated and ignored by git.
 */
export default function socialCards(context: LoadContext): Plugin {
  const { siteDir, siteConfig } = context;
  return {
    name: "gap-social-cards",
    async allContentLoaded({ allContent }) {
      const blog = allContent["docusaurus-plugin-content-blog"]?.default as BlogContent | undefined;
      const outDir = path.join(siteDir, "static", "img", "og");
      await fs.rm(outDir, { recursive: true, force: true });
      for (const { metadata } of blog?.blogPosts ?? []) {
        const file = path.join(siteDir, "static", cardPath(metadata.permalink, siteConfig.baseUrl));
        const png = await renderCard({
          title: metadata.title,
          authors: metadata.authors.map((author) => author.name).filter((name): name is string => Boolean(name)),
          date: new Date(metadata.date),
        });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, png);
      }
    },
  };
}
