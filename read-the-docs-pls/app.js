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
