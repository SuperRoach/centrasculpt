try {
  document.documentElement.dataset.theme =
    localStorage.getItem("centra-guide-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  /* System colour scheme remains available without storage. */
}
document.documentElement.classList.add("js");
