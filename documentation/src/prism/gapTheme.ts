import type { PrismTheme } from "prism-react-renderer";

/**
 * Syntax colors for code blocks and the record viewer.
 *
 * One theme serves both color modes. Every color is a CSS variable set in
 * src/css/custom.css, so tokens follow the site palette and switch with
 * html[data-theme] without a second theme object or a colour-mode hook.
 *
 * The site is mostly JSON examples, so the theme keeps JSON calm: keys in
 * ink, punctuation in a muted step, values (strings, numbers, booleans,
 * null) in the one accent. Shell and TypeScript use the same three colors,
 * plus bold keywords, italic comments, and one more step for type names and
 * built-in types, so a `type` block does not read as plain text.
 *
 * Resolved values and WCAG contrast against the code surface (--gap-code-bg):
 *   light (#faf9f6): ink #2b2926 13.6:1, muted #66625b 5.7:1, accent #ab2a16 6.4:1, type #5a6478 5.6:1
 *   dark  (#1e1c19): ink #d3d0ca 11.1:1, muted #8f8a82 5.0:1, accent #ff8a6a 7.4:1, type #a3b0c8 7.7:1
 */
const ink = "var(--gap-code-ink)";
const muted = "var(--gap-code-muted)";
const accent = "var(--gap-code-accent)";
const type = "var(--gap-code-type)";

export const gapTheme: PrismTheme = {
  plain: {
    color: ink,
    backgroundColor: "var(--gap-code-bg)",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: muted, fontStyle: "italic" },
    },
    {
      types: ["punctuation", "operator"],
      style: { color: muted },
    },
    {
      // JSON keys, identifiers, and names of things: the same ink as prose.
      types: ["property", "tag", "attr-name", "function", "namespace", "variable", "parameter", "symbol"],
      style: { color: ink },
    },
    {
      // Type names and built-in types (string, number, boolean, Record, …).
      types: ["class-name", "builtin"],
      style: { color: type },
    },
    {
      // Values: the single accent.
      types: ["string", "char", "number", "boolean", "null", "constant", "attr-value", "regex", "url", "inserted"],
      style: { color: accent },
    },
    {
      types: ["keyword", "important", "atrule"],
      style: { color: ink, fontWeight: "bold" },
    },
    {
      types: ["deleted"],
      style: { color: muted },
    },
  ],
};
