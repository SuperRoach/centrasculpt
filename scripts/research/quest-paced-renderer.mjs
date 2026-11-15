import { writeFileSync } from "node:fs";

const [
  action = "status",
  output = "work/paced-renderer/quest-report.json",
  testUrl = "http://127.0.0.1:4182/",
] = process.argv.slice(2);
const pages = await (
  await fetch("http://127.0.0.1:9229/json/list", { signal: AbortSignal.timeout(3000) })
).json();
const page = pages.find((candidate) => candidate.url === testUrl);
if (!page) throw new Error("Quest benchmark tab unavailable");
const socket = new WebSocket(page.webSocketDebuggerUrl);
const deadline = setTimeout(() => {
  console.error("Quest DevTools command timed out");
  process.exit(1);
}, 8000);
try {
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  function command(method, params) {
    const request = ++id;
    return new Promise((resolve, reject) => {
      function receive(event) {
        const response = JSON.parse(event.data);
        if (response.id !== request) return;
        socket.removeEventListener("message", receive);
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      }
      socket.addEventListener("message", receive);
      socket.send(JSON.stringify({ id: request, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await command("Runtime.evaluate", { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  if (action === "reload") {
    await command("Page.reload", { ignoreCache: true });
  } else if (action === "start" || action === "start-panel") {
    const point = await evaluate(`(() => {
      const button = ${action === "start-panel" ? 'document.querySelector("#panel")' : '(document.querySelector("#vr") ?? document.querySelector("#start"))'};
      if (!button || button.disabled || document.visibilityState !== "visible") return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (!point) throw new Error("Requested benchmark button unavailable");
    for (const type of ["mousePressed", "mouseReleased"])
      await command("Input.dispatchMouseEvent", { ...point, type, button: "left", clickCount: 1 });
  } else if (action === "save" || action === "save-panel") {
    const report = await evaluate("globalThis.rendererReport");
    const valid = action === "save-panel" ? report?.memoryProfile === "panel" : report?.immersive;
    const trials = report?.reports ?? report?.trials;
    const singlePolicy =
      action === "save-panel" &&
      trials?.length === 3 &&
      ["progressive", "cache-batched"].includes(trials[0].policy) &&
      trials.every(({ policy }) => policy === trials[0].policy);
    if (!valid || (!singlePolicy && ![6, 12].includes(trials?.length)))
      throw new Error("No completed report for the requested mode");
    writeFileSync(output, JSON.stringify(report, null, 2), { flag: "wx" });
  }
  if (action !== "reload")
    console.log(
      await evaluate(`({
    status: document.querySelector("#status")?.textContent,
    tracking: document.querySelector("#status")?.dataset.tracking,
    visible: document.visibilityState,
    immersiveAvailable: !(document.querySelector("#vr") ?? document.querySelector("#start"))?.disabled,
    complete: Boolean(globalThis.rendererReport)
  })`),
    );
} finally {
  clearTimeout(deadline);
  socket.close();
}
