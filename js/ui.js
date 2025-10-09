import { AppState } from "./state.js";

/**
 * UIManager encapsulates DOM manipulation, screen transitions, animations and feedback.
 */
export class UIManager {
  constructor({ root, navRoot, toastRoot }) {
    this.root = root;
    this.navRoot = navRoot;
    this.toastRoot = toastRoot;
    this.activeScreen = null;
    this.themeState = "auto";
    this.toastQueue = [];
    this.screens = new Map();
    this.navConfig = [
      { id: "home", icon: "🏠", labels: { ru: "Главная", en: "Home" } },
      { id: "payments", icon: "💸", labels: { ru: "Платежи", en: "Payments" } },
      { id: "cards", icon: "💳", labels: { ru: "Карты", en: "Cards" } },
      { id: "settings", icon: "⚙️", labels: { ru: "Настройки", en: "Settings" } }
    ];
    this.#registerDefaultScreens();
    this.#setupNav(AppState.state.user?.language ?? "ru");
  }

  /**
   * Render a particular screen using the state snapshot.
   */
  showScreen(id, state, { pushHistory = true } = {}) {
    const render = this.screens.get(id);
    if (!render) {
      console.warn(`Screen ${id} is not registered.`);
      return;
    }

    if (pushHistory) {
      AppState.pushHistory(id);
    }

    const previous = this.root.querySelector(".screen.is-active");
    const nextScreen = render(state);
    nextScreen.dataset.screen = id;
    nextScreen.classList.add("screen");

    this.#attachGestureLayer(nextScreen);

    this.root.appendChild(nextScreen);
    requestAnimationFrame(() => {
      nextScreen.classList.add("is-active", "fade-blur-enter");
      if (previous) {
        previous.classList.remove("is-active");
        setTimeout(() => previous.remove(), 360);
      }
    });
    this.activeScreen = id;
    this.#updateNavigation(id);
    return nextScreen;
  }

