import React, { useEffect, useMemo, useRef, useState } from "react";
import cms from "@site/src/data/records/cms.json";
import type { RecordFile, RecordSet } from "@site/src/components/RecordModel";
import styles from "./diagram.module.css";

/*
 * Two columns. Everything a reader reads is on the left, aligned with the hero
 * and never moving: the section's heading, a paragraph, and one control.
 * Everything that moves is on the right, in a shallow three-dimensional scene:
 * the post as a publication would print it, cut off mid-line on purpose, and
 * the records that travel with that exact version: the release, the profile
 * it pins, and the three decisions recorded against it.
 *
 * The scene opens as a teaser. The post sits sharp on top of a pile; the five
 * records fan out behind it, fogged past reading, so there is plainly more
 * there. The left column invites the press. Pressing the button is the
 * reveal: the records fly out from behind the post to their places, the one in
 * focus coming forward beside the post, while on the left the paragraph
 * becomes that record's caption and the button becomes the pager, in the same
 * spot. From then on one record is always in focus. It holds still at full
 * height, and the others hang further back, smaller and fogged toward the page
 * color; they never go transparent, so nothing shows through them. Choosing a
 * record, by clicking it or paging, swaps it with the one in focus.
 *
 * The post and the focused record are as tall as the viewport allows, so a
 * tall screen shows more of each. On a phone there is no scene: the post, then
 * one record at a time, each under its own caption, so a reader knows what a
 * card is before scrolling through it.
 *
 * Choosing a record, by clicking it or paging with the arrows, swaps it with
 * the one in focus: the two trade places in the scene and the rest keep
 * drifting where they are.
 *
 * A record card shows the whole record as an outline, its nesting kept and its
 * long values clipped. It is read from the bundled copy of
 * specification/draft/examples/cms/*_four-locale-post.json, so nothing on this
 * page is typed in by hand.
 */

const SET = cms as RecordSet;
const SUFFIX = "_four-locale-post.json";
const OUTLINE_DEPTH = 3;
const RESIZE = 150;   // how far into a flight a card's name changes size, in one step, in ms
const REVEAL = 650;   // how long the reveal, a swap, and the reset back to the pile take, in ms; the stylesheet's timings match
const SCENE_WIDTH = 1000;   // the scene is laid out in these pixels wide and scaled down to fit narrower columns

const LOCALE = "en-US";   // the post is shown in one language; the records behind it cover all four
type Json = Record<string, unknown>;
// A question is written with its line break where the words break naturally; it reads as one line elsewhere.
type Card = { id: string; label: string; question: string; answer: string; json: Json };

const fileNamed = (name: string): RecordFile => {
  const found = SET.files.find((f) => f.name === name);
  if (!found) throw new Error(`ContextDiagram: ${name} is not in the bundled cms records`);
  return found;
};
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
// The outline shows a record in a set reading order: its identity first (which artifact or profile, which
// version or revision), then who decided, when, and why, then the digests and pins. So the rejection and the
// approval line up field for field. Everything else keeps the file's order. Applied at every level.
const LEAD = [
  "artifactId", "artifactVersion", "profileId", "revision",
  "authoredBy", "approvedBy", "rejectedBy", "authorizedBy", "ratifiedBy",
  "approvedAt", "rejectedAt", "authorizedAt", "ratifiedAt",
  "reason",
];
const ordered = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(ordered);
  if (!isObject(value)) return value;
  const keys = [...LEAD.filter((key) => key in value), ...Object.keys(value).filter((key) => !LEAD.includes(key))];
  return Object.fromEntries(keys.map((key) => [key, ordered(value[key])]));
};
const record = (name: string): Json => ordered(fileNamed(name).json) as Json;
// Deterministic on server and client: the record's own UTC instant, printed the way a byline would.
const dateline = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));


