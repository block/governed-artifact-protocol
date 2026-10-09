import React from "react";
import Link from "@docusaurus/Link";
import { BlogPostProvider, useBlogPost } from "@docusaurus/plugin-content-blog/client";
import type { Props } from "@theme/BlogPostItems";
import styles from "./styles.module.css";

/**
 * Editorial list for blog index pages: a date column, the title, one line of
 * excerpt, and the authors. Individual post pages still use the default
 * BlogPostItem layout with the full author block.
 */
function BlogListRow(): React.JSX.Element {
  const { metadata } = useBlogPost();
  const { permalink, title, date, description, authors } = metadata;
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
  const namedAuthors = authors.filter((author) => author.name);

  return (
    <li className={styles.row}>
      <time dateTime={date} className={styles.date}>
        {formattedDate}
      </time>
      <div className={styles.body}>
        <h2 className={styles.title}>
          <Link to={permalink}>{title}</Link>
        </h2>
        {description && <p className={styles.excerpt}>{description}</p>}
        {namedAuthors.length > 0 && (
          <ul className={styles.authors} aria-label="Authors">
            {namedAuthors.map((author) => (
              <li className={styles.author} key={author.key ?? author.name}>
                {author.imageURL && (
                  <img className={styles.avatar} src={author.imageURL} alt="" loading="lazy" />
                )}
                <span>{author.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function BlogPostItems({ items }: Props): React.JSX.Element {
  return (
    <ul className={styles.list}>
      {items.map(({ content: BlogPostContent }) => (
        <React.Fragment key={BlogPostContent.metadata.permalink}>
          <BlogPostProvider content={BlogPostContent}>
            <BlogListRow />
          </BlogPostProvider>
        </React.Fragment>
      ))}
    </ul>
  );
}
