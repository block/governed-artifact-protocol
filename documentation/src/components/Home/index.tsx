import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import ContextDiagram from "./ContextDiagram";
import Wordmark from "@site/src/components/Wordmark";
import styles from "./styles.module.css";

const PATHS = [
  { title: "Intro", to: "/intro", description: "What GAP is, why it matters, and what travels with each release." },
  {
    title: "Case studies",
    to: "/case-studies",
    description: "Fictional stories of content changing hands, and how GAP could help.",
  },
  {
    title: "Domains",
    to: "/domains",
    description: "GAP modeled for a blog, an issue tracker, and a research journal. Building each one helps shape the draft.",
  },
  {
    title: "Working draft",
    to: "/specification/working-draft",
    description: "Every normative rule, with record schemas, example records, and requirements coverage.",
  },
];

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout description={siteConfig.tagline}>
      {/* The example spills out of the column to the viewport's edge; this keeps it from ever scrolling sideways
          where scrollbars take up room, since viewport units count the scrollbar and the page does not. */}
      <div className={styles.page}>
        <main className={styles.home}>
          <header className={styles.opening}>
            <div className={styles.brand}>
              <Wordmark size="clamp(3rem, 7vw, 5.5rem)" />
              <p>Governed Artifact Protocol</p>
            </div>
            <h1 className={styles.title}>Keep context<br />with content.</h1>
            <p className={styles.lede}>
              Content moves between people, AI agents, and applications.
              Its rules, source references, and release decisions should travel with it.
            </p>
            <Link className={styles.primaryLink} to="/intro">Learn more →</Link>
          </header>

          <section className={styles.visual} aria-labelledby="example-heading">
            <ContextDiagram />
          </section>

          {/* The page closes on where to go next, its heading answering the example's: each path once, in the
              order a newcomer would take them. */}
          <section className={styles.close} aria-labelledby="next-heading">
            <div className={styles.closeCopy}>
              <h2 id="next-heading" className={styles.closeTitle}>Explore the protocol.</h2>
              <p>How does GAP work, where does it help, and what does it require?</p>
            </div>
            <nav className={styles.paths} aria-labelledby="next-heading">
              {PATHS.map((path) => (
                <Link key={path.to} className={styles.path} to={path.to}>
                  <span className={styles.pathTitle}>{path.title}</span>
                  <span className={styles.pathDescription}>{path.description}</span>
                  <span className={styles.pathArrow} aria-hidden="true">→</span>
                </Link>
              ))}
            </nav>
          </section>
        </main>
      </div>
    </Layout>
  );
}
