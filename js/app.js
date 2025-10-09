import { AppState } from "./state.js";
import { UIManager } from "./ui.js";

const screenRoot = document.getElementById("screen-root");
const navRoot = document.getElementById("floating-nav");
const toastRoot = document.getElementById("toast-stack");

const ui = new UIManager({ root: screenRoot, navRoot, toastRoot });
let pinBuffer = "";
let previousBalance = 0;
let isAuthenticating = false;

const LANG = {
  ru: {
    wrongPin: "Неверный PIN. Попробуйте ещё раз",
    paymentsSoon: "Раздел скоро будет доступен",
    cardsSoon: "Виртуальные карты в разработке",
    purchaseSuccess: (label) => `Успешно: ${label}`,
    insufficient: "Недостаточно средств",
    logout: "Вы вышли из аккаунта",
    pinChanged: "PIN-код обновлён",
    namePrompt: "Введите новое имя",
    languageSwitched: "Язык переключён"
  },
  en: {
    wrongPin: "Incorrect PIN. Try again",
    paymentsSoon: "Payments section coming soon",
    cardsSoon: "Cards are on the way",
    purchaseSuccess: (label) => `Purchased: ${label}`,
    insufficient: "Insufficient balance",
    logout: "Signed out",
    pinChanged: "PIN updated",
    namePrompt: "Enter a new name",
    languageSwitched: "Language updated"
  }
};

async function boot() {
  const config = await fetchConfig();
  const state = AppState.initialise(config);
  previousBalance = state.balance.amount;
  ui.applyTheme(state.theme);
  ui.refreshNavigationLanguage(state.user.language || "ru");
  const initialScreen = state.onboardingComplete ? "home" : "splash";
  const screen = ui.showScreen(initialScreen, state, { pushHistory: false });
  AppState.state.history = [initialScreen];
  AppState.persist();
  ui.enhanceInteractions(screen);
  bindScreenEvents(initialScreen, screen);
  registerNavigation();
  registerGlobalGestures();
  registerServiceWorker();
  animateSplash(screen);
}

async function fetchConfig() {
  try {
    const response = await fetch("./assets/data/config.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Config load failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return {};
  }
}

function animateSplash(screen) {
  const logo = screen?.querySelector("#app-logo");
  if (!logo) return;
  requestAnimationFrame(() => {
    logo.style.transition = "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 900ms";
    logo.style.opacity = "1";
    logo.style.transform = "scale(1) rotate(0deg)";
  });
  const button = screen.querySelector('[data-action="continue"]');
  if (button) {
    setTimeout(() => button.classList.add("is-visible"), 600);
  }
}

function registerNavigation() {
  navRoot.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-item");
    if (!button) return;
    const target = button.dataset.target;
    switch (target) {
      case "home":
        navigate("home");
        break;
      case "settings":
        navigate("settings");
        break;
      case "payments":
        ui.showToast(LANG[AppState.state.user.language].paymentsSoon, "neutral");
        break;
      case "cards":
        ui.showToast(LANG[AppState.state.user.language].cardsSoon, "neutral");
        break;
      default:
        break;
    }
  });
}

function registerGlobalGestures() {
  document.addEventListener("gesture:back", () => {
    const previous = AppState.popHistory();
    if (previous && previous !== ui.activeScreen) {
      navigate(previous, { pushHistory: false });
    } else if (ui.activeScreen !== "home") {
      navigate("home", { pushHistory: false });
    }
  });
  document.addEventListener("gesture:close", () => {
    if (ui.activeScreen !== "home") {
      navigate("home", { pushHistory: false });
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch((error) => console.error("SW registration failed", error));
    });
  }
}

function navigate(screenId, options = {}) {
  const screen = ui.showScreen(screenId, AppState.state, options);
  if (!screen) return;
  ui.enhanceInteractions(screen);
  bindScreenEvents(screenId, screen);
  if (screenId === "home" && options.pushHistory === false) {
    AppState.state.history = ["home"];
    AppState.persist();
  }
}

