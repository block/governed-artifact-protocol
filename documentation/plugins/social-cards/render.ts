import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

/**
 * Renders a blog post's link-preview card: a 1200x630 PNG with the post's
 * title in Bungee on the site's paper and grain, the protocol's name above it,
 * and the authors and date below. Ink and gray only, like the site's diagrams.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export type CardContent = {
  title: string;
  authors: string[];
  date: Date;
};

// The light palette from src/css/custom.css. Link previews have no theme, so
// cards always use the light one.
const paper = "#f4f2ee";
const ink = "#151412";
const muted = "#74706a";

// The light theme's --gap-grain filter, painted over the whole card at the
// same scale the site uses at 1x.
const grain =
  "<filter id='card-grain'><feTurbulence type='turbulence' baseFrequency='0.55' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='-1.4' intercept='1.5'/><feFuncG type='linear' slope='-1.4' intercept='1.5'/><feFuncB type='linear' slope='-1.4' intercept='1.5'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer><feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.6 0 0 0 0.6'/></filter>";

const require = createRequire(import.meta.url);
// Satori reads WOFF but not WOFF2.
const font = (file: string) => readFileSync(require.resolve(`@fontsource/${file}`));
const fonts = [
  { name: "Bungee", data: font("bungee/files/bungee-latin-400-normal.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Karla", data: font("karla/files/karla-latin-400-normal.woff"), weight: 400 as const, style: "normal" as const },
  { name: "Karla", data: font("karla/files/karla-latin-700-normal.woff"), weight: 700 as const, style: "normal" as const },
];

/** Bungee is wide, so long titles step down a size to stay within four lines. */
export function titleSize(title: string): number {
  if (title.length <= 24) return 96;
  if (title.length <= 48) return 76;
  if (title.length <= 80) return 60;
  return 50;
}

function byline({ authors, date }: CardContent): string {
  const names =
    authors.length <= 2 ? authors.join(" and ") : `${authors.slice(0, -1).join(", ")}, and ${authors.at(-1)}`;
  const formatted = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return names ? `${names} · ${formatted}` : formatted;
}

// Satori takes React-shaped elements; building them as objects keeps this a
// plain .ts module.
type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown> } };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

function layout(content: CardContent): Node {
  const size = titleSize(content.title);
  return el(
    "div",
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      paddingTop: 72,
      paddingRight: 80,
      paddingBottom: 68,
      paddingLeft: 80,
      color: ink,
    },
    [
      el(
        "div",
        {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          paddingBottom: 18,
          borderBottom: `2px solid ${ink}`,
        },
        [
          el("div", { fontFamily: "Bungee", fontSize: 26 }, "Governed Artifact Protocol"),
          el(
            "div",
            { fontFamily: "Karla", fontWeight: 700, fontSize: 20, letterSpacing: 3, color: muted },
            "BLOG",
          ),
        ],
      ),
      el(
        "div",
        {
          display: "block",
          fontFamily: "Bungee",
          fontSize: size,
          lineHeight: 1.08,
          lineClamp: 4,
          textOverflow: "ellipsis",
        },
        content.title,
      ),
      el("div", { fontFamily: "Karla", fontSize: 28, color: muted }, byline(content)),
    ],
  );
}

export async function renderCard(content: CardContent): Promise<Buffer> {
  const svg = await satori(layout(content) as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
  // Satori cannot paint SVG filters, so lay the paper and grain under its
  // output before rasterizing.
  const background = `<defs>${grain}</defs><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${paper}"/><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" filter="url(#card-grain)"/>`;
  const layered = svg.replace(/^<svg[^>]*>/, (open) => `${open}${background}`);
  return new Resvg(layered, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
}
