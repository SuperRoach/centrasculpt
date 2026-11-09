import { activityLogo } from "./activity-logo";
import type { ProjectBrowser } from "./project-browser";
import { libraryModifiedLabel } from "./project-library";
import type { MenuButton } from "./xr-menu-model";

const icons: Record<string, string> = {
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  "save-as": '<path d="M14 3H4v18h16V9M17 2v8m-4-4h8M8 15h8m-8 3h5"/>',
  "download-current": '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  rename: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  delete: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  clear: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
function icon(button: HTMLButtonElement, name: string, label: string) {
  button.classList.add("library-icon-button");
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

/** Desktop presentation of the same actions used by the headset library. */
export function renderProjectLibrary(dialog: HTMLDialogElement, browser: ProjectBrowser): void {
  const content = browser.content();
  const previousFocus = document.activeElement as HTMLInputElement | null;
  const focusAction = previousFocus?.dataset.libraryAction;
  const selection = previousFocus?.tagName === "INPUT" ? previousFocus.selectionStart : null;
  const wasForm = dialog.dataset.form;
  const wasSelected = dialog.dataset.selected;
  dialog.dataset.selected = browser.selected ?? "";
  if (browser.selected && !wasSelected) dialog.dataset.enterDetails = "true";
  if (!browser.selected || browser.form || browser.confirmation) delete dialog.dataset.enterDetails;
  dialog.dataset.form = browser.form ?? "";
  const header = document.createElement("div");
  header.className = "library-header";
  const title = document.createElement("h2");
  title.textContent = browser.confirmation
    ? browser.confirmation === "delete"
      ? "Delete project?"
      : "Save your changes?"
    : browser.form === "new"
      ? "New Project"
      : browser.form === "save-as"
        ? "Save Project As"
        : browser.form === "rename"
          ? "Rename Project"
          : browser.selected
            ? "Project details"
            : "Project Library";
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.libraryAction = "close";
  icon(close, "close", "Close library");
  close.onclick = () => dialog.close();
  header.append(title, close);
  const subtitle = document.createElement("p");
  subtitle.className = "library-subtitle";
  subtitle.textContent =
    browser.form === "new"
      ? "Give your next sculpture a name."
      : browser.selected && !browser.form && !browser.confirmation
        ? "Open this saved project to continue working on it."
        : content.subtitle;
  dialog.replaceChildren(header, subtitle);

  const action = (id: string, label?: string) => {
    const model = content.buttons.find((b) => b.id === `library:${id}`);
    if (!model) return null;
    return actionButton(model, label);
  };
  function actionButton(model: MenuButton, label?: string): HTMLButtonElement {
    const button = document.createElement("button");
    const id = model.id.slice(8);
    button.type = "button";
    button.dataset.libraryAction = model.id;
    button.disabled = !!model.disabled;
    button.textContent = label ?? model.label;
    if (icons[id]) icon(button, id, label ?? model.label);
    if (["submit", "open", "new", "save-replace"].includes(id))
      button.classList.add("library-primary");
    if (["delete", "delete-confirm"].includes(id)) button.classList.add("library-danger");
    button.onclick = () => void browser.activate(model.id);
    return button;
  }
  const appendActions = (host: HTMLElement, ids: string[]) => {
    for (const id of ids) {
      const button = action(id);
      if (button) host.append(button);
    }
  };
  const toolbar = document.createElement("div");
  toolbar.className = "library-toolbar";
  if (!browser.form && !browser.confirmation && !browser.selected) {
    appendActions(toolbar, [
      "clear",
      "new",
      "import",
      "save",
      "save-as",
      "download-current",
      "refresh",
    ]);
    dialog.append(toolbar);
  }

  if (browser.form) {
    const form = document.createElement("form");
    form.className = "library-name-form";
    const label = document.createElement("label");
    label.textContent = "Project name";
    const input = document.createElement("input");
    input.value = browser.draft;
    input.placeholder = "Untitled";
    input.maxLength = 80;
    input.required = true;
    input.disabled = browser.busy;
    input.dataset.libraryAction = "project-name";
    input.oninput = () => {
      browser.draft = input.value;
    };
    label.append(input);
    form.append(label);
    if (browser.form === "new") {
      const options = document.createElement("div");
      options.className = "library-new-options";
      for (const kind of ["contents", "resolution"] as const) {
        const label = document.createElement("label");
        label.textContent = kind === "contents" ? "Start with" : "Resolution";
        const select = document.createElement("select");
        select.disabled = browser.busy;
        select.setAttribute("aria-label", label.textContent);
        const choices =
          kind === "contents"
            ? [
                ["sphere", "Starter sphere"],
                ["empty", "Empty scene"],
              ]
            : [
                ["64", "64³ · Default"],
                ["128", "128³ · Fine"],
                ["192", "192³ · High detail"],
              ];
        for (const [value, text] of choices) select.add(new Option(text, value));
        select.value = String(browser[kind]);
        select.onchange = () => {
          if (kind === "contents") browser.contents = select.value;
          else browser.resolution = Number(select.value);
        };
        label.append(select);
        options.append(label);
      }
      form.append(options);
    }
    const controls = document.createElement("div");
    controls.className = "library-form-actions";
    const cancel = action("cancel");
    const submit = action("submit", browser.form === "new" ? "Create Project" : "Save");
    if (cancel) controls.append(cancel);
    if (submit) {
      submit.type = "submit";
      submit.onclick = null;
      controls.append(submit);
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      if (input.value.trim()) void browser.activate("library:submit");
      else input.focus();
    };
    form.append(controls);
    dialog.append(form);
  } else if (browser.confirmation) {
    for (const label of content.labels) {
      const p = document.createElement("p");
      p.textContent = label.text;
      dialog.append(p);
    }
    const controls = document.createElement("div");
    controls.className = "library-form-actions";
    appendActions(controls, ["cancel", "discard-replace", "save-replace", "delete-confirm"]);
    dialog.append(controls);
  } else if (browser.selected) {
    const panel = document.createElement("div");
    panel.className = "library-details-panel";
    if (dialog.dataset.enterDetails && !browser.busy) {
      panel.classList.add("library-details-enter");
      delete dialog.dataset.enterDetails;
    }
    const back = action("clear", "Back to library");
    if (back) {
      back.className = "library-back";
      back.textContent = "← Back to library";
      panel.append(back);
    }
    const details = document.createElement("div");
    details.className = "library-project-details";
    const record = browser.records.find((r) => r.id === browser.selected);
    if (record?.thumbnail) {
      const image = document.createElement("img");
      image.className = "project-library-preview";
      image.src = record.thumbnail;
      image.alt = `Preview of ${record.name}`;
      details.append(image);
    }
    const metadata = document.createElement("div");
    for (const [index, label] of content.labels.entries()) {
      const p = document.createElement(index === 0 ? "h3" : "p");
      p.textContent = label.text;
      metadata.append(p);
    }
    const controls = document.createElement("div");
    controls.className = "library-project-actions";
    const open = action("open");
    if (open) controls.append(open);
    const secondary = document.createElement("div");
    secondary.className = "library-project-management";
    for (const id of ["rename", "duplicate", "download", "delete"]) {
      const button = action(id);
      if (!button) continue;
      button.classList.remove("library-icon-button");
      button.textContent = id === "download" ? "Download .form" : button.title;
      secondary.append(button);
    }
    controls.append(secondary);
    metadata.append(controls);
    details.append(metadata);
    panel.append(details);
    dialog.append(panel);
  } else {
    const list = document.createElement("ul");
    list.className = "library-project-list";
    list.setAttribute("aria-label", "Saved projects");
    const enlarged = document.createElement("div");
    enlarged.className = "library-thumbnail-popover";
    enlarged.popover = "manual";
    const largeImage = document.createElement("img");
    enlarged.append(largeImage);
    dialog.append(enlarged);
    const hidePreview = () => {
      if (enlarged.matches(":popover-open")) enlarged.hidePopover();
    };
    dialog.onclose = hidePreview;
    list.addEventListener("scroll", hidePreview, { passive: true });
    for (const record of browser.records) {
      const row = document.createElement("li");
      const thumbnail = document.createElement("button");
      thumbnail.type = "button";
      thumbnail.className = "library-thumbnail-open";
      thumbnail.dataset.libraryAction = `library:open:${record.id}`;
      thumbnail.disabled = browser.busy;
      thumbnail.setAttribute("aria-label", `Open project ${record.name}`);
      thumbnail.title = `Open ${record.name}`;
      thumbnail.onclick = () => {
        hidePreview();
        void browser.activate(`library:open:${record.id}`);
      };
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.libraryAction = `library:select:${record.id}`;
      button.disabled = browser.busy;
      button.setAttribute("aria-label", `Project details for ${record.name}`);
      const preview = document.createElement(record.thumbnail ? "img" : "span");
      preview.className = "library-list-preview";
      if (preview instanceof HTMLImageElement) {
        preview.src = record.thumbnail!;
        preview.alt = "";
        const showPreview = () => {
          if (!dialog.open || browser.busy) return;
          largeImage.src = preview.src;
          largeImage.alt = `Preview of ${record.name}`;
          enlarged.showPopover();
          const target = preview.getBoundingClientRect();
          const bounds = enlarged.getBoundingClientRect();
          const left =
            target.right + 12 + bounds.width <= window.innerWidth - 12
              ? target.right + 12
              : target.left - bounds.width - 12;
          enlarged.style.left = `${Math.max(12, Math.min(left, window.innerWidth - bounds.width - 12))}px`;
          enlarged.style.top = `${Math.max(12, Math.min(target.top, window.innerHeight - bounds.height - 12))}px`;
        };
        preview.addEventListener("mouseenter", showPreview);
        preview.addEventListener("mouseleave", hidePreview);
        thumbnail.addEventListener("focus", () => {
          if (thumbnail.matches(":focus-visible")) showPreview();
        });
        thumbnail.addEventListener("blur", hidePreview);
      } else {
        preview.textContent = "◎";
        preview.setAttribute("aria-hidden", "true");
      }
      const text = document.createElement("span");
      text.className = "library-list-text";
      const name = document.createElement("strong");
      name.textContent = record.name;
      const meta = document.createElement("span");
      meta.append(`${record.layers} ${record.layers === 1 ? "layer" : "layers"} · `);
      const modified = document.createElement("time");
      modified.dateTime = new Date(record.modified).toISOString();
      modified.title = new Date(record.modified).toLocaleString();
      modified.textContent = libraryModifiedLabel(record.modified);
      meta.append(modified);
      text.append(name, meta);
      const arrow = document.createElement("span");
      arrow.textContent = "›";
      arrow.setAttribute("aria-hidden", "true");
      thumbnail.append(preview);
      button.append(text, arrow);
      button.onclick = () => void browser.activate(`library:select:${record.id}`);
      row.append(thumbnail, button);
      list.append(row);
    }
    if (!browser.records.length) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No saved projects yet. Create a project or import a .form file.";
      list.append(empty);
    }
    dialog.append(list);
  }
  const status = document.createElement("p");
  status.className = "library-status";
  status.setAttribute("role", "status");
  status.classList.toggle("error", browser.error);
  status.setAttribute("aria-busy", String(browser.busy));
  if (browser.busy) {
    const indicator = document.createElement("span");
    indicator.innerHTML = activityLogo;
    status.append(indicator);
  }
  status.append(content.footer);
  dialog.append(status);
  const focus = Array.from(dialog.querySelectorAll<HTMLElement>("[data-library-action]")).find(
    (element) => element.dataset.libraryAction === focusAction,
  );
  if (browser.form && wasForm !== browser.form && !browser.busy) {
    const input = dialog.querySelector("input");
    input?.focus();
    input?.select();
  } else if (browser.selected && wasSelected !== browser.selected && !browser.busy) {
    dialog.querySelector<HTMLElement>('[data-library-action="library:open"]')?.focus();
  } else if (focus && !focus.hasAttribute("disabled")) {
    focus.focus();
    if (focus instanceof HTMLInputElement && selection !== null)
      focus.setSelectionRange(selection, selection);
  } else if (!browser.busy) {
    dialog.querySelector<HTMLElement>(".library-primary:not(:disabled)")?.focus();
  }
}