function bindScreenEvents(screenId, screen) {
  switch (screenId) {
    case "splash": {
      screen.querySelector('[data-action="continue"]').addEventListener("click", () => {
        AppState.state.onboardingComplete = false;
        navigate("pin");
      });
      break;
    }
    case "pin": {
      buildKeypad(screen.querySelector('[data-role="keypad"]'));
      break;
    }
    case "home": {
      const balanceEl = screen.querySelector('[data-role="balance-amount"]');
      ui.animateBalance(balanceEl, previousBalance, AppState.state.balance.amount);
      previousBalance = AppState.state.balance.amount;
      screen.querySelectorAll("[data-screen-target]").forEach((card) => {
        card.addEventListener("click", () => {
          const target = card.dataset.screenTarget;
          navigate(target);
        });
      });
      screen
        .querySelector('[data-action="open-settings"]')
        .addEventListener("click", () => navigate("settings"));
      screen
        .querySelector('[data-action="edit-name"]')
        .addEventListener("click", handleChangeName);
      screen.querySelectorAll(".progress-ring").forEach((ring) => {
        const type = ring.closest(".widget-card").dataset.type;
        if (type === "data") {
          const fraction = AppState.state.allowances.data.total
            ? AppState.state.allowances.data.used / AppState.state.allowances.data.total
            : 0;
          ui.drawProgressRing(ring, fraction, "accent");
        } else {
          const fraction = AppState.state.allowances.calls.total
            ? 1 - AppState.state.allowances.calls.used / AppState.state.allowances.calls.total
            : 0;
          ui.drawProgressRing(ring, fraction, "success");
        }
      });
      break;
    }
    case "internet":
    case "calls": {
      screen.querySelector("[data-action='back']").addEventListener("click", () => {
        navigate("home", { pushHistory: false });
      });
      const canvas = screen.querySelector("canvas[data-role='canvas']");
      if (canvas) {
        drawAllowanceCanvas(canvas, screenId === "internet");
      }
      screen.querySelectorAll("[data-action='purchase']").forEach((button) => {
        button.addEventListener("click", () => handlePurchase(button));
      });
      break;
    }
    case "settings": {
      screen.querySelector('[data-action="change-theme"]').addEventListener("click", cycleTheme);
      screen
        .querySelector('[data-action="change-language"]')
        .addEventListener("click", toggleLanguage);
      screen.querySelector('[data-action="change-pin"]').addEventListener("click", handleChangePin);
      screen.querySelector('[data-action="logout"]').addEventListener("click", handleLogout);
      break;
    }
    default:
      break;
  }
}

function buildKeypad(container) {
  if (!container) return;
  container.innerHTML = "";
  const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "←"];
  layout.forEach((symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = symbol;
    button.disabled = symbol === "";
    container.appendChild(button);
    if (symbol === "") return;
    button.addEventListener("click", () => handlePinInput(symbol));
  });
}

function handlePinInput(symbol) {
  if (isAuthenticating) return;
  if (symbol === "←") {
    pinBuffer = pinBuffer.slice(0, -1);
  } else if (pinBuffer.length < 4) {
    pinBuffer += symbol.toString();
  }
  updatePinDots();
  if (pinBuffer.length === 4) {
    verifyPin();
  }
}

function updatePinDots(isError = false) {
  const dots = document.querySelectorAll(".pin-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-filled", index < pinBuffer.length);
    dot.classList.toggle("is-error", isError);
  });
  if (isError) {
    setTimeout(() => {
      dots.forEach((dot) => dot.classList.remove("is-error"));
    }, 1200);
  }
}

function verifyPin() {
  const expected = AppState.state.user.pin;
  isAuthenticating = true;
  if (pinBuffer === expected) {
    showFakeProgress().then(() => {
      AppState.state.onboardingComplete = true;
      AppState.state.lastLogin = Date.now();
      AppState.persist();
      pinBuffer = "";
      navigate("home");
      AppState.state.history = ["home"];
      AppState.persist();
      isAuthenticating = false;
    });
  } else {
    const message = LANG[AppState.state.user.language].wrongPin;
    ui.showToast(message, "error");
    updatePinDots(true);
    setTimeout(() => {
      pinBuffer = "";
      updatePinDots();
      isAuthenticating = false;
    }, 900);
  }
}

