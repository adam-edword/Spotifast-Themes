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
    // The theme being tried on has its own colors, so switching modes means taking it off.
    if (root.hasAttribute("data-try-on")) {
      setTryOn(false, true);
      return;
    }
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

// "Try it on": dresses the whole site in the theme on this page.
declare global {
  interface Window {
    __tryOn?: Record<string, string>;
  }
}

const tryOnButtons = document.querySelectorAll<HTMLButtonElement>("[data-try-on-toggle]");

function setTryOn(on: boolean, remember: boolean) {
  const vars = window.__tryOn ?? {};
  for (const [key, value] of Object.entries(vars)) {
    if (on) root.style.setProperty(key, value);
    else root.style.removeProperty(key);
  }
  root.toggleAttribute("data-try-on", on);
  tryOnButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(on)));
  if (remember) {
    try {
      if (on) localStorage.setItem("try-on", "1");
      else localStorage.removeItem("try-on");
    } catch {}
  }
}

tryOnButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const on = !root.hasAttribute("data-try-on");
    setTryOn(on, true);
    showToast(on ? `You're wearing ${btn.dataset.name}. Have a look around.` : "Back to normal.");
  });
});

if (root.hasAttribute("data-try-on")) setTryOn(true, false);