const CARDS: Card[] = [
  {
    id: "release",
    label: "release",
    question: "What's being\nreleased?",
    answer: "This record identifies the content version and connects it to the rules that define its structure.",
    json: record(`release${SUFFIX}`),
  },
  {
    id: "profile",
    label: "profile",
    question: "Which rules\napply?",
    answer: "The profile sets the required fields, the allowed languages, and what to show when a translation is missing.",
    json: record("profile-revision.json"),
  },
  {
    id: "rejection",
    label: "rejection",
    question: "Who objected,\nand why?",
    answer: "GAP keeps the rejection connected to this version. The publisher's rules determine whether it blocks release.",
    json: record(`release-rejection${SUFFIX}`),
  },
  {
    id: "approval",
    label: "approval",
    question: "Who approved it,\nand why?",
    answer: "Here, an editor approved the same version the reviewer rejected. Both decisions remain on record.",
    json: record(`release-approval${SUFFIX}`),
  },
  {
    id: "authorization",
    label: "authorization",
    question: "Who gave\nthe go-ahead?",
    answer: "The publisher authorized release of this exact version. Approval and release authorization are separate decisions.",
    json: record(`release-authorization${SUFFIX}`),
  },
];
const PROOF = fileNamed(`release-proof${SUFFIX}`);

// Where a card can hang in the scene. Pose 0 is the front, beside the post, where the focused card holds
// still. The rest stack tightly out from behind its left edge, and the post, pushed back, peeks out from behind
// its right edge. Each lower card lies on the one above it, covering only its skeleton, so every name shows;
// the higher a card, the further back, the more fog it carries, and the further out to the left: the lowest
// card is tucked deepest under the focused one. Laid out in scene
// pixels for a 600px-tall scene; yf says how much of any extra height (taller viewports) a pose takes.
// yp is how much of the post's own drop, when the scene is taller than the post and centers it, a pose follows.
type Pose = { x: number; y: number; yf: number; yp?: number; z: number; rx: number; ry: number; rz: number; k: number; fog: number };
const POSES: Pose[] = [
  { x: 120, y: 300, yf: 0.5, z: 0, rx: 0, ry: 0, rz: 0, k: 1, fog: 0 },   // the middle of the scene; the card centers itself on it
  { x: -40, y: 470, yf: 0.2, z: -60, rx: 0, ry: 6, rz: 1.5, k: 0.5, fog: 0.12 },
  { x: -49, y: 360, yf: 0.2, z: -90, rx: 0, ry: 6, rz: -1.5, k: 0.5, fog: 0.18 },
  { x: -51, y: 250, yf: 0.2, z: -120, rx: 0, ry: 6, rz: 1.5, k: 0.5, fog: 0.24 },
  { x: -57, y: 140, yf: 0.2, z: -150, rx: 0, ry: 6, rz: -1.5, k: 0.5, fog: 0.3 },
];
// The pile, before the reveal: all five fanned down the post's height like a hand of cards held behind it,
// the middle one reaching furthest past its right edge, deep enough in the fog to say only that there is more.
// Until the section has scrolled into view they are squarely behind the post, and slide out as it arrives.
// Set by eye per card: depth draws each card in toward the middle, and its tilt pulls its right edge in.
const PILE_X = [225, 252, 271, 264, 246];
const pileOf = (i: number): Pose => {
  const spread = i - (CARDS.length - 1) / 2;   // -2 at the top to 2 at the bottom
  return { x: PILE_X[i], y: 60 + i * 118, yf: 0, yp: 1, z: -100, rx: 0, ry: 0, rz: spread * 3, k: 0.615, fog: 0.7 };
};
const behindOf = (i: number): Pose => ({ ...pileOf(i), x: 40 + i * 6, rz: pileOf(i).rz / 3 });
// The opening arrangement: the release in front, since its caption asks the first question; behind it the rest
// stack in story order from the top, profile, rejection, approval, authorization.
const OPENING_POSES = [0, 4, 3, 2, 1];
const OPENING = OPENING_POSES.indexOf(0);
const HEADING = "See the protocol\nin action.";
const lines = (text: string) => text.split("\n").flatMap((line, index) => (index ? [<br key={index} />, line] : [line]));
const oneLine = (text: string) => text.replace(/\n/g, " ");
const INVITATION = "What rules shaped this post? Who objected, who approved, who authorized its release? Those records stay with this exact version.";
// On a phone the post is the carousel's first slide, captioned like the records after it and about as long, so
// the captions line up. The heading leads straight into it there; the invitation is for the wide layout.
const POST_CAPTION = { question: "What does\nthe reader see?", answer: "The post as it is published, shown in one of its four locales. Swipe to see the records that travel with it." };