function showFakeProgress() {
  return new Promise((resolve) => {
    const dots = document.createElement("div");
    dots.className = "loading-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    const keypad = document.querySelector("[data-role='keypad']");
    keypad?.classList.add("hidden");
    const header = document.querySelector(".pin-header");
    header?.appendChild(dots);
    setTimeout(() => {
      dots.remove();
      keypad?.classList.remove("hidden");
      resolve();
    }, 900);
  });
}

function drawAllowanceCanvas(canvas, isData) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const center = { x: width / 2, y: height / 2 };
  const radius = Math.min(width, height) / 2 - 18;
  const startAngle = -Math.PI / 2;
  const baseColor = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 26;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.strokeStyle = baseColor;
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  const allowance = isData ? AppState.state.allowances.data : AppState.state.allowances.calls;
  const total = allowance.total || 1;
  const used = allowance.used || 0;
  const fraction = isData ? used / total : 1 - used / total;
  ctx.beginPath();
  ctx.strokeStyle = isData ? "rgba(10,132,255,0.9)" : "rgba(39,174,96,0.9)";
  ctx.arc(center.x, center.y, radius, startAngle, startAngle + fraction * Math.PI * 2);
  ctx.stroke();
}

function handlePurchase(button) {
  const amount = Number(button.dataset.amount || 0);
  const addonId = button.dataset.addon;
  if (amount > AppState.state.balance.amount) {
    ui.showToast(LANG[AppState.state.user.language].insufficient, "error");
    return;
  }
  AppState.adjustBalance(amount);
  previousBalance = AppState.state.balance.amount;
  if (addonId.includes("gb")) {
    AppState.state.allowances.data.used = Math.max(
      0,
      AppState.state.allowances.data.used - (addonId === "5gb" ? 5 : 1)
    );
  } else {
    AppState.state.allowances.calls.used = Math.max(
      0,
      AppState.state.allowances.calls.used - (addonId === "100min" ? 100 : 50)
    );
  }
  AppState.persist();
  ui.showToast(LANG[AppState.state.user.language].purchaseSuccess(button.textContent), "success");
  navigate("home", { pushHistory: false });
}

function cycleTheme() {
  const order = ["auto", "dark", "light"];
  const currentIndex = order.indexOf(AppState.state.theme || "auto");
  const next = order[(currentIndex + 1) % order.length];
  AppState.state.theme = next;
  AppState.persist();
  ui.applyTheme(next);
  navigate("settings", { pushHistory: false });
}

function toggleLanguage() {
  const next = AppState.state.user.language === "ru" ? "en" : "ru";
  AppState.update("user.language", next);
  ui.showToast(LANG[next].languageSwitched, "success");
  ui.refreshNavigationLanguage(next);
  navigate("settings", { pushHistory: false });
}

function handleChangePin() {
  const promptText = AppState.state.user.language === "en" ? "Enter new 4-digit PIN" : "Введите новый PIN из 4 цифр";
  const nextPin = window.prompt(promptText, "");
  if (nextPin && /^\d{4}$/.test(nextPin)) {
    AppState.update("user.pin", nextPin);
    ui.showToast(LANG[AppState.state.user.language].pinChanged, "success");
  }
}

function handleChangeName() {
  const lang = AppState.state.user.language;
  const promptText = lang === "en" ? "Enter your name" : LANG[lang].namePrompt;
  const nextName = window.prompt(promptText, AppState.state.user.name);
  if (nextName && nextName.trim()) {
    AppState.update("user.name", nextName.trim());
    navigate("home", { pushHistory: false });
  }
}

function handleLogout() {
  AppState.state.onboardingComplete = false;
  AppState.persist();
  ui.showToast(LANG[AppState.state.user.language].logout, "neutral");
  navigate("pin", { pushHistory: false });
  AppState.state.history = ["pin"];
  AppState.persist();
  pinBuffer = "";
  updatePinDots();
}

boot();
