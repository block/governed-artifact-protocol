import type { ClientModule } from "@docusaurus/types";

/** Enhance authored figures without copying their prose into presentation code. */
let dialogSequence = 0;

function titleOf(figure: HTMLElement): string {
  return figure.querySelector(".gap-diagram-title")?.textContent?.replace(/\u200b/g, "").trim()
    || figure.querySelector("svg title")?.textContent?.trim()
    || "Diagram";
}

/** Keep the enlarged SVG's arrow markers and accessibility references local. */
function namespaceIds(root: HTMLElement, prefix: string): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*"))];
  const ids = new Map<string, string>();
  for (const node of nodes) {
    if (node.id) {
      const original = node.id;
      node.id = `${prefix}-${original}`;
      ids.set(original, node.id);
    }
  }
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes)) {
      let value = attr.value.replace(/url\(#([^)]*)\)/g, (match, id: string) =>
        ids.has(id) ? `url(#${ids.get(id)})` : match);
      if (attr.name === "aria-labelledby" || attr.name === "aria-describedby") {
        value = value.split(/\s+/).map((id) => ids.get(id) ?? id).join(" ");
      } else if (attr.name === "href" || attr.name === "xlink:href") {
        value = ids.has(value.slice(1)) && value.startsWith("#")
          ? `#${ids.get(value.slice(1))}` : value;
      }
      if (value !== attr.value) node.setAttribute(attr.name, value);
    }
  }
}

function openDialog(figure: HTMLElement, opener: HTMLButtonElement): void {
  const dialog = document.createElement("dialog");
  dialog.className = "gap-diagram-dialog";
  dialog.setAttribute("aria-label", titleOf(figure));

  const clone = figure.cloneNode(true) as HTMLElement;
  clone.querySelector(".gap-diagram-expand")?.remove();
  clone.querySelectorAll(".hash-link").forEach((link) => link.remove());
  const trigger = clone.querySelector(".gap-diagram-trigger");
  if (trigger) trigger.replaceWith(...Array.from(trigger.childNodes));
  namespaceIds(clone, `diagram-dialog-${++dialogSequence}`);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "gap-diagram-close";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());

  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = previousOverflow;
    dialog.remove();
    opener.focus({ preventScroll: true });
  });

  dialog.append(clone, close);
  document.body.append(dialog);
  dialog.showModal();
  close.focus({ preventScroll: true });
}

function enhance(svg: SVGSVGElement): void {
  if (svg.closest(".gap-diagram-trigger")) return;
  const figure = svg.closest<HTMLElement>("figure.gap-diagram-figure");
  const header = figure?.querySelector(".gap-diagram-header");
  if (!figure || !header) return;

  const label = `Enlarge diagram: ${titleOf(figure)}`;
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "gap-diagram-expand";
  expand.textContent = "Expand";
  expand.setAttribute("aria-label", label);
  expand.addEventListener("click", () => openDialog(figure, expand));
  header.append(expand);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "gap-diagram-trigger";
  trigger.setAttribute("aria-label", label);
  // The adjacent Expand control provides the keyboard entry point.
  trigger.tabIndex = -1;
  svg.replaceWith(trigger);
  trigger.append(svg);
  trigger.addEventListener("click", () => openDialog(figure, expand));
}

const module: ClientModule = {
  onRouteDidUpdate() {
    document.querySelectorAll<SVGSVGElement>(".markdown svg.gap-diagram").forEach(enhance);
  },
};

export default module;
