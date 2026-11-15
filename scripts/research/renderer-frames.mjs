export function frames(renderer) {
  if (!renderer.xr.isPresenting)
    return (work) =>
      new Promise((resolve, reject) => {
        requestAnimationFrame((time) => {
          try {
            resolve(work(time));
          } catch (error) {
            reject(error);
          }
        });
      });
  const session = renderer.xr.getSession();
  let waiting;
  renderer.xr.setAnimationLoop((time, frame) => {
    if (!frame) return;
    const next = waiting;
    waiting = undefined;
    if (!next) return;
    clearTimeout(next.timer);
    try {
      next.resolve(next.work(time, frame));
    } catch (error) {
      next.reject(error);
    }
  });
  session.addEventListener(
    "end",
    () => {
      clearTimeout(waiting?.timer);
      waiting?.reject(new Error("Immersive session ended before the comparison completed"));
      waiting = undefined;
    },
    { once: true },
  );
  return (work) =>
    new Promise((resolve, reject) => {
      if (!renderer.xr.isPresenting) return reject(new Error("Immersive session is inactive"));
      const timer = setTimeout(() => {
        waiting = undefined;
        reject(new Error("Quest stopped sending WebXR frames"));
      }, 10_000);
      waiting = { work, resolve, reject, timer };
    });
}
