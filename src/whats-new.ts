/** Native disclosure supplies Enter/Space activation and expanded state semantics. */
export function mountWhatsNew(after: HTMLElement, markdown: string): HTMLDetailsElement {
  const panel = after.ownerDocument.createElement("details");
  panel.id = "whats-new";
  const heading = after.ownerDocument.createElement("summary");
  heading.textContent = "What's New";
  const history = after.ownerDocument.createElement("div");
  history.className = "whats-new-history";
  history.tabIndex = 0;
  history.setAttribute("role", "region");
  history.setAttribute("aria-label", "What's New history");
  // Preserve newest-first source order and all history without interpreting HTML.
  let list: HTMLUListElement | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) {
      list = null;
      continue;
    }
    const headingLine = /^###\s+(.+)$/.exec(line),
      bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = after.ownerDocument.createElement("ul");
        history.append(list);
      }
      const item = after.ownerDocument.createElement("li");
      item.textContent = bullet[1];
      list.append(item);
    } else {
      list = null;
      const item = after.ownerDocument.createElement(headingLine ? "h3" : "p");
      item.textContent = headingLine ? headingLine[1] : line;
      history.append(item);
    }
  }
  panel.append(heading, history);
  panel.addEventListener("keydown", (event) => event.stopPropagation());
  after.after(panel);
  return panel;
}
