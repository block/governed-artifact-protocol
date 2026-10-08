import React from "react";
import s from "./styles.module.css";

type Props = {
  /** Font size of the letters; the mark scales with it. */
  size?: string;
  className?: string;
};

/**
 * The GAP wordmark: the three letters in the display face. Typographic only;
 * no image.
 */
export default function Wordmark({ size = "1.4rem", className }: Props): React.JSX.Element {
  return (
    <span className={[s.mark, className ?? ""].join(" ")} style={{ fontSize: size }}>
      GAP
    </span>
  );
}
