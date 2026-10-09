import React, { useEffect, useRef } from "react";
import Link from "@docusaurus/Link";
import useBrokenLinks from "@docusaurus/useBrokenLinks";
import CodeBlock from "@theme/CodeBlock";
import inventory from "@site/src/data/json-files.json";
import s from "./styles.module.css";

type Collection = "schemas" | "examples";
type JsonFile = (typeof inventory.files)[number];

const SCHEMAS = "/specification/record-schemas";
const EXAMPLES = "/specification/example-records";
const DRAFT = "/specification/working-draft";
const fragment = (anchor: string) => `#${encodeURIComponent(anchor)}`;
const coreSchema = inventory.files.find((file) => file.collection === "schemas" && file.relativePath === "core.schema.json");
const RECORD_DEFINITIONS = [
  "ProfileProposal", "Ratification", "ProfileRevision", "ArtifactVersion",
  "ReleaseApproval", "ReleaseRejection", "ReleaseAuthorization", "Release",
  "ReleaseWithdrawal", "ReleaseProof",
];
const SHARED_DEFINITIONS = ["Actor", "ProfilePin", "DependencySet", "AuthoritySignature", "Reason", "TrustStore"];
const schemaAnchor = (name: string) => `schema-${name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
const definitionLabel = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");
const GROUP_TITLES: Record<string, string> = {
  cms: "Blog website (cms)",
  "issue-tracking": "Issue tracking",
  "research": "Research publishing",
  schemas: "Schema files",
  examples: "Example files",
};

/**
 * All files are rendered on the server, including the complete code in closed
 * disclosures. JavaScript only enhances deep links and expand/collapse buttons.
 * No fetch, upload, validation, digest calculation, or signature verification.
 */
export default function JsonFiles({ collection }: { collection: Collection }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const { collectAnchor } = useBrokenLinks();
  const files = inventory.files.filter((file) => file.collection === collection);
  const singleSchema = collection === "schemas" && files.length === 1;
  const definitions = singleSchema ? (JSON.parse(files[0].source) as { $defs: Record<string, unknown> }).$defs : null;
  const groups = [...new Set(files.map((file) => file.group))];
  // Native disclosure IDs are not MDX headings; register them for link checks.
  files.forEach((file) => collectAnchor(file.anchor));
  if (definitions) [...RECORD_DEFINITIONS, ...SHARED_DEFINITIONS].forEach((name) => collectAnchor(schemaAnchor(name)));

  useEffect(() => {
    const revealHash = () => {
      let anchor: string;
      try {
        anchor = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(anchor);
      if (!target || !root.current?.contains(target)) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ block: "start" });
    };
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, [collection]);

  const expandAll = (open: boolean) => {
    root.current?.querySelectorAll("details").forEach((details) => { details.open = open; });
  };

  const revealFile = (anchor: string) => {
    const target = document.getElementById(anchor);
    if (target instanceof HTMLDetailsElement) target.open = true;
  };

  const relatedLinks = (file: JsonFile) => (
    <p>
      <Link href={file.github}>Source file</Link>
      {collection === "schemas" ? (
        <> · <Link to={EXAMPLES}>Example records</Link> · <Link to={DRAFT}>Working draft</Link></>
      ) : (
        <>
          {" · "}<Link to={`${SCHEMAS}${coreSchema && file.definition ? fragment(coreSchema.anchor) : ""}`}>Record schemas</Link>
          {file.definition && <> (<code>{`#/$defs/${file.definition}`}</code>)</>}
          {file.kind !== "unknown" && <>{" · "}<Link to={`${DRAFT}#${file.kind === "release-proof-withdrawn" ? "release-proof" : file.kind}`}>Definition in the draft</Link></>}
        </>
      )}
      {" · "}<Link to={fragment(file.anchor)} onClick={() => revealFile(file.anchor)}>Link to this file</Link>
    </p>
  );

  if (singleSchema && definitions) {
    const file = files[0];
    return (
      <div ref={root} className={s.schemaReference}>
        <h2>Definition excerpts</h2>
        <p>Open a definition to see its JSON Schema. The complete file is below.</p>
        {[...RECORD_DEFINITIONS, ...SHARED_DEFINITIONS].map((name) => (
          <details key={name} id={schemaAnchor(name)} className={s.definition}>
            <summary><span>{definitionLabel(name)}</span><code>{`#/$defs/${name}`}</code></summary>
            <CodeBlock language="json">{JSON.stringify(definitions[name], null, 2)}</CodeBlock>
          </details>
        ))}
        <section>
          <h2>Complete schema</h2>
          <details id={file.anchor} className={s.definition}>
            <summary><span>{file.relativePath}</span><span>View full source</span></summary>
            {relatedLinks(file)}
            <CodeBlock language="json" title={file.relativePath}>{file.source}</CodeBlock>
          </details>
        </section>
        <section>
          <h2>What this is for</h2>
          <p>Use <Link href={file.github}><code>core.schema.json</code></Link> in a JSON Schema validator to check a record’s fields and types. To run the repository’s checks on its <Link to={EXAMPLES}>example records</Link>, use <code>pnpm check:specification</code>.</p>
        </section>
      </div>
    );
  }

  return (
    <div ref={root}>
      <p>
        {files.length} maintained JSON {files.length === 1 ? "file" : "files"}. Open a filename to read its complete, syntax-highlighted source.
        {" "}The text is bundled from the repository at build time, without reformatting.
      </p>
      <p>
        This browser renders files; it does not validate records, recompute digests, or verify signatures.
        {" "}<Link to={`${DRAFT}#6-read-and-verify`}>Read and verify</Link> defines the checks.
        {" "}<code>pnpm check:specification</code> checks the maintained examples.
        {collection === "examples" && <> Trust stores are reader configuration, not GAP records or part of a proof.</>}
      </p>
      <p>
        <button className="button button--secondary button--sm" type="button" onClick={() => expandAll(true)}>Expand all files</button>
        {" "}<button className="button button--secondary button--sm" type="button" onClick={() => expandAll(false)}>Collapse all files</button>
      </p>
      {groups.map((group) => (
        <section key={group} aria-labelledby={`json-${collection}-group-${group}`}>
          <h3 id={`json-${collection}-group-${group}`}>{GROUP_TITLES[group] ?? group}</h3>
          {files.filter((file) => file.group === group).map((file) => (
            <details key={file.path} id={file.anchor} className="margin-bottom--md">
              <summary><code>{file.relativePath}</code> — {file.title}</summary>
              <p>{file.description}</p>
              {relatedLinks(file)}
              <CodeBlock language="json" title={file.relativePath}>{file.source}</CodeBlock>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
