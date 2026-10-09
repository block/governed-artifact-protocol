import React, { useCallback, useEffect, useState } from "react";
import type { Props } from "@theme/MDXComponents/Img";
import styles from "./styles.module.css";

/**
 * Markdown images open large on click. The image is wrapped in a button;
 * activating it shows the same image in a full-window overlay that closes
 * on click or Escape. Images inside links are left alone.
 */
export default function MDXImg(props: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const { className, ...rest } = props;
  const image = <img decoding="async" loading="lazy" {...rest} className={[styles.img, className ?? ""].join(" ")} />;

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label={`Enlarge image: ${props.alt ?? "figure"}`}>
        {image}
      </button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={props.alt ?? "Enlarged image"} onClick={close}>
          <img src={props.src} alt={props.alt ?? ""} className={styles.large} />
          <button type="button" className={styles.close} onClick={close} aria-label="Close">
            Close
          </button>
        </div>
      )}
    </>
  );
}
