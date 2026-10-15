import assert from "node:assert/strict";
import { test } from "node:test";
import { cardPath } from "../plugins/social-cards/path";
import { CARD_HEIGHT, CARD_WIDTH, renderCard } from "../plugins/social-cards/render";

test("a post's card path drops the base URL so the page can add it back", () => {
  assert.equal(cardPath("/blog/hello-world", "/"), "img/og/blog/hello-world.png");
  assert.equal(
    cardPath("/governed-artifact-protocol/blog/hello-world", "/governed-artifact-protocol/"),
    "img/og/blog/hello-world.png",
  );
  assert.equal(cardPath("/blog/hello-world/", "/"), "img/og/blog/hello-world.png");
});

test("cards render as PNGs at the size the site's og:image tags declare", async () => {
  for (const title of ["Hello World", "What should travel with an agent’s summary? ".repeat(4).trim()]) {
    const png = await renderCard({ title, authors: ["A Person", "Another Person"], date: new Date("2026-10-01") });
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    // IHDR: width and height are the first two fields after the 16-byte header.
    assert.equal(png.readUInt32BE(16), CARD_WIDTH);
    assert.equal(png.readUInt32BE(20), CARD_HEIGHT);
  }
});
