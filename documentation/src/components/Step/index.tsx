import React from "react";
import Link from "@docusaurus/Link";
import manifest from "@site/src/data/tools.json";
import s from "./styles.module.css";

/*
 * The one way the site names a lifecycle step or a release decision: a chip
 * that links into the draft. The data is the demo's lifecycle table
 * (demo/src/gap/lifecycle.ts), written to src/data/tools.json by the sync
 * script, so a chip can only name a step the protocol has. A step carries its
 * number in the muted grey; a decision carries a diamond.
 */

export type StepData = {
  id: string;
  kind: "lifecycle" | "decision";
  number?: number;
  title: string;
  label: string;
  chip: string;
  gloss: string;
  plane: string;
  role: string;
  anchor: string;
  summary: string;
};

export const STEPS: StepData[] = (manifest as { steps: StepData[] }).steps;
const byId = new Map(STEPS.map((step) => [step.id, step]));

export function stepData(id: string): StepData {
  const step = byId.get(id);
  if (!step) throw new Error(`Step: "${id}" is not a lifecycle step or release decision in the demo manifest`);
  return step;
}

/** One chip: the step's number or a decision's diamond, a middot, then its short name, linking to the draft. */
export function Step({ id }: { id: string }): React.JSX.Element {
  const step = stepData(id);
  const decision = step.kind === "decision";
  return (
    <Link to={`/specification/working-draft#${step.anchor}`} className={decision ? `${s.chip} ${s.decision}` : s.chip} title={`${step.title}. ${step.summary}`}>
      <span className={s.mark} aria-hidden="true">
        {decision ? "◇" : step.number}
      </span>
      <span className={s.label}>
        <span className={s.sr}>{decision ? "Release decision: " : `Step ${step.number}: `}</span>
        {step.chip}
      </span>
    </Link>
  );
}

type StepsProps = {
  /** Step ids, as an array or a space-separated string. */
  ids: string | readonly string[];
  /** Render as a row of its own rather than inline with text. */
  block?: boolean;
  /** Shown when there are no ids. */
  none?: string;
};

/** A row of chips, or a muted "None". */
export function Steps({ ids, block = false, none = "None" }: StepsProps): React.JSX.Element {
  const list = typeof ids === "string" ? ids.split(/[\s,]+/).filter(Boolean) : [...ids];
  if (list.length === 0) return <span className={block ? `${s.none} ${s.block}` : s.none}>{none}</span>;
  return (
    <span className={block ? `${s.row} ${s.block}` : s.row}>
      {list.map((id) => (
        <Step key={id} id={id} />
      ))}
    </span>
  );
}

/** The lifecycle steps or the release decisions as a list: one chip and one plain sentence each, from the demo's lifecycle table. */
export function StepList({ kind }: { kind: "lifecycle" | "decision" }): React.JSX.Element {
  return (
    <ul>
      {STEPS.filter((step) => step.kind === kind).map((step) => (
        <li key={step.id}>
          <Step id={step.id} /> {step.gloss}
        </li>
      ))}
    </ul>
  );
}
