const menu = document.querySelector("#menu");
menu.addEventListener("click", () => {
  const expanded = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(expanded));
  document.querySelector("#sidebar").classList.toggle("open", expanded);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    menu.setAttribute("aria-expanded", "false");
    document.querySelector("#sidebar").classList.remove("open");
    menu.focus();
  }
});
const theme = document.querySelector("#theme");
theme.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("centra-guide-theme", next);
  } catch {
    /* Theme still works for this page. */
  }
});
const dialog = document.querySelector("#search-dialog");
const opener = document.querySelector("#search-open");
let initialised = false;
function openSearch() {
  if (!dialog.open) dialog.showModal();
  if (!initialised) {
    if (typeof PagefindUI === "undefined") {
      document.querySelector("#search-help").prepend("Search could not load. ");
      return;
    }
    new PagefindUI({
      element: "#search",
      showSubResults: true,
      baseUrl: new URL("./", location.href).pathname,
      bundlePath: new URL("./pagefind/", location.href).pathname,
    });
    initialised = true;
  }
  requestAnimationFrame(() => dialog.querySelector("input")?.focus());
}
opener.addEventListener("click", openSearch);
document.querySelector("#search-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => opener.focus());
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
});

// Native buttons preserve mouse/touch/keyboard semantics; all content stays visible without JS.
const wheelButtons = [...document.querySelectorAll('[data-wheel]')];
function chooseWheel(button) {
  for (const b of wheelButtons) b.setAttribute('aria-pressed', String(b === button));
  for (const panel of document.querySelectorAll('[data-wheel-panel]'))
    panel.hidden = panel.dataset.wheelPanel !== button.dataset.wheel;
}
for (const [i, button] of wheelButtons.entries()) {
  button.addEventListener('click', () => chooseWheel(button));
  button.addEventListener('keydown', e => {
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % wheelButtons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i + wheelButtons.length - 1) % wheelButtons.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = wheelButtons.length - 1;
    if (next !== undefined) { e.preventDefault(); wheelButtons[next].focus(); chooseWheel(wheelButtons[next]); }
  });
}
if (wheelButtons.length) chooseWheel(wheelButtons[0]);

// A native modal provides focus containment and Escape; links still open full images without JS.
const zoom = document.createElement('dialog');
zoom.className = 'image-dialog';
zoom.setAttribute('aria-label', 'Enlarged application screenshot');
const zoomClose = document.createElement('button');
zoomClose.textContent = 'Close image · Esc';
const zoomImage = document.createElement('img');
const zoomCaption = document.createElement('p');
zoom.append(zoomClose, zoomImage, zoomCaption);
document.body.append(zoom);
let zoomOpener;
for (const link of document.querySelectorAll('[data-zoom]')) {
  link.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); zoomOpener = link;
    zoomImage.src = link.href; zoomImage.alt = link.querySelector('img').alt;
    zoomCaption.textContent = link.closest('figure').querySelector('figcaption').textContent;
    zoom.showModal(); zoomClose.focus();
  });
}
zoomClose.addEventListener('click', () => zoom.close());
zoom.addEventListener('click', e => { if (e.target === zoom) zoom.close(); });
zoom.addEventListener('close', () => zoomOpener?.focus());
