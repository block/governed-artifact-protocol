import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

// Catch sync regressions that leave the picture intact but lose its page text.
test("diagram titles, introductions, and captions survive inlining as figure content", () => {
  const source = read("specification/draft/README.md");
  const generated = read("documentation/docs/specification/draft/README.md");
  const figures = [...source.matchAll(/<figure class="gap-diagram-figure"[^>]*>[\s\S]*?<\/figure>/g)];
  assert.equal(figures.length, 4);
  for (const [figure] of figures) {
    const image = figure.match(/\]\(diagrams\/([\w-]+)\.svg\)/);
    assert(image, "figure must reference its maintained drawing");
    const name = image[1];
    const svg = read(`specification/draft/diagrams/${name}.svg`).trim();
    const expected = figure.replace(/^!\[[^\]]*\]\(diagrams\/[\w-]+\.svg\)$/m, () => svg);
    assert(generated.includes(expected), `${name}: the figure and its text must survive sync together`);
    const heading = figure.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1];
    assert(heading);
    assert.match(figure, /<header[^>]*>[\s\S]*?<p>.+?<\/p>/);
    assert.match(figure, /<figcaption>\s*<p>.+?<\/p>/);
    assert(!new RegExp(`<text[^>]*>${heading}</text>`).test(svg), `${name}: visible title belongs to the page`);
    assert.match(svg, /<title[^>]*>.+?<\/title>/);
    assert.match(svg, /<desc[^>]*>.+?<\/desc>/);
  }
});
