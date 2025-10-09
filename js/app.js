import { StateManager } from "./state.js";
import { UIManager } from "./ui.js";

const stateManager = new StateManager();
const uiManager = new UIManager({
  rootSelector: "#app",
  toastSelector: "#toast-root",
  stateManager,
});

async function boot() {
  uiManager.mount();
  await stateManager.initialize();
  setupOnlineStatus();
  registerServiceWorker();
}

function setupOnlineStatus() {
  const update = () => {
    if (!navigator.onLine) {
      uiManager.showToast({ message: "Вы офлайн", icon: "📡" });
    }
  };
  window.addEventListener("offline", update);
  window.addEventListener("online", () => uiManager.showToast({ message: "Онлайн", icon: "✅" }));
  update();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("SW registration failed", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

