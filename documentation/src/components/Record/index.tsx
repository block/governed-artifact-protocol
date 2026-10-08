import React from "react";
import CodeBlock from "@theme/CodeBlock";
import cms from "@site/src/data/records/cms.json";
import issueTracking from "@site/src/data/records/issue-tracking.json";
import research from "@site/src/data/records/research.json";
import s from "./styles.module.css";

/*
 * The record sets are bundled by scripts/sync-repo-docs.mjs from
 * specification/draft/examples into src/data/records. They are the same files
 * that check-specification.mjs validates and the demo's tests read, so a
 * record shown on a page is a record that is tested. A name that is not in
 * the set fails the build.
 */

type RecordFile = { name: string; json: unknown };
type RecordSet = { set: string; files: RecordFile[] };

const SETS: Record<string, RecordSet> = {
  cms: cms as RecordSet,
  "issue-tracking": issueTracking as RecordSet,
  "research": research as RecordSet,
};

type Props = {
  /** One of cms, issue-tracking, research. */
  set: keyof typeof SETS;
  /** File name within the set, with or without .json. */
  name: string;
  /** One line naming the record, shown in the title bar that folds it. */
  title: string;
  /** Start folded. */
  collapsed?: boolean;
};

/**
 * Shows one example record from the specification as a code block, exactly
 * as the repository holds it, in the reading order the example generator
 * writes. Every record sits behind a title bar that folds and unfolds it;
 * `collapsed` starts it folded.
 */
export default function RecordBlock({ set, name, title, collapsed = false }: Props): React.JSX.Element {
  const data = SETS[set];
  if (!data) throw new Error(`Record: unknown set "${set}"`);
  const file = data.files.find((f) => f.name === name || f.name === `${name}.json`);
  if (!file) throw new Error(`Record: "${name}" is not in specification/draft/examples/${set}`);
  return (
    <details className={s.record} open={!collapsed}>
      <summary className={s.summary}>
        <span className={s.chevron} aria-hidden="true" />
        <span className={s.text}>{title}</span>
        <span className={s.tag}>JSON</span>
      </summary>
      <div className={s.body}>
        <CodeBlock language="json">{JSON.stringify(file.json, null, 2)}</CodeBlock>
      </div>
    </details>
  );
}
