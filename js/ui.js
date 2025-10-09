/**
 * UIManager управляет шаблонами, анимациями и пользовательскими взаимодействиями.
 */
export class UIManager {
  constructor({ rootSelector, toastSelector, stateManager }) {
    this.root = document.querySelector(rootSelector);
    this.toastRoot = document.querySelector(toastSelector);
    this.state = stateManager;
    this.templates = {
      splash: document.getElementById("splash-template"),
      pin: document.getElementById("pin-template"),
      main: document.getElementById("main-template"),
      settings: document.getElementById("settings-template"),
      toast: document.getElementById("toast-template"),
    };
    this.screens = new Map();
    this.activeScreen = null;
    this.toastQueue = [];
    this.isTransitioning = false;
    this.touchData = null;
    try {
      this.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
      this.themeMedia.addEventListener("change", () => {
        if (this.state.state.settings.theme === "auto") {
          this.applyTheme("auto");
        }
      });
    } catch (error) {
      console.warn("Theme media query unsupported", error);
    }
  }

  /**
   * Устанавливает начальные экраны и слушатели.
   */
  mount() {
    this.mountScreen("splash");
    this.mountScreen("pin");
    this.mountScreen("main");
    this.mountScreen("settings");

    this.showScreen("splash", { immediate: true, skipHistory: true });
    this.registerInteractions();
    this.bindStateListeners();
  }

  /**
   * Создаёт экземпляр экрана из шаблона.
   */
  mountScreen(key) {
    if (this.screens.has(key)) {
      return;
    }
    const template = this.templates[key];
    if (!template) {
      throw new Error(`Template ${key} not found`);
    }
    const content = template.content.cloneNode(true);
    const element = content.firstElementChild;
    element.classList.add("screen");
    element.dataset.screen = key;
    this.root.appendChild(element);
    this.screens.set(key, element);
  }

  /**
   * Навешивает обработчики событий UI.
   */
  registerInteractions() {
    const splash = this.screens.get("splash");
    splash.querySelector("[data-action='open-pin']").addEventListener("click", () => {
      this.triggerHaptics();
      this.showScreen("pin");
    });

    const pinScreen = this.screens.get("pin");
    this.buildKeypad(pinScreen.querySelector(".pin__keypad"));
    pinScreen.querySelector("[data-action='close-pin']").addEventListener("click", () => {
      this.triggerHaptics();
      this.showScreen("splash", { backward: true, skipHistory: true });
    });

    const settingsScreen = this.screens.get("settings");
    settingsScreen.querySelector("[data-action='close-settings']").addEventListener("click", () => {
      this.triggerHaptics();
      this.showScreen("home", { backward: true, skipHistory: true });
    });

    this.root.addEventListener("click", (event) => this.handleAction(event));
    this.root.addEventListener("pointerdown", (event) => {
      this.createRipple(event);
      this.handleGestureStart(event);
    });
    this.root.addEventListener("pointermove", (event) => this.handleGestureMove(event));
    this.root.addEventListener("pointerup", (event) => this.handleGestureEnd(event));
  }

  bindStateListeners() {
    this.state.addEventListener("ready", ({ detail }) => {
      this.renderHome(detail);
      this.applyTheme(detail.settings.theme);
    });

    this.state.addEventListener("change", ({ detail }) => {
      this.renderHome(detail);
      this.syncSettings(detail);
    });

    this.state.addEventListener("theme-change", ({ detail }) => {
      this.applyTheme(detail);
    });

    this.state.addEventListener("user-change", ({ detail }) => {
      this.renderGreetings(detail);
    });
  }

