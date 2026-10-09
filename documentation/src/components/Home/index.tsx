import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import ContextDiagram from "./ContextDiagram";
import Wordmark from "@site/src/components/Wordmark";
import styles from "./styles.module.css";

export default function Home(): React.JSX.Element {
  return (
    <Layout description="GAP connects released content to its profile, declared source references, and release authorization.">
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

        </main>
      </div>
    </Layout>
  );
}
