/**
 * StateManager отвечает за хранение и управление состоянием приложения.
 * Состояние синхронизируется с localStorage и генерирует события обновления.
 */
export class StateManager extends EventTarget {
  constructor(storageKey = "bbank-app-state") {
    super();
    this.storageKey = storageKey;
    this.initialized = false;
    this.state = {
      ready: false,
      user: {
        name: "",
        balance: 0,
        currency: "₽",
      },
      settings: {
        theme: "auto",
        language: "ru",
        pin: "1234",
      },
      plans: {
        data: {
          planName: "",
          used: 0,
          total: 0,
          actions: [],
        },
        calls: {
          planName: "",
          used: 0,
          total: 0,
          actions: [],
        },
      },
      history: ["splash"],
      currentScreen: "splash",
      pinAttempts: 0,
      lastAuthAt: null,
    };
  }

  /**
   * Инициализация состояния: загрузка локальных данных и конфигурации.
   */
  async initialize(configUrl = "/assets/data/config.json") {
    this.loadFromStorage();
    try {
      const response = await fetch(configUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Config load failed: ${response.status}`);
      }
      const config = await response.json();
      this.hydrateConfig(config);
    } catch (error) {
      console.warn("Не удалось загрузить конфигурацию", error);
    }
    this.initialized = true;
    this.state.ready = true;
    this.persist();
    this.dispatchEvent(new CustomEvent("ready", { detail: this.snapshot() }));
  }

  /**
   * Возвращает глубокую копию состояния для безопасного чтения.
   */
  snapshot() {
    return structuredClone(this.state);
  }

  /**
   * Сохраняет состояние в localStorage.
   */
  persist() {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.error("Persist error", error);
    }
  }

  /**
   * Загружает состояние из localStorage.
   */
  loadFromStorage() {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      this.state = { ...this.state, ...parsed };
    } catch (error) {
      console.error("Load state error", error);
    }
  }

  /**
   * Обновление состояния и уведомление подписчиков.
   */
  update(partial) {
    this.state = { ...this.state, ...partial };
    this.persist();
    this.dispatchEvent(new CustomEvent("change", { detail: this.snapshot() }));
  }

  /**
   * Обновляет вложенные ключи в состоянии.
   */
  patch(path, value) {
    const segments = path.split(".");
    let target = this.state;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      target[key] = { ...target[key] };
      target = target[key];
    }
    target[segments.at(-1)] = value;
    this.persist();
    this.dispatchEvent(new CustomEvent("change", { detail: this.snapshot() }));
  }

  /**
   * Обновление конфигурационных данных из файла.
   */
  hydrateConfig(config) {
    if (!config) {
      return;
    }
    if (config.user) {
      this.state.user = {
        ...this.state.user,
        ...config.user,
        name: config.user.name ?? this.state.user.name,
      };
      if (!this.state.settings.language) {
        this.state.settings.language = config.user.language ?? "ru";
      }
    }
    if (config.plans) {
      this.state.plans = structuredClone(config.plans);
    }
    if (this.state.settings.pin?.length !== 4) {
      this.state.settings.pin = "1234";
    }
  }

  /**
   * Добавляет экран в историю.
   */
  pushHistory(screen) {
    const last = this.state.history.at(-1);
    if (last === screen) {
      this.state.currentScreen = screen;
      return;
    }
    this.state.history = [...this.state.history, screen];
    this.state.currentScreen = screen;
    this.persist();
  }

  /**
   * Удаляет последний экран из истории.
   */
  popHistory() {
    if (this.state.history.length > 1) {
      this.state.history = this.state.history.slice(0, -1);
      this.state.currentScreen = this.state.history.at(-1);
      this.persist();
    }
    return this.state.currentScreen;
  }

  /**
   * Проверяет PIN и обновляет состояние попыток.
   */
  validatePin(pinValue) {
    const isValid = pinValue === this.state.settings.pin;
    if (isValid) {
      this.state.pinAttempts = 0;
      this.state.lastAuthAt = Date.now();
      this.persist();
    } else {
      this.state.pinAttempts += 1;
      this.persist();
    }
    return isValid;
  }

  /**
   * Сохраняет новый PIN.
   */
  setPin(pinValue) {
    if (typeof pinValue !== "string" || pinValue.length !== 4) {
      throw new Error("PIN должен содержать 4 цифры");
    }
    this.state.settings.pin = pinValue;
    this.persist();
    this.dispatchEvent(new CustomEvent("pin-change", { detail: pinValue }));
  }

  /**
   * Изменяет имя пользователя.
   */
  setName(name) {
    this.state.user.name = name.trim();
    this.persist();
    this.dispatchEvent(new CustomEvent("user-change", { detail: this.snapshot().user }));
    this.dispatchEvent(new CustomEvent("change", { detail: this.snapshot() }));
  }

  /**
   * Изменяет тему.
   */
  setTheme(theme) {
    this.patch("settings.theme", theme);
    this.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
  }

  /**
   * Изменяет язык.
   */
  setLanguage(language) {
    this.patch("settings.language", language);
    this.dispatchEvent(new CustomEvent("language-change", { detail: language }));
  }

  /**
   * Корректирует баланс и сохраняет.
   */
  adjustBalance(delta) {
    const newBalance = Math.max(0, Number(this.state.user.balance) + delta);
    this.state.user.balance = Math.round(newBalance * 100) / 100;
    this.persist();
    this.dispatchEvent(new CustomEvent("balance-change", { detail: this.state.user.balance }));
    this.dispatchEvent(new CustomEvent("change", { detail: this.snapshot() }));
  }
}