  /**
   * Показывает экран с анимацией перехода.
   */
  async showScreen(key, options = {}) {
    if (this.isTransitioning) {
      return;
    }
    const target = this.screens.get(key === "home" ? "main" : key);
    if (!target) {
      return;
    }
    const previous = this.activeScreen;
    if (previous === target) {
      return;
    }
    this.isTransitioning = true;
    if (!options.immediate) {
      target.classList.add("fade-enter");
      requestAnimationFrame(() => target.classList.add("fade-enter-active"));
    }
    if (previous) {
      previous.classList.remove("screen--active", "is-active", "fade-enter", "fade-enter-active");
    }
    target.classList.add("screen--active", "is-active");
    this.activeScreen = target;
    if (!options.skipHistory) {
      this.state.pushHistory(key);
    }
    this.updateNavigation(key);
    if (!options.immediate) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      target.classList.remove("fade-enter", "fade-enter-active");
    }
    this.isTransitioning = false;
  }

  updateNavigation(activeKey) {
    const main = this.screens.get("main");
    if (!main) {
      return;
    }
    main.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("nav-item--active", item.dataset.action === `nav-${activeKey}` || (activeKey === "home" && item.dataset.action === "nav-home"));
    });
  }

  /**
   * Отрисовка главного экрана.
   */
  renderHome(stateSnapshot) {
    const main = this.screens.get("main");
    if (!main) {
      return;
    }
    const header = main.querySelector(".topbar__greeting");
    const name = main.querySelector(".topbar__name");
    const locale = stateSnapshot.settings.language === "en" ? "en-US" : "ru-RU";
    const now = new Date();
    const greeting = this.composeGreeting(now, stateSnapshot.settings.language);
    header.textContent = greeting;
    name.textContent = stateSnapshot.user.name || "Гость";

    const mainContainer = main.querySelector("[data-bind='home-content']");
    mainContainer.innerHTML = "";

    const balanceCard = document.createElement("section");
    balanceCard.className = "balance-card blur-fade-enter";
    balanceCard.innerHTML = `
      <p class="balance-card__title">${this.translate("balance", stateSnapshot.settings.language)}</p>
      <p class="balance-card__amount">${new Intl.NumberFormat(locale, {
        style: "currency",
        currency: stateSnapshot.user.currency === "₽" ? "RUB" : "USD",
        currencyDisplay: "symbol",
      }).format(stateSnapshot.user.balance)}</p>
      <p class="balance-card__sub">${this.translate("last-update", stateSnapshot.settings.language)}</p>
    `;
    mainContainer.appendChild(balanceCard);

    const cardsGrid = document.createElement("div");
    cardsGrid.className = "cards-grid";

    const dataTile = this.createPlanTile(stateSnapshot.plans.data, stateSnapshot.settings.language, "🌐", () => {
      this.triggerHaptics();
      this.showDataSheet(stateSnapshot);
    });
    const callsTile = this.createPlanTile(stateSnapshot.plans.calls, stateSnapshot.settings.language, "📞", () => {
      this.triggerHaptics();
      this.showCallsSheet(stateSnapshot);
    });

    cardsGrid.append(dataTile, callsTile);
    mainContainer.appendChild(cardsGrid);
  }

  renderGreetings(user) {
    const main = this.screens.get("main");
    if (!main) {
      return;
    }
    const name = main.querySelector(".topbar__name");
    name.textContent = user.name || "Гость";
  }

  /**
   * Создаёт карточку тарифа.
   */
  createPlanTile(plan, language, icon, onClick) {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.innerHTML = `
      <span class="tile__icon" aria-hidden="true">${icon}</span>
      <span class="tile__info">
        <span class="tile__title">${plan?.title ?? plan?.planName ?? ""}</span>
        <span class="tile__description">${this.translate("usage", language)}: ${plan?.used ?? 0} / ${plan?.total ?? 0}</span>
      </span>
      <span class="tile__indicator">${this.translate("open", language)} →</span>
    `;
    tile.addEventListener("click", onClick);
    return tile;
  }

  /**
   * Показ листа с интернет трафиком.
   */
  showDataSheet(stateSnapshot) {
    const { plans, settings } = stateSnapshot;
    this.presentSheet({
      title: plans.data.title ?? "Интернет",
      subtitle: plans.data.planName,
      usage: `${plans.data.used} / ${plans.data.total} ГБ`,
      percentage: plans.data.used / plans.data.total,
      actions: plans.data.actions,
      language: settings.language,
      onAction: (amount) => this.fakePurchase(amount, "data"),
    });
  }

  showCallsSheet(stateSnapshot) {
    const { plans, settings } = stateSnapshot;
    this.presentSheet({
      title: plans.calls.title ?? "Звонки",
      subtitle: plans.calls.planName,
      usage: `${plans.calls.used} / ${plans.calls.total} мин`,
      percentage: plans.calls.total === 0 ? 0 : plans.calls.used / plans.calls.total,
      actions: plans.calls.actions,
      language: settings.language,
      onAction: (amount) => this.fakePurchase(amount, "calls"),
    });
  }

  presentSheet({ title, subtitle, usage, percentage, actions, language, onAction }) {
    let sheet = document.querySelector(".sheet");
    if (!sheet) {
      sheet = document.createElement("section");
      sheet.className = "sheet sheet-enter";
      sheet.innerHTML = `
        <div class="sheet__header">
          <span class="sheet__handle" aria-hidden="true"></span>
          <h2 class="sheet__title"></h2>
          <p class="sheet__subtitle"></p>
        </div>
        <div class="progress-ring">
          <svg viewBox="0 0 120 120">
            <circle class="progress-ring__bg" cx="60" cy="60" r="52" stroke-width="10" fill="none" />
            <circle class="progress-ring__value" cx="60" cy="60" r="52" stroke-width="10" fill="none" stroke-linecap="round" />
          </svg>
          <div class="progress-ring__label"></div>
        </div>
        <div class="sheet__actions"></div>
      `;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (event) => {
        if (event.target === sheet) {
          this.dismissSheet();
        }
      });
    }
    sheet.classList.remove("fade-out");
    sheet.classList.remove("sheet-enter");
    sheet.querySelector(".sheet__title").textContent = title;
    sheet.querySelector(".sheet__subtitle").textContent = subtitle ?? "";
    sheet.querySelector(".progress-ring__label").textContent = usage;

    const circle = sheet.querySelector(".progress-ring__value");
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const clamped = Math.max(0, Math.min(1, percentage));
    circle.style.strokeDashoffset = `${circumference - clamped * circumference}`;

    const actionsRoot = sheet.querySelector(".sheet__actions");
    actionsRoot.innerHTML = "";
    (actions ?? []).forEach((action) => {
      const btn = document.createElement("button");
      btn.className = "btn btn--primary";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        this.triggerHaptics();
        onAction?.(action.amount);
      });
      actionsRoot.appendChild(btn);
    });

    sheet.classList.remove("hidden");
    requestAnimationFrame(() => sheet.classList.add("sheet-enter"));
  }

  dismissSheet() {
    const sheet = document.querySelector(".sheet");
    if (!sheet) {
      return;
    }
    sheet.classList.remove("sheet-enter");
    sheet.classList.add("fade-out");
    setTimeout(() => {
      sheet.remove();
    }, 300);
  }

  fakePurchase(amount, type) {
    this.state.adjustBalance(-amount * (type === "data" ? 120 : 3));
    this.showToast({
      message: this.translate("purchase-success", this.state.state.settings.language),
      icon: type === "data" ? "🌐" : "📞",
    });
    this.dismissSheet();
  }

  composeGreeting(date, language) {
    const hour = date.getHours();
    let key = "day";
    if (hour < 6) key = "night";
    else if (hour < 12) key = "morning";
    else if (hour < 18) key = "day";
    else key = "evening";
    const dict = {
      ru: { morning: "Доброе утро", day: "Добрый день", evening: "Добрый вечер", night: "Доброй ночи" },
      en: { morning: "Good morning", day: "Good afternoon", evening: "Good evening", night: "Good night" },
    };
    return dict[language]?.[key] ?? dict.ru.day;
  }

  translate(key, language) {
    const dict = {
      balance: { ru: "Ваш баланс", en: "Your balance" },
      "last-update": { ru: "Обновлено только что", en: "Updated just now" },
      usage: { ru: "Использовано", en: "Usage" },
      open: { ru: "Открыть", en: "Open" },
      "purchase-success": { ru: "Покупка выполнена", en: "Purchase completed" },
      "invalid-pin": { ru: "Неверный PIN", en: "Invalid PIN" },
    };
    return dict[key]?.[language] ?? dict[key]?.ru ?? key;
  }

  /**
   * Создаёт кнопки клавиатуры PIN.
   */
  buildKeypad(container) {
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "←"];
    container.innerHTML = "";
    keys.forEach((key) => {
      const button = document.createElement("button");
      button.className = "keypad__key";
      button.textContent = key;
      if (key === "") {
        button.disabled = true;
        button.classList.add("hidden");
      }
      button.addEventListener("click", () => this.handleKeypadInput(key));
      container.appendChild(button);
    });
  }

  handleKeypadInput(key) {
    const pinDots = Array.from(this.screens.get("pin").querySelectorAll(".pin__dot"));
    if (!this.pinValue) {
      this.pinValue = "";
    }
    if (typeof key === "number") {
      if (this.pinValue.length >= 4) {
        return;
      }
      this.pinValue += key;
      pinDots[this.pinValue.length - 1]?.classList.add("is-filled");
      if (this.pinValue.length === 4) {
        setTimeout(() => this.submitPin(), 280);
      }
    }
    if (key === "←") {
      this.pinValue = this.pinValue.slice(0, -1);
      pinDots.forEach((dot, index) => {
        dot.classList.toggle("is-filled", index < this.pinValue.length);
      });
    }
  }

  submitPin() {
    const isValid = this.state.validatePin(this.pinValue);
    const pinDots = Array.from(this.screens.get("pin").querySelectorAll(".pin__dot"));
    if (isValid) {
      this.showToast({
        message: this.state.settings.language === "en" ? "Welcome back" : "С возвращением",
        icon: "✨",
      });
      this.showScreen("home");
      this.pinValue = "";
      this.triggerHaptics();
      pinDots.forEach((dot) => dot.classList.remove("is-filled"));
    } else {
      this.triggerHaptics();
      pinDots.forEach((dot) => {
        dot.classList.remove("is-filled");
        dot.classList.add("is-error");
        setTimeout(() => dot.classList.remove("is-error"), 600);
      });
      this.showToast({ message: this.translate("invalid-pin", this.state.state.settings.language), icon: "⚠️" });
      this.pinValue = "";
    }
  }

  /**
   * Универсальный обработчик действий.
   */
  handleAction(event) {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }
    const action = target.dataset.action;
    this.triggerHaptics();
    switch (action) {
      case "toggle-theme":
        this.toggleTheme();
        break;
      case "open-settings":
      case "nav-settings":
        this.showScreen("settings");
        break;
      case "nav-home":
        this.showScreen("home");
        break;
      case "nav-payments":
        this.showToast({ message: "Скоро", icon: "💡" });
        break;
      case "nav-cards":
        this.showToast({ message: "Скоро", icon: "💳" });
        break;
      case "set-theme-light":
        this.state.setTheme("light");
        break;
      case "set-theme-dark":
        this.state.setTheme("dark");
        break;
      case "set-theme-auto":
        this.state.setTheme("auto");
        break;
      case "set-lang-ru":
        this.state.setLanguage("ru");
        break;
      case "set-lang-en":
        this.state.setLanguage("en");
        break;
      case "change-pin":
        this.promptPinChange();
        break;
      case "logout":
        this.handleLogout();
        break;
      default:
        break;
    }
  }

  promptPinChange() {
    const next = window.prompt("Введите новый PIN (4 цифры)");
    if (!next) {
      return;
    }
    const clean = next.replace(/\D/g, "");
    if (clean.length !== 4) {
      this.showToast({ message: "PIN должен содержать 4 цифры", icon: "⚠️" });
      return;
    }
    try {
      this.state.setPin(clean);
      this.showToast({ message: "PIN обновлён", icon: "🔐" });
    } catch (error) {
      this.showToast({ message: error.message, icon: "⚠️" });
    }
  }

  handleLogout() {
    this.state.update({ history: ["splash"], currentScreen: "splash" });
    this.showToast({ message: "Вы вышли", icon: "👋" });
    this.showScreen("splash");
  }

  toggleTheme() {
    const { theme } = this.state.state.settings;
    const sequence = theme === "light" ? "dark" : theme === "dark" ? "auto" : "light";
    this.state.setTheme(sequence);
  }

  applyTheme(theme) {
    const root = document.documentElement;
    let nextTheme = theme;
    if (theme === "auto") {
      nextTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.setAttribute("data-theme", nextTheme);
    root.classList.add("theme-transition");
    setTimeout(() => root.classList.remove("theme-transition"), 400);
  }

  syncSettings(stateSnapshot) {
    const settingsScreen = this.screens.get("settings");
    if (!settingsScreen) {
      return;
    }
    const nameInput = settingsScreen.querySelector("[data-bind='input-name']");
    if (document.activeElement !== nameInput) {
      nameInput.value = stateSnapshot.user.name ?? "";
    }
    settingsScreen.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.remove("is-active");
    });
    settingsScreen
      .querySelector(`[data-action='set-theme-${stateSnapshot.settings.theme}']`)
      ?.classList.add("is-active");
    settingsScreen
      .querySelector(`[data-action='set-lang-${stateSnapshot.settings.language}']`)
      ?.classList.add("is-active");
    if (!nameInput.dataset.bound) {
      nameInput.dataset.bound = "true";
      nameInput.addEventListener("change", (event) => {
        this.state.setName(event.target.value);
      });
    }
  }

  /**
   * Toast уведомления.
   */
  showToast({ message, icon }) {
    const toast = this.templates.toast.content.firstElementChild.cloneNode(true);
    toast.querySelector(".toast__message").textContent = message;
    toast.querySelector(".toast__icon").textContent = icon ?? "✨";
    this.toastRoot.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  triggerHaptics() {
    if (navigator.vibrate) {
      navigator.vibrate(6);
    }
  }

  createRipple(event) {
    const target = event.target.closest(".btn, .nav-item, .tile, .btn-icon, .keypad__key");
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    target.style.setProperty("--ripple-x", `${x}%`);
    target.style.setProperty("--ripple-y", `${y}%`);
    target.classList.add("is-rippling");
    setTimeout(() => target.classList.remove("is-rippling"), 450);
  }

  handleGestureStart(event) {
    this.touchData = {
      startX: event.clientX,
      startY: event.clientY,
      time: performance.now(),
    };
  }

  handleGestureMove(event) {
    if (!this.touchData) {
      return;
    }
    this.touchData.deltaX = event.clientX - this.touchData.startX;
    this.touchData.deltaY = event.clientY - this.touchData.startY;
  }

  handleGestureEnd() {
    if (!this.touchData) {
      return;
    }
    const { deltaX = 0, deltaY = 0 } = this.touchData;
    if (Math.abs(deltaX) > 90 && Math.abs(deltaY) < 60 && deltaX > 0) {
      const previous = this.state.popHistory();
      this.showScreen(previous, { backward: true, skipHistory: true });
    }
    if (deltaY < -100) {
      this.dismissSheet();
    }
    this.touchData = null;
  }
}
