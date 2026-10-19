// Small bits of interactivity shared by every page: color mode, copy buttons, toast.

const root = document.documentElement;

function currentMode(): "light" | "dark" {
  return root.dataset.theme === "light" ? "light" : "dark";
}

function syncToggle() {
  const next = currentMode() === "dark" ? "light" : "dark";
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-label", `Switch to ${next} mode`);
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = currentMode() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("color-mode", next);
    } catch {}
    syncToggle();
  });
});

// Follow the system setting live, unless someone picked a mode on purpose.
matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("color-mode");
  } catch {}
  if (!saved) {
    root.dataset.theme = e.matches ? "light" : "dark";
    syncToggle();
  }
});

syncToggle();

const toast = document.querySelector<HTMLElement>("[data-toast]");
let toastTimer: number | undefined;

export function showToast(message: string) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast("Couldn't copy. Try selecting it by hand.");
  }
}

// <button data-copy="text" data-copied="Copied it">
document.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
  el.addEventListener("click", () => copy(el.dataset.copy ?? "", el.dataset.copied ?? "Copied"));
});

// <button data-copy-from="element-id">
document.querySelectorAll<HTMLElement>("[data-copy-from]").forEach((el) => {
  el.addEventListener("click", () => {
    const source = document.getElementById(el.dataset.copyFrom ?? "");
    copy(source?.textContent ?? "", el.dataset.copied ?? "Copied");
  });
});
