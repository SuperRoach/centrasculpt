/** Keep native click/keyboard saving, with a cancellable hold for the portable file. */
export function bindDesktopSavePress(
  button: HTMLButtonElement,
  save: () => void,
  download: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reset: ReturnType<typeof setTimeout> | undefined;
  let pointer: number | null = null;
  let suppressClick = false;
  let origin = { x: 0, y: 0 };
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || button.disabled) return;
    clear();
    clearTimeout(reset);
    pointer = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    suppressClick = false;
    timer = setTimeout(() => {
      timer = undefined;
      if (button.disabled || pointer === null) return;
      suppressClick = true;
      download();
    }, 650);
  };
  const cancel = () => {
    if (pointer === null) return;
    clear();
    pointer = null;
    suppressClick = true;
  };
  const move = (event: PointerEvent) => {
    if (
      event.pointerId === pointer &&
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8
    )
      cancel();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer && pointer !== null) return;
    clear();
    pointer = null;
    // A disabled button may never deliver click; don't swallow a later, unrelated press.
    reset = setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  const click = (event: MouseEvent) => {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    if (!button.disabled) save();
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointermove", move);
  button.addEventListener("pointerleave", cancel);
  button.addEventListener("pointercancel", cancel);
  button.addEventListener("click", click);
  window.addEventListener("pointerup", up);
  window.addEventListener("blur", cancel);
  return () => {
    clear();
    clearTimeout(reset);
    button.removeEventListener("pointerdown", down);
    button.removeEventListener("pointermove", move);
    button.removeEventListener("pointerleave", cancel);
    button.removeEventListener("pointercancel", cancel);
    button.removeEventListener("click", click);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("blur", cancel);
  };
}
