import React, { useEffect, useRef } from "react";
import Link from "@docusaurus/Link";
import useBrokenLinks from "@docusaurus/useBrokenLinks";
import manifest from "@site/src/data/core-requirements.json";
import s from "./styles.module.css";

type Requirement = {
  id: string;
  name: string;
  statement: string;
  coverage?: { executable: string[]; notes: string };
  retired?: { reason: string; replacedBy: string[] };
};

const requirements = manifest.requirements as Requirement[];
const anchor = (id: string) => id.toLowerCase();
const countLabel = (count: number) => count === 0 ? "No executable checks cited" : `${count} cited ${count === 1 ? "source" : "sources"}`;

export default function RequirementsCoverage(): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const { collectAnchor } = useBrokenLinks();
  requirements.forEach((requirement) => collectAnchor(anchor(requirement.id)));

  useEffect(() => {
    const revealHash = () => {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      const target = document.getElementById(id);
      if (!(target instanceof HTMLDetailsElement) || !root.current?.contains(target)) return;
      target.open = true;
      target.scrollIntoView({ block: "start" });
    };
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, []);

  return (
    <div ref={root} className={s.reference}>
      <h2>Requirements and evidence</h2>
      <p>Open a requirement to read its full statement, cited checks, and coverage notes.</p>
      {requirements.map((requirement) => (
        <details key={requirement.id} id={anchor(requirement.id)} className={s.requirement}>
          <summary>
            <code>{requirement.id}</code>
            <span>{requirement.name}</span>
            <small>{requirement.retired ? "Retired" : countLabel(requirement.coverage?.executable.length ?? 0)}</small>
          </summary>
          {requirement.retired ? (
            <div className={s.body}>
              <p className={s.statement}>{requirement.retired.reason}</p>
              {requirement.retired.replacedBy.length > 0 && (
                <p>Replaced by {requirement.retired.replacedBy.map((id, index) => (
                  <React.Fragment key={id}>{index > 0 && ", "}<Link href={`#${anchor(id)}`}><code>{id}</code></Link></React.Fragment>
                ))}.</p>
              )}
              <h3>Last statement</h3>
              <p>{requirement.statement}</p>
            </div>
          ) : (
            <div className={s.body}>
              <p className={s.statement}>{requirement.statement}</p>
              <h3>Cited checks</h3>
              {requirement.coverage?.executable.length ? (
                <ul>{requirement.coverage.executable.map((citation) => {
                  const separator = citation.indexOf(" (");
                  const path = separator < 0 ? citation : citation.slice(0, separator);
                  const detail = separator < 0 ? "" : citation.slice(separator + 2, -1);
                  return <li key={citation}><Link href={`${manifest.repositoryUrl}/${path}`}>{path}</Link>{detail && <> — {detail}</>}</li>;
                })}</ul>
              ) : <p>No executable check is cited for this requirement.</p>}
              <h3>Coverage notes</h3>
              <p>{requirement.coverage?.notes}</p>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}