  /**
   * Update the floating navigation buttons.
   */
  #setupNav(language = "ru") {
    this.navRoot.innerHTML = this.navConfig
      .map(
        (item) => `
        <button class="nav-item" data-target="${item.id}">
          <span class="icon" aria-hidden="true">${item.icon}</span>
          <span>${item.labels[language] ?? item.labels.ru}</span>
        </button>
      `
      )
      .join("");
    this.navRoot.querySelectorAll(".nav-item").forEach((button) => this.bindRipple(button));
  }

  refreshNavigationLanguage(language) {
    this.#setupNav(language);
    this.#updateNavigation(this.activeScreen ?? "home");
  }

  #updateNavigation(targetId) {
    const items = this.navRoot.querySelectorAll(".nav-item");
    items.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.target === targetId);
    });
  }

  /**
   * Present toast notifications with queueing behaviour.
   */
  showToast(message, tone = "neutral") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.textContent = message;
    this.toastRoot.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    this.toastQueue.push(toast);
    setTimeout(() => this.#dismissToast(toast), 3200);
  }

  #dismissToast(toast) {
    toast.classList.remove("is-visible");
    setTimeout(() => {
      toast.remove();
      this.toastQueue = this.toastQueue.filter((item) => item !== toast);
    }, 400);
  }

  /**
   * Control global theme state with transition.
   */
  applyTheme(theme) {
    const rootShell = document.getElementById("app");
    if (!rootShell) return;
    if (theme === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      rootShell.dataset.theme = prefersDark ? "dark" : "light";
    } else {
      rootShell.dataset.theme = theme;
    }
    rootShell.classList.add("theme-transition");
    setTimeout(() => rootShell.classList.remove("theme-transition"), 400);
    this.themeState = theme;
  }

  /**
   * Create ripple and haptic feedback on interactive elements.
   */
  bindRipple(element) {
    if (!element) return;
    element.addEventListener("click", (event) => {
      this.#vibrate(15);
      const rect = element.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      element.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  /**
   * Attach ripple behaviour to all interactive elements inside container.
   */
  enhanceInteractions(container) {
    container
      .querySelectorAll(
        "button, .widget-card, .setting-item, .profile-avatar, .nav-item"
      )
      .forEach((el) => this.bindRipple(el));
  }

  /**
   * Update progress ring arcs.
   */
  drawProgressRing(element, fraction, tone = "accent") {
    const svg = element.querySelector("svg");
    if (!svg) return;
    const circle = svg.querySelector("circle[data-role='progress']");
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = `${circumference - fraction * circumference}`;
    circle.style.stroke = tone === "success" ? "var(--success)" : "var(--accent)";
  }

  /**
   * Apply animated counter to balance amount.
   */
  animateBalance(element, fromValue, toValue, duration = 700) {
    const start = performance.now();
    const format = (value) =>
      new Intl.NumberFormat(AppState.state.user.language === "en" ? "en-US" : "ru-RU", {
        style: "currency",
        currency: AppState.state.balance.currency === "₽" ? "RUB" : "USD",
        currencyDisplay: "symbol"
      }).format(value);

    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromValue + (toValue - fromValue) * eased;
      element.textContent = format(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * Register screens and their templates.
   */
  #registerDefaultScreens() {
    this.screens.set("splash", (state) => this.#renderSplash(state));
    this.screens.set("pin", (state) => this.#renderPin(state));
    this.screens.set("home", (state) => this.#renderHome(state));
    this.screens.set("internet", (state) => this.#renderInternet(state));
    this.screens.set("calls", (state) => this.#renderCalls(state));
    this.screens.set("settings", (state) => this.#renderSettings(state));
  }

  #renderSplash() {
    const screen = document.createElement("section");
    screen.className = "screen splash";
    screen.innerHTML = `
      <div class="logo-stack">
        <div class="logo-emblem" id="app-logo">B</div>
        <div class="logo-title">
          <h2>BBank Neo</h2>
          <p>Ваша связь и финансы в одном касании</p>
        </div>
      </div>
      <button class="button button-primary primary-action" data-action="continue">
        Начать
      </button>
    `;
    return screen;
  }

  #renderPin(state) {
    const screen = document.createElement("section");
    screen.className = "screen pin-screen";
    screen.innerHTML = `
      <div class="pin-header">
        <h2 class="pin-title">${state.user.name || "Добро пожаловать"}</h2>
        <p class="text-muted">Введите PIN для доступа</p>
        <div class="pin-dots" role="group" aria-label="PIN индикатор">
          ${Array.from({ length: 4 })
            .map(() => '<span class="pin-dot" data-role="dot"></span>')
            .join("")}
        </div>
      </div>
      <div class="keypad" data-role="keypad"></div>
    `;
    return screen;
  }

  #renderHome(state) {
    const screen = document.createElement("section");
    screen.className = "screen main-screen";
    const dataUsage = state.allowances.data;
    const callsUsage = state.allowances.calls;
    const dataFraction = dataUsage.total
      ? Math.min(1, dataUsage.used / dataUsage.total)
      : 0;
    const callsFraction = callsUsage.total
      ? Math.min(1, 1 - callsUsage.used / callsUsage.total)
      : 0;
    screen.innerHTML = `
      <header class="main-header">
        <div class="profile-chip">
          <div class="profile-avatar" data-action="edit-name">${state.user.name
            .charAt(0)
            .toUpperCase()}</div>
          <div class="profile-meta">
            <span>${state.user.language === "en" ? "Welcome back" : "С возвращением"}</span>
            <h2>${state.user.name}</h2>
          </div>
        </div>
        <button class="button button-ghost" data-action="open-settings">⚙️</button>
      </header>
      <section class="balance-card" aria-live="polite">
        <h3>${state.user.language === "en" ? "Current balance" : "Ваш баланс"}</h3>
        <p class="balance-amount" data-role="balance-amount"></p>
        <p class="balance-subtext">${state.user.language === "en"
          ? "Актуально на сегодня"
          : "Актуально на сегодня"}</p>
      </section>
      <section class="widget-grid">
        <article class="widget-card" data-screen-target="internet" data-type="data">
          <div class="widget-info">
            <div class="widget-icon">🌐</div>
            <div class="widget-text">
              <h3>${state.user.language === "en" ? "Data" : "Интернет"}</h3>
              <span>${dataUsage.used.toFixed(1)} из ${dataUsage.total.toFixed(1)} ГБ</span>
            </div>
          </div>
          <div class="widget-meta">
            <div class="progress-ring" aria-hidden="true">
              <svg width="70" height="70">
                <circle cx="35" cy="35" r="30" stroke="rgba(255,255,255,0.12)"></circle>
                <circle data-role="progress" cx="35" cy="35" r="30" stroke="var(--accent)" stroke-dasharray="0" stroke-dashoffset="0"></circle>
              </svg>
            </div>
            <span>${Math.round(dataFraction * 100)}%</span>
          </div>
        </article>
        <article class="widget-card" data-screen-target="calls" data-type="calls">
          <div class="widget-info">
            <div class="widget-icon">📞</div>
            <div class="widget-text">
              <h3>${state.user.language === "en" ? "Calls" : "Звонки"}</h3>
              <span>${callsUsage.used === callsUsage.total
                ? state.user.language === "en"
                  ? "Исчерпаны"
                  : "Закончились"
                : `${callsUsage.total - callsUsage.used} мин`}</span>
            </div>
          </div>
          <div class="widget-meta">
            <div class="progress-ring" aria-hidden="true">
              <svg width="70" height="70">
                <circle cx="35" cy="35" r="30" stroke="rgba(255,255,255,0.12)"></circle>
                <circle data-role="progress" cx="35" cy="35" r="30" stroke="var(--success)" stroke-dasharray="0" stroke-dashoffset="0"></circle>
              </svg>
            </div>
            <span>${Math.round(callsFraction * 100)}%</span>
          </div>
        </article>
      </section>
    `;
    return screen;
  }

  #renderInternet(state) {
    const tariff = state.tariffs?.find((item) => item.id === "internet");
    const screen = document.createElement("section");
    screen.className = "screen tariff-screen";
    screen.innerHTML = `
      <header class="screen-header">
        <button class="back-button" data-action="back" aria-label="Назад">⟵</button>
        <h1>${tariff?.name ?? "Интернет"}</h1>
      </header>
      <section class="section-card">
        <p>${tariff?.description ?? "Управляйте пакетами трафика"}</p>
        <div class="progress-meter">
          <canvas width="300" height="300" data-role="canvas"></canvas>
          <div class="meter-label">
            <strong>${state.allowances.data.used.toFixed(1)}</strong>
            <span>${state.user.language === "en" ? "of" : "из"} ${state.allowances.data.total.toFixed(1)} ГБ</span>
          </div>
        </div>
        <div class="action-group" data-role="addon-group">
          ${(tariff?.addons || [])
            .map(
              (addon) => `
                <button class="button button-secondary" data-action="purchase" data-addon="${addon.id}" data-amount="${addon.amount}">
                  ${addon.label} · ${addon.amount} ₽
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    `;
    return screen;
  }

  #renderCalls(state) {
    const tariff = state.tariffs?.find((item) => item.id === "calls");
    const screen = document.createElement("section");
    screen.className = "screen tariff-screen";
    const minutesLeft = Math.max(0, tariff ? tariff.addons?.[0]?.amount ?? 0 : 0);
    screen.innerHTML = `
      <header class="screen-header">
        <button class="back-button" data-action="back" aria-label="Назад">⟵</button>
        <h1>${tariff?.name ?? "Звонки"}</h1>
      </header>
      <section class="section-card">
        <p>${tariff?.description ?? "Контроль минут"}</p>
        <div class="progress-meter">
          <canvas width="300" height="300" data-role="canvas"></canvas>
          <div class="meter-label">
            <strong>${Math.max(0, tariff ? tariff.addons?.length ?? 0 : 0)}</strong>
            <span>${state.user.language === "en" ? "available packs" : "пакетов доступно"}</span>
          </div>
        </div>
        <div class="action-group" data-role="addon-group">
          ${(tariff?.addons || [])
            .map(
              (addon) => `
                <button class="button button-secondary" data-action="purchase" data-addon="${addon.id}" data-amount="${addon.amount}">
                  ${addon.label} · ${addon.amount} ₽
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    `;
    return screen;
  }

  #renderSettings(state) {
    const screen = document.createElement("section");
    screen.className = "screen tariff-screen";
    screen.innerHTML = `
      <header class="screen-header">
        <h1>${state.user.language === "en" ? "Settings" : "Настройки"}</h1>
      </header>
      <section class="section-card settings-list">
        <div class="setting-item" data-action="change-theme">
          <div>
            ${state.user.language === "en" ? "Theme" : "Тема"}
            <span>${this.#themeLabel(state.theme)}</span>
          </div>
          <div>🌓</div>
        </div>
        <div class="setting-item" data-action="change-language">
          <div>
            ${state.user.language === "en" ? "Language" : "Язык"}
            <span>${state.user.language.toUpperCase()}</span>
          </div>
          <div>🌐</div>
        </div>
        <div class="setting-item" data-action="change-pin">
          <div>
            ${state.user.language === "en" ? "Change PIN" : "Сменить PIN"}
          </div>
          <div>🔐</div>
        </div>
        <div class="setting-item" data-action="logout" data-role="logout">
          <div>${state.user.language === "en" ? "Log out" : "Выход"}</div>
          <div>🚪</div>
        </div>
      </section>
    `;
    return screen;
  }

  #themeLabel(theme) {
    switch (theme) {
      case "light":
        return "Светлая";
      case "dark":
        return "Тёмная";
      default:
        return "Системная";
    }
  }

  #attachGestureLayer(screen) {
    const layer = document.createElement("div");
    layer.className = "gesture-layer";
    let startX = 0;
    let startY = 0;
    layer.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        startX = touch.clientX;
        startY = touch.clientY;
      },
      { passive: true }
    );
    layer.addEventListener(
      "touchend",
      (event) => {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50 && deltaX > 0) {
          document.dispatchEvent(new CustomEvent("gesture:back"));
        }
        if (deltaY < -80 && Math.abs(deltaX) < 40) {
          document.dispatchEvent(new CustomEvent("gesture:close"));
        }
      },
      { passive: true }
    );
    screen.appendChild(layer);
  }

  #vibrate(ms) {
    if (window.navigator?.vibrate) {
      window.navigator.vibrate(ms);
    }
  }
}