/* --- the outline: the record as a plain list, each field named in words beside its value --- */
// A key in words: "artifactVersion" reads "Artifact version". A key that is not camelCase, like a locale
// tag, stays as written. The field's own name is kept for hovering.
const label = (name: string) => {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) return name;
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase().replace(/\bid\b/g, "ID");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
// An instant reads as a date and a time, in UTC as recorded: the same on the server and in every browser.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/;
const instant = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(iso));

// A row's place in reading order, through groups and all, so the rows can be ruled in one after another.
const at = (n: number) => ({ "--n": n }) as React.CSSProperties;

function Row({ name, n, children, tone, title }: { name: string; n: number; children: React.ReactNode; tone: string; title?: string }): React.JSX.Element {
  return <li className={styles.leaf} style={at(n)}><span className={styles.k} title={name}>{label(name)}</span><span className={tone} title={title}>{children}</span></li>;
}

function Leaf({ name, n, value }: { name: string; n: number; value: unknown }): React.JSX.Element {
  if (typeof value !== "string") return <Row name={name} n={n} tone={styles.str}>{String(value)}</Row>;
  // The type clips, not a character count: a digest runs to the end of one line and other text to the end of
  // its second, each ending in an ellipsis where it is cut. A reason is always in full; it answers the question.
  if (value.startsWith("sha256:")) return <Row name={name} n={n} tone={styles.digest} title={value}>{value}</Row>;
  if (INSTANT.test(value)) return <Row name={name} n={n} tone={styles.str} title={value}>{instant(value)}</Row>;
  if (name === "reason") return <Row name={name} n={n} tone={styles.str}>{value}</Row>;
  return <Row name={name} n={n} tone={`${styles.str} ${styles.clamp}`} title={value}>{value}</Row>;
}

// How many rows an object's outline takes: one for each field, and each group's own rows besides.
const rowsIn = (value: Json, depth: number): number =>
  Object.values(value).reduce<number>((sum, child) => sum + 1 + (isObject(child) && depth < OUTLINE_DEPTH ? rowsIn(child, depth + 1) : 0), 0);

function Outline({ value, depth = 0, start = 0 }: { value: Json; depth?: number; start?: number }): React.JSX.Element {
  // A nested object is its name, then its fields indented beneath it; values line up at every depth. An
  // object's own fields come first and its groups after, so a field never reads as part of the group above it.
  const group = (child: unknown) => isObject(child) && depth < OUTLINE_DEPTH;
  const entries = Object.entries(value).sort(([, a], [, b]) => Number(group(a)) - Number(group(b)));
  let next = start;
  return (
    <ul className={styles.tree} style={{ "--depth": depth } as React.CSSProperties}>
      {entries.map(([name, child]) => {
        const n = next;
        next += 1 + (group(child) ? rowsIn(child as Json, depth + 1) : 0);
        if (isObject(child)) {
          return depth < OUTLINE_DEPTH ? (
            <li key={name} className={styles.branch}>
              <div className={styles.group} style={at(n)}><span title={name}>{label(name)}</span></div>
              <Outline value={child} depth={depth + 1} start={n + 1} />
            </li>
          ) : (
            <Row key={name} name={name} n={n} tone={styles.more}>{Object.keys(child).length} fields</Row>
          );
        }
        if (Array.isArray(child)) {
          const flat = child.every((item) => !isObject(item) && !Array.isArray(item));
          return <Row key={name} name={name} n={n} tone={flat ? styles.str : styles.more}>{flat ? child.map(String).join(", ") : `${child.length} items`}</Row>;
        }
        return <Leaf key={name} name={name} n={n} value={child} />;
      })}
    </ul>
  );
}

