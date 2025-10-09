/**
 * StateManager handles persistence, hydration and mutation of the application state.
 * It exposes a reactive-style API to be consumed by UIManager and app logic.
 */
export class StateManager {
  constructor(storageKey = "bbank-app-state") {
    this.storageKey = storageKey;
    this.state = {
      user: {
        name: "",
        pin: "",
        language: "ru"
      },
      theme: "auto",
      balance: {
        amount: 0,
        currency: "₽"
      },
      allowances: {
        data: { used: 0, total: 0 },
        calls: { used: 0, total: 0 }
      },
      tariffs: [],
      history: [],
      onboardingComplete: false,
      lastLogin: null
    };
    this.listeners = new Map();
  }

  /**
   * Initialise the state from config and localStorage.
   * @param {object} remoteConfig - JSON config fetched from assets/data/config.json.
   */
  initialise(remoteConfig) {
    const persisted = this.#readFromStorage();
    const merged = this.#deepMerge(this.state, remoteConfig || {});
    this.state = this.#deepMerge(merged, persisted || {});
    this.persist();
    this.emit("init", this.state);
    return this.state;
  }

  /**
   * Subscribe to state changes.
   * @param {string} key
   * @param {(state: object) => void} callback
   */
  on(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
  }

  /**
   * Remove listener subscription.
   */
  off(key, callback) {
    if (!this.listeners.has(key)) return;
    this.listeners.get(key).delete(callback);
  }

  /**
   * Persist the state to localStorage.
   */
  persist() {
    try {
      const payload = JSON.stringify(this.state);
      window.localStorage.setItem(this.storageKey, payload);
    } catch (error) {
      console.error("State persistence failed", error);
    }
  }

  /**
   * Update state by key path and emit change events.
   * @param {string} path - dot.notation path
   * @param {any} value
   */
  update(path, value) {
    const segments = path.split(".");
    let cursor = this.state;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      cursor[key] = cursor[key] ?? {};
      cursor = cursor[key];
    }
    cursor[segments.at(-1)] = value;
    this.persist();
    this.emit(path, this.state);
    return this.state;
  }

  /**
   * Append to history stack.
   */
  pushHistory(screenId) {
    const history = [...this.state.history, screenId];
    this.state.history = history.slice(-20);
    this.persist();
    this.emit("history", this.state);
  }

  /**
   * Pop the latest screen from history.
   */
  popHistory() {
    const history = [...this.state.history];
    history.pop();
    this.state.history = history;
    this.persist();
    this.emit("history", this.state);
    return history.at(-1) ?? null;
  }

  /**
   * Adjust balance amount and persist.
   */
  adjustBalance(delta) {
    const next = Math.max(0, Number(this.state.balance.amount) - Number(delta));
    this.state.balance.amount = Number(next.toFixed(2));
    this.persist();
    this.emit("balance", this.state);
    return this.state.balance.amount;
  }

  /**
   * Update allowance usage for a resource (data or calls).
   */
  updateAllowance(type, usedDelta) {
    const allowance = this.state.allowances[type];
    if (!allowance) return;
    allowance.used = Math.max(0, allowance.used - usedDelta);
    this.persist();
    this.emit("allowances", this.state);
  }

  /**
   * Utility to emit change events.
   */
  emit(key, payload) {
    if (!this.listeners.has(key)) return;
    this.listeners.get(key).forEach((cb) => cb(payload));
  }

  /**
   * Try to read state snapshot from storage.
   */
  #readFromStorage() {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Unable to parse stored state", error);
      return null;
    }
  }

  /**
   * Deep merge helper for plain objects.
   */
  #deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    const output = Array.isArray(target) ? [...target] : { ...target };
    Object.keys(source).forEach((key) => {
      const srcValue = source[key];
      if (srcValue && typeof srcValue === "object" && !Array.isArray(srcValue)) {
        output[key] = this.#deepMerge(output[key] || {}, srcValue);
      } else {
        output[key] = srcValue;
      }
    });
    return output;
  }
}

export const AppState = new StateManager("bbank-app-state-v2");
