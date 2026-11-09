const frame = document.querySelector("#guide");
const report = document.querySelector("#report");
const checks = [];
const assert = (value, message) => {
  if (!value) throw new Error(message);
  checks.push(message);
};
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for search");
};
const load = async (route, width) => {
  frame.style.width = `${width}px`;
  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = reject;
    frame.src = "/" + route;
  });
  const script = frame.contentDocument.createElement("script");
  script.src = "/__axe.js";
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
    frame.contentDocument.head.append(script);
  });
  return frame.contentDocument;
};
document.querySelector("#run").onclick = async () => {
  checks.length = 0;
  document.querySelector("#run").disabled = true;
  try {
    const routes = await (await fetch("/routes.json")).json();
    for (const width of [1440, 390, 320]) {
      for (const route of routes) {
        report.textContent = `Checking ${width}px ${route}…\n${checks.length} assertions so far`;
        const doc = await load(route, width);
        assert(doc.documentElement.scrollWidth <= width, `${width}px ${route}: no overflow`);
        assert(doc.querySelectorAll("h1").length === 1, `${width}px ${route}: one heading`);
        if (width === 1440) {
          const result = await frame.contentWindow.axe.run(doc, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          });
          assert(
            result.violations.length === 0,
            `${route}: axe WCAG A/AA ${JSON.stringify(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })))}`,
          );
        }
      }
    }
    let doc = await load("index.html", 390);
    doc.querySelector("#menu").click();
    assert(
      doc.querySelector("#menu").getAttribute("aria-expanded") === "true",
      "mobile menu expands",
    );
    assert(
      frame.contentWindow.getComputedStyle(doc.querySelector("#sidebar")).display !== "none",
      "mobile navigation visible",
    );
    doc.dispatchEvent(
      new frame.contentWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert(
      doc.querySelector("#menu").getAttribute("aria-expanded") === "false",
      "Escape closes menu",
    );
    const before = doc.documentElement.dataset.theme;
    doc.querySelector("#theme").click();
    const after = doc.documentElement.dataset.theme;
    assert(before !== after, "theme changes");
    doc = await load("index.html", 1440);
    assert(doc.documentElement.dataset.theme === after, "theme persists on navigation");
    const result = await frame.contentWindow.axe.run(doc, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    assert(result.violations.length === 0, "alternate theme passes axe");
    for (const modifier of ["ctrlKey", "metaKey"]) {
      doc.dispatchEvent(
        new frame.contentWindow.KeyboardEvent("keydown", {
          key: "k",
          [modifier]: true,
          bubbles: true,
        }),
      );
      assert(doc.querySelector("#search-dialog").open, `${modifier} + K opens search`);
      doc.querySelector("#search-close").click();
      await until(() => doc.activeElement.id === "search-open");
      assert(doc.activeElement.id === "search-open", "search returns focus");
    }
    doc.querySelector("#search-open").click();
    const input = doc.querySelector("#search input");
    input.value = "tyre";
    input.dispatchEvent(new frame.contentWindow.Event("input", { bubbles: true }));
    await until(() => doc.querySelector(".pagefind-ui__result-link"));
    assert(
      doc.querySelector(".pagefind-ui__result-link").textContent.includes("primitives"),
      "real Pagefind search finds primitives for tyre",
    );
    const modalResult = await frame.contentWindow.axe.run(doc, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    assert(
      modalResult.violations.length === 0,
      `search accessibility ${JSON.stringify(modalResult.violations.map((v) => v.id))}`,
    );
    doc = await load("nested-guide/primitives.html", 390);
    doc.querySelector("#search-open").click();
    const nested = doc.querySelector("#search input");
    nested.value = "calibration";
    nested.dispatchEvent(new frame.contentWindow.Event("input", { bubbles: true }));
    await until(() => doc.querySelector(".pagefind-ui__result-link"));
    assert(
      doc.querySelector(".pagefind-ui__result-link").href.includes("/nested-guide/"),
      "subdirectory deployment search links retain prefix",
    );
    report.textContent = `PASS — ${checks.length} assertions\n` + checks.join("\n");
    report.dataset.result = "pass";
  } catch (e) {
    report.textContent = `FAIL — ${e.message}\n` + checks.join("\n");
    report.dataset.result = "fail";
  } finally {
    document.querySelector("#run").disabled = false;
  }
};
