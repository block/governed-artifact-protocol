import React, { useRef, useState } from "react";
import s from "./styles.module.css";

/*
 * A walkthrough is a conversation, so it is laid out as one: your messages
 * on the right, the agent's on the left, with the role as metadata rather
 * than a heading in the text. Models word things differently and call
 * tools in a different order, so an agent turn is labelled as one reply an
 * agent could give, and an Expect note, which is not a turn, says what the
 * tools record whichever way the agent phrases it.
 */

export function Chat({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className={s.chat}>{children}</div>;
}

function CopyButton({ target }: { target: React.RefObject<HTMLDivElement | null> }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = target.current?.innerText ?? "";
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" className={s.copy} onClick={copy} aria-live="polite">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function You({ children }: { children: React.ReactNode }): React.JSX.Element {
  const body = useRef<HTMLDivElement>(null);
  return (
    <div className={s.you}>
      <div className={s.meta}>
        <CopyButton target={body} />
        <span>You</span>
      </div>
      <div className={s.bubble} ref={body}>
        {children}
      </div>
    </div>
  );
}

export function Agent({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={s.agent}>
      <div className={s.meta}>
        <span>Agent</span>
        <span className={s.hint}>how it might respond</span>
      </div>
      <div className={s.reply}>{children}</div>
    </div>
  );
}

export function Expect({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <aside className={s.expect}>
      <div className={s.expectLabel}>What happens</div>
      <div className={s.expectBody}>{children}</div>
    </aside>
  );
}
