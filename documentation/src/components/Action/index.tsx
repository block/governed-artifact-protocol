import React from "react";
import Link from "@docusaurus/Link";
import { Steps } from "@site/src/components/Step";
import s from "./styles.module.css";

/*
 * The actions an application offers, as rows a reader can scan: the action's
 * name (a deep link to its section) and the chips for the steps it performs
 * and decisions it records on one line, the description beneath.
 */

export function ActionList({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className={s.list}>{children}</div>;
}

type ActionProps = {
  /** Anchor of the section that describes the action, e.g. "#save-a-draft". */
  href: string;
  title: string;
  /** Step ids, space-separated. Omit or leave empty when the action performs none. */
  steps?: string;
  children: React.ReactNode;
};

export function Action({ href, title, steps = "", children }: ActionProps): React.JSX.Element {
  return (
    <div className={s.item}>
      <div className={s.head}>
        <Link to={href} className={s.title}>
          {title}
        </Link>
        <Steps ids={steps} none="No step, no decision" />
      </div>
      <div className={s.body}>{children}</div>
    </div>
  );
}
