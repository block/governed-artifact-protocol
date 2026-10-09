import React from "react";
import useBrokenLinks from "@docusaurus/useBrokenLinks";
import type { Props } from "@theme/Details";
import s from "./styles.module.css";

/**
 * A `<details>` written in Markdown, drawn like a tool in the tool reference
 * (src/components/ToolReference) instead of Docusaurus's info alert. It is
 * the native element, so it opens without JavaScript and without animation,
 * the same as the tools.
 */
export default function Details({ summary, children, className, ...props }: Props): React.JSX.Element {
  useBrokenLinks().collectAnchor(props.id);
  // Keep the author's own <summary>, with its id and other attributes, and add the theme's class to it.
  const summaryElement = React.isValidElement<React.ComponentProps<"summary">>(summary) ? (
    React.cloneElement(summary, {
      className: summary.props.className ? `${s.summary} ${summary.props.className}` : s.summary,
      children: <span className={s.label}>{summary.props.children}</span>,
    })
  ) : (
    <summary className={s.summary}>
      <span className={s.label}>{summary ?? "Details"}</span>
    </summary>
  );
  return (
    <details {...props} className={className ? `${s.details} ${className}` : s.details}>
      {summaryElement}
      <div className={s.body}>{children}</div>
    </details>
  );
}
