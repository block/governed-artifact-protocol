import React from "react";
import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import s from "./styles.module.css";

type Props = {
  /** The domain's id, as in its URL: /domains/<domain>. */
  domain: string;
  /** Set false for a domain that has no walkthrough yet. */
  walkthrough?: boolean;
};

/**
 * The two views of a domain: the explainer at /domains/<domain> and the
 * walkthrough beneath it. Rendered at the top of both pages, so the sidebar
 * lists the domain once and the reader switches views here.
 */
export default function DomainNav({ domain, walkthrough = true }: Props): React.JSX.Element | null {
  const { pathname } = useLocation();
  const {
    siteConfig: { baseUrl },
  } = useDocusaurusContext();
  const base = `/domains/${domain}`;
  const tabs = [{ label: "Modeling guide", to: base }];
  if (walkthrough) tabs.push({ label: "Demo", to: `${base}/demo` });
  if (tabs.length < 2) return null;
  // The tab targets are relative to the site root, but the browser's path
  // carries the baseUrl the site is served from. Drop that prefix so the
  // active tab is found on a site under a subpath, not just at the root.
  const prefix = baseUrl.replace(/\/$/, "");
  const here = pathname.slice(prefix.length).replace(/\/$/, "");
  return (
    <nav className={s.nav} aria-label="Views of this domain">
      {tabs.map((tab) => {
        const active = here === tab.to;
        return (
          <Link key={tab.to} to={tab.to} className={active ? `${s.tab} ${s.active}` : s.tab} aria-current={active ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
