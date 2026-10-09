import React from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { useThemeConfig } from "@docusaurus/theme-common";
import type { Props } from "@theme/Logo";
import Wordmark from "@site/src/components/Wordmark";
import styles from "./styles.module.css";

/**
 * Navbar brand. Replaces the image logo and title text with the typographic
 * wordmark; the site title remains the link's accessible label. The theme's
 * image and title class names are dropped on purpose: the logo class forces a
 * fixed image height that misaligns text.
 */
export default function Logo({ imageClassName: _imageClassName, titleClassName: _titleClassName, ...props }: Props): React.JSX.Element {
  const {
    siteConfig: { title },
  } = useDocusaurusContext();
  const {
    navbar: { logo },
  } = useThemeConfig();
  const to = useBaseUrl(logo?.href || "/");
  return (
    <Link to={to} {...props} aria-label={title}>
      <Wordmark size="1.15rem" className={styles.mark} />
    </Link>
  );
}
