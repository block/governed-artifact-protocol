import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { PageMetadata } from "@docusaurus/theme-common";
import { useBlogPost } from "@docusaurus/plugin-content-blog/client";
import { cardPath } from "@site/plugins/social-cards/path";

/**
 * The theme's blog post metadata, with the post's generated card as the
 * default link-preview image (plugins/social-cards). A post that sets `image`
 * in front matter keeps its own image and the site's default alt text.
 */
export default function BlogPostPageMetadata(): React.JSX.Element {
  const { assets, metadata } = useBlogPost();
  const { siteConfig } = useDocusaurusContext();
  const { title, description, date, tags, authors, frontMatter } = metadata;
  const { keywords } = frontMatter;
  const ownImage = assets.image ?? frontMatter.image;
  const image = ownImage ?? cardPath(metadata.permalink, siteConfig.baseUrl);
  const alt = `${title}, on the Governed Artifact Protocol blog`;
  return (
    <PageMetadata title={frontMatter.title_meta ?? title} description={description} keywords={keywords} image={image}>
      <meta property="og:type" content="article" />
      <meta property="article:published_time" content={date} />
      {authors.some((author) => author.url) && (
        <meta
          property="article:author"
          content={authors
            .map((author) => author.url)
            .filter(Boolean)
            .join(",")}
        />
      )}
      {tags.length > 0 && <meta property="article:tag" content={tags.map((tag) => tag.label).join(",")} />}
      {!ownImage && <meta property="og:image:alt" content={alt} />}
      {!ownImage && <meta name="twitter:image:alt" content={alt} />}
    </PageMetadata>
  );
}
