import { readFile, writeFile, mkdir, rm, copyFile, cp } from "node:fs/promises";
const pages = JSON.parse(await readFile(new URL("./content.json", import.meta.url)));
const out = new URL("./dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
for (const [i, page] of pages.entries()) {
  const nav = [...new Set(pages.map((p) => p.group))]
    .map(
      (group) =>
        `<div class="nav-group"><p>${group}</p>${pages
          .filter((p) => p.group === group)
          .map(
            (p) =>
              `<a href="${p.id}.html" ${p.id === page.id ? 'aria-current="page"' : ""}>${p.title}</a>`,
          )
          .join("")}</div>`,
    )
    .join("");
  const toc = [...page.body.matchAll(/<h2>(.*?)<\/h2>/g)]
    .map((m, n) => `<a href="#section-${n + 1}">${m[1]}</a>`)
    .join("");
  let heading = 0;
  const body = page.body.replaceAll("<h2>", () => `<h2 id="section-${++heading}">`);
  const adjacent = (p, label) =>
    p ? `<a href="${p.id}.html"><small>${label}</small>${p.title}</a>` : "<span></span>";
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(page.title)} · Centra Sculpt guide</title><meta name="description" content="${esc(page.description)}"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="pagefind/pagefind-component-ui.css"><script src="theme.js"></script><script src="pagefind/pagefind-component-ui.js" type="module"></script><script src="app.js" defer></script></head><body><pagefind-config></pagefind-config><script>const guideBase = new URL("./", location.href).pathname; const pagefindConfig = document.querySelector("pagefind-config"); pagefindConfig.setAttribute("bundle-path", guideBase + "pagefind/"); pagefindConfig.setAttribute("base-url", guideBase);</script><a class="skip" href="#main">Skip to content</a><header class="topbar"><a class="brand" href="index.html"><span class="mark" aria-hidden="true">◎</span> Centra <em>Sculpt</em><span class="guide-label">FIELD GUIDE</span></a><div class="top-actions"><pagefind-modal-trigger id="search-open" placeholder="Search" shortcut="mod+k"></pagefind-modal-trigger><button id="theme" aria-label="Switch colour theme">◐ <span>Theme</span></button><button id="menu" aria-expanded="false" aria-controls="sidebar">Guides</button></div></header><div class="layout"><aside id="sidebar"><nav aria-label="All guides">${nav}</nav><p class="nav-note">A space to shape.<br>Current guide · Phase 7.6.1</p></aside><main id="main" tabindex="-1"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Guide</a><span aria-hidden="true">/</span><span>${page.group}</span></nav><article data-pagefind-body><p class="eyebrow">${page.group}</p><h1>${page.title}</h1><p class="lead">${page.description}</p>${body}</article><nav class="pagination" aria-label="Previous and next guides">${adjacent(pages[i - 1], "← Previous")}${adjacent(pages[i + 1], "Next →")}</nav><footer>Centra Sculpt · Made by Brett James<br>Guide checked 10 November 2026 · <a href="faq.html">Limits & acceptance</a></footer></main><aside class="on-this-page"><nav aria-label="On this page"><p class="eyebrow">ON THIS PAGE</p>${toc}</nav></aside></div><pagefind-modal reset-on-close><pagefind-modal-header><pagefind-input placeholder="Search this guide…"></pagefind-input></pagefind-modal-header><pagefind-modal-body><pagefind-summary></pagefind-summary><pagefind-results show-sub-results></pagefind-results></pagefind-modal-body><pagefind-modal-footer><pagefind-keyboard-hints></pagefind-keyboard-hints></pagefind-modal-footer></pagefind-modal><noscript><p class="no-script">All guides work without JavaScript. Search, theme switching and the mobile menu need JavaScript; the full navigation is available above.</p></noscript></body></html>`;
  await writeFile(new URL(`${page.id}.html`, out), html);
}
for (const file of ["style.css", "app.js", "theme.js"])
  await copyFile(new URL(file, import.meta.url), new URL(file, out));
await copyFile(new URL("../public/favicon.svg", import.meta.url), new URL("favicon.svg", out));
await writeFile(
  new URL("routes.json", out),
  JSON.stringify(
    pages.map((p) => `${p.id}.html`),
    null,
    2,
  ),
);
console.log(`Built ${pages.length} static guide pages.`);

await cp(new URL("./screenshots/", import.meta.url), new URL("screenshots/", out), { recursive: true });