export default function ContextDiagram(): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);   // the phone's carousel
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [entered, setEntered] = useState(false);   // the section has scrolled into view; the pile has fanned out
  const [settled, setSettled] = useState(false);   // the reveal has finished; paging moves at its own pace
  const focusAfterReveal = useRef(false);
  const [active, setActive] = useState(OPENING);
  const [poses, setPoses] = useState<number[]>(OPENING_POSES);   // card index → pose index
  // A phone has no scene: the post and the records are a carousel, every record open, each with its own caption.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const release = (PROOF.json as any).release;
  const post = release.payload;
  const dated = dateline(post.date);   // the byline date is content, in the payload
  const front = CARDS[active];
  // The left column speaks for the focused record only in the scene. A phone captions every slide itself, so
  // its heading stays the section's own, even when the scene was revealed before the window narrowed.
  const captioned = revealed && !phone;
  // A compact card's skeleton follows the shape of its record: a line for each of its first three top-level
  // keys, the key bar about as long as the key, the value bar varied. Short, so the stack stays tight.
  const skeletons = useMemo(() => CARDS.map((card) => Object.keys(card.json).slice(0, 3).map((key, row): [string, string] =>
    [`${Math.min(12, 1 + key.length * 0.75)}rem`, `${[14, 8, 17, 10, 6, 12][row % 6]}rem`])), []);

  // --- flights ---
  // A slot's place is its variables; a flight is how it gets there: one Web Animation, eased as a whole so it
  // never pauses at a waypoint, handing back to the stylesheet on arrival. Under reduced motion the cards
  // simply appear where they belong.
  const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
  const quick = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const flat = () => window.matchMedia("(max-width: 700px)").matches;   // the phone layout has no scene to fly in
  // Once the focused card is still, it is nudged onto whole device pixels: the scene's scale and the card's
  // centering can leave it between two, and on a low-density screen that softens every letter. Measured
  // without the nudge, then nudged by the remainder, in the card's own (scaled) pixels.
  const snap = () => {
    const root = stage.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>(`.${styles.card}`).forEach((card) => {
      card.style.removeProperty("--snap-x");
      card.style.removeProperty("--snap-y");
    });
    const card = root.querySelector<HTMLElement>(`.${styles.slot}[data-on] .${styles.card}`);
    if (!card || root.dataset.revealed !== "true" || !card.offsetWidth) return;
    const box = card.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const scale = box.width / card.offsetWidth || 1;
    const nudge = (edge: number) => (Math.round(edge * ratio) - edge * ratio) / ratio / scale;
    card.style.setProperty("--snap-x", `${nudge(box.left)}px`);
    card.style.setProperty("--snap-y", `${nudge(box.top)}px`);
  };
  const snapFrame = useRef(0);
  const settleSoon = () => {
    cancelAnimationFrame(snapFrame.current);
    snapFrame.current = requestAnimationFrame(snap);
  };
  const transformOf = (p: Pose) => {
    const extra = (scene.current?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 600;
    const drop = (article.current?.offsetTop ?? 30) - 30;
    const depth = `translate(250px, ${extra / 2}px) perspective(1500px) translate(-250px, ${-extra / 2}px)`;   // as the stylesheet's --depth
    return `${depth} translate3d(${p.x}px, ${p.y + (extra - 600) * p.yf + drop * (p.yp ?? 0)}px, ${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`;
  };
  const fly = (index: number, path: Pose[], duration: number, delay = 0) => {
    const element = slots.current[index];
    if (!element || quick() || flat() || typeof element.animate !== "function") return;
    element.animate(path.map((p) => ({ transform: transformOf(p) })), { duration, delay, easing: EASE, fill: "both" })
      .finished.then((animation) => { animation.cancel(); settleSoon(); }, () => undefined);
    // The name rides with its card but never eases between sizes: through the flight it is scaled against the
    // perspective's growth and shrink with depth, so on the page it holds one size. Sampled along the path, as
    // the slot's keyframes are spaced, and eased the same. It keeps the size it set off at until RESIZE into
    // the flight, then takes the size it will arrive at in one step.
    const name = element.querySelector<HTMLElement>(`.${styles.cardName}`);
    const title = name?.firstElementChild as HTMLElement | null | undefined;
    if (!name || !title) return;
    const near = (z: number) => 1500 / (1500 - z);   // how much larger a depth draws than the page's plane
    const zAt = (t: number) => {
      const at = t * (path.length - 1);
      const i = Math.min(Math.floor(at), path.length - 2);
      return path[i].z + (path[i + 1].z - path[i].z) * (at - i);
    };
    const arrival = near(path[path.length - 1].z);
    name.animate(Array.from({ length: 25 }, (_, j) => ({ scale: String(arrival / near(zAt(j / 24))) })), { duration, delay, easing: EASE, fill: "both" })
      .finished.then((animation) => animation.cancel(), () => undefined);
    const departure = String(near(path[0].z) / arrival);
    const at = Math.min(1, RESIZE / duration);
    title.animate([{ scale: departure }, { scale: departure, offset: at }, { scale: "1", offset: at }, { scale: "1" }], { duration, delay, fill: "both" })
      .finished.then((animation) => animation.cancel(), () => undefined);
  };
  // The post changes sides with the cards by going around them: it swings out past the focused card's right
  // edge while still on top, drops beneath at the far point of the swing (the stylesheet flips its z-index at
  // 630ms, when it overlaps no card), and tucks back in behind. A reset swings the same way back.
  const swing = (out: boolean) => {
    const element = article.current;
    if (!element || quick() || flat() || typeof element.animate !== "function") return;
    const home = { transform: "perspective(1500px) translate3d(0px, 0px, 0px) rotate(0deg)" };
    const tucked = { transform: "perspective(1500px) translate3d(400px, 0px, -200px) rotate(6deg)" };
    const apex = { transform: "perspective(1500px) translate3d(720px, -10px, -80px) rotateY(-6deg)", offset: 0.45, easing: "cubic-bezier(0.45, 0, 0.2, 1)" };
    const start = { ...(out ? home : tucked), easing: "cubic-bezier(0.25, 0.6, 0.3, 1)" };
    element.animate([start, apex, out ? tucked : home], { duration: REVEAL, fill: "both" })
      .finished.then((animation) => animation.cancel(), () => undefined);
  };

  // The chosen card and the focused card trade places; every other card stays where it is. The chosen card
  // comes straight in: rising toward the reader on the way would let the perspective hold it back while its
  // size ran ahead, so it would grow and then slide into place. The one it replaces dips away on its way out.
  // Which is drawn over which is the slots' paint order, not their depth.
  const select = (index: number) => {
    if (index === active) return;
    const from = POSES[poses[index]];
    const to = POSES[poses[active]];
    const between = (a: Pose, b: Pose, z: number): Pose => ({ ...a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, yf: (a.yf + b.yf) / 2, z, rx: (a.rx + b.rx) / 2, ry: (a.ry + b.ry) / 2, rz: (a.rz + b.rz) / 2 });
    fly(index, [from, to], REVEAL);
    fly(active, [to, between(to, from, Math.min(from.z, to.z) - 60), from], REVEAL);
    setPoses((current) => {
      const next = [...current];
      [next[index], next[active]] = [next[active], next[index]];
      return next;
    });
    setActive(index);
  };
  const step = (by: 1 | -1) => select((active + by + CARDS.length) % CARDS.length);

  // The reveal. The pager takes the button's place; a keyboard reader who pressed the button lands on it.
  const reveal = (event: React.MouseEvent<HTMLButtonElement>) => {
    focusAfterReveal.current = event.currentTarget.matches(":focus-visible");
    setRevealed(true);
  };
  // Reset: back to the teaser, with the opening arrangement, the way it was first seen.
  const reset = (event: React.MouseEvent<HTMLButtonElement>) => {
    focusAfterReveal.current = event.currentTarget.matches(":focus-visible");
    setSettled(false);
    setPoses(OPENING_POSES);
    setActive(OPENING);
    setRevealed(false);
  };
  // Arrival: as the section scrolls into view the cards fan out from squarely behind the post to the pile,
  // a suggestion that there is more here. Once is enough.
  useEffect(() => {
    const element = stage.current;
    if (!element || !("IntersectionObserver" in window)) {
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      CARDS.forEach((_, index) => fly(index, [behindOf(index), pileOf(index)], 1100, index * 70));
      setEntered(true);
    }, { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flown = useRef(false);   // nothing flies on first render; the pile is simply there
  useEffect(() => {
    if (!flown.current) {
      flown.current = true;
      return;
    }
    if (revealed) {
      // Out: each card rises straight from the pile to its place, uncovered as the post swings off them; the
      // focused card leads.
      swing(true);
      CARDS.forEach((_, index) => {
        const order = index === active ? 0 : 1 + (index > active ? index - 1 : index);
        fly(index, [pileOf(index), POSES[poses[index]]], REVEAL, order * 25);
      });
    } else {
      // Back: straight to the pile, and the post swings round to cover them again.
      swing(false);
      CARDS.forEach((_, index) => fly(index, [POSES[poses[index]], pileOf(index)], REVEAL, index * 25));
    }
    const target = revealed ? `.${styles.control} .${styles.arrow}` : `.${styles.revealButton}`;
    if (focusAfterReveal.current) stage.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
    if (!revealed) return;
    const timer = window.setTimeout(() => setSettled(true), quick() ? 0 : REVEAL + 250);   // once the last card has landed
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // The scene is composed in fixed pixels; when its column is narrower than that it scales down whole. The
  // scale is set on the stage, and so is the post's height: the post is shown whole, and the scene is at least
  // as tall as it is.
  useEffect(() => {
    const element = scene.current;
    const root = stage.current;
    if (!element || !root || !("ResizeObserver" in window)) return;
    const fit = () => {
      root.style.setProperty("--s", String(Math.min(1, element.clientWidth / SCENE_WIDTH)));
      if (article.current) root.style.setProperty("--post-height", `${article.current.offsetHeight}px`);
      // The focused record is as tall as its outline needs; the scene is sized for the tallest of them, so it
      // never changes height from one record to the next.
      const tallest = Math.max(0, ...Array.from(measure.current?.children ?? [], (card) => (card as HTMLElement).offsetHeight));
      root.style.setProperty("--records-height", `${tallest}px`);
      settleSoon();
    };
    fit();
    // Fitting changes the scene's own height, so it waits a frame rather than resizing inside the observer's callback.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(element);
    observer.observe(document.documentElement);
    Array.from(measure.current?.children ?? []).forEach((card) => observer.observe(card));
    document.fonts?.ready.then(() => requestAnimationFrame(fit));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // On a phone the carousel is as tall as the slide in view, not the tallest record, so a short slide leaves no
  // empty page under it. The slide in view is the one nearest the carousel's left margin; the height follows it
  // as a swipe crosses from one to the next.
  useEffect(() => {
    const element = track.current;
    if (!phone || !element) return;
    const fit = () => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const margin = box.left + parseFloat(style.paddingLeft);
      const slides = Array.from(element.children) as HTMLElement[];
      const near = slides.reduce((best, slide) =>
        Math.abs(slide.getBoundingClientRect().left - margin) < Math.abs(best.getBoundingClientRect().left - margin) ? slide : best);
      const card = near.lastElementChild as HTMLElement | null;
      if (!card) return;
      const bottom = card.getBoundingClientRect().bottom;
      element.style.height = `${bottom - box.top + parseFloat(style.paddingBottom)}px`;
      // A taller slide beside it fades out by the line where this one ends, rather than being cut off.
      slides.forEach((slide) => {
        const other = slide.lastElementChild as HTMLElement | null;
        if (!other) return;
        const rect = other.getBoundingClientRect();
        if (slide !== near && rect.bottom > bottom + 1) {
          other.dataset.cut = "";
          other.style.setProperty("--cut", `${bottom - rect.top}px`);
        } else {
          delete other.dataset.cut;
        }
      });
    };
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    element.addEventListener("scroll", soon, { passive: true });
    const observer = "ResizeObserver" in window ? new ResizeObserver(soon) : null;
    Array.from(element.children).forEach((slide) => observer?.observe(slide));
    document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", soon);
      observer?.disconnect();
      element.style.height = "";
      Array.from(element.children, (slide) => slide.lastElementChild as HTMLElement | null).forEach((card) => {
        if (card) delete card.dataset.cut;
      });
    };
  }, [phone]);

  // The focused record's caption, in the left column. The question is the heading above it, so the caption
  // carries it only for screen readers, which hear question and answer together.
  const caption = (
    <p id="context-record-description" className={styles.about} key={front.id} aria-live="polite" aria-atomic="true">
      <span className={styles.srOnly}>{oneLine(front.question)} </span>
      {front.answer}
    </p>
  );
  const pager = (
    <div className={styles.pager}>
      <span className={styles.count} aria-label={`Record ${active + 1} of ${CARDS.length}`}>{active + 1} / {CARDS.length}</span>
      <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Previous record">‹</button>
      <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Next record">›</button>
    </div>
  );

  return (
    <div
      className={styles.stage}
      ref={stage}
      data-revealed={revealed}
      data-settled={settled}
      // Every move ends in a transition or a flight; whichever ends last leaves the focused card on whole pixels.
      onTransitionEnd={settleSoon}
    >
      {/* Everything a reader reads. On the reveal the heading becomes the focused record's question, and the
          paragraph and the control swap in place. */}
      <div className={styles.copy}>
        <div className={styles.resetRow}>
          {revealed && <button type="button" className={styles.reset} onClick={reset}>Reset</button>}
        </div>
        {/* The heading and the paragraph are one block. Every pair it can show is laid out, unseen, in the same
            place, so the block is as tall as the tallest pair at this width and the control under it never moves.
            The shown pair sits at the top of the block: the paragraph always follows its heading closely, and
            any room to spare falls below it. */}
        <div className={styles.copyBody}>
          {[[HEADING, INVITATION], ...CARDS.map((card) => [card.question, card.answer])].map(([heading, text]) => (
            <div key={heading} className={styles.sizer} aria-hidden="true">
              <p className={styles.title}>{lines(heading)}</p>
              <p className={styles.invitation}>{text}</p>
            </div>
          ))}
          <div>
            <h2 id="example-heading" className={styles.title}>
              {captioned ? <span key={front.id} className={styles.question}>{lines(front.question)}</span> : lines(HEADING)}
            </h2>
            {captioned ? caption : <p className={styles.invitation}>{INVITATION}</p>}
          </div>
        </div>
        <div className={styles.control}>
          {revealed ? pager : (
            <button type="button" className={styles.revealButton} onClick={reveal}>Reveal the context →</button>
          )}
        </div>
      </div>

      {/* Everything that moves. */}
      <div className={styles.scene} ref={scene}>
        <div className={styles.space} ref={track}>
          <div className={styles.postSlide}>
            {phone && (
              <p id="context-caption-post" className={styles.slideCaption}>
                <strong>{lines(POST_CAPTION.question)}</strong>
                {POST_CAPTION.answer}
              </p>
            )}
            <article className={styles.post} lang={LOCALE} ref={article} aria-describedby={phone ? "context-caption-post" : undefined}>
              <p className={styles.masthead}>Example artifact</p>
              <div className={styles.postBody}>
                <p className={styles.kicker}>{String(release.profile.profileId).replace(/-/g, " ")} · {post.audience}</p>
                <h3>{post.content[LOCALE].headline}</h3>
                <p className={styles.byline}>
                  <span className={styles.avatar} aria-hidden="true">{post.author.charAt(0)}</span>
                  <span><strong>{post.author}</strong> · {dated}</span>
                </p>
                {post.content[LOCALE].body.split("\n\n").map((paragraph: string) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
              </div>
            </article>
          </div>

          {CARDS.map((card, index) => {
            const pose = revealed ? POSES[poses[index]] : entered ? pileOf(index) : behindOf(index);
            const isFront = index === active;
            const open = phone || (revealed && isFront);   // shown in full, contents and all
            return (
              <div
                key={card.id}
                ref={(element) => { slots.current[index] = element; }}
                className={styles.slot}
                data-on={isFront || undefined}
                style={{
                  "--x": `${pose.x}px`, "--y": `${pose.y}px`, "--yf": pose.yf, "--yp": pose.yp ?? 0, "--z": `${pose.z}px`,
                  "--rx": `${pose.rx}deg`, "--ry": `${pose.ry}deg`, "--rz": `${pose.rz}deg`,
                  "--k": pose.k, "--fog": pose.fog, "--i": index,
                  // Revealed, paint order follows depth, under the post. In the pile the smaller cards lie on the larger.
                  zIndex: revealed ? POSES.length - poses[index] : index + 1,
                } as React.CSSProperties}
                onClick={isFront || !revealed || phone ? undefined : () => select(index)}
              >
                {phone && (
                  <p id={`context-caption-${card.id}`} className={styles.slideCaption}>
                    <strong>{lines(card.question)}</strong>
                    {card.answer}
                  </p>
                )}
                <section
                  id={`context-card-${card.id}`}
                  className={styles.card}
                  aria-labelledby={`context-card-title-${card.id}`}
                  aria-describedby={phone ? `context-caption-${card.id}` : isFront ? "context-record-description" : undefined}
                  aria-hidden={!open}
                >
                  <div className={styles.cardHead}>
                    <span className={styles.cardName}>
                      <span id={`context-card-title-${card.id}`} className={styles.cardTitle}>{card.label}</span>
                    </span>
                  </div>
                  {open ? (
                    <div className={styles.cardBody} role="region" aria-label={`${card.label} record contents`}>
                      <Outline value={card.json} />
                    </div>
                  ) : (
                    <div className={styles.skeleton} aria-hidden="true">
                      {skeletons[index].map(([key, value], row) => (
                        <div key={row} className={styles.skeletonRow}>
                          <span style={{ "--bw": key } as React.CSSProperties} />
                          <span style={{ "--bw": value } as React.CSSProperties} />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            );
          })}
        </div>
        {/* Unseen: each record's outline, laid out at the focused width, to size the scene for the tallest. */}
        <div className={styles.measure} ref={measure} aria-hidden="true" style={{ "--k": 1, "--fog": 0 } as React.CSSProperties}>
          {CARDS.map((card) => (
            <section key={card.id} className={styles.card}>
              <div className={styles.cardHead} />
              <div className={styles.cardBody}><Outline value={card.json} /></div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
