import { initUI } from './ui.js';

const STORAGE_KEY = 'bbank-state-v1';
const TOAST_DURATION = 4000;

/**
 * Initial application state before hydration.
 */
const defaultState = {
    session: {
        route: 'splash',
        loginAvailable: false,
        loading: false,
        authenticated: false,
        pinInput: '',
        pinExists: false
    },
    user: {
        name: 'Алексей',
        balance: 267345,
        currency: 'RUB',
        pin: null
    },
    usage: {
        dataUsed: 21.3,
        dataTotal: 30,
        callsLeft: 0,
        planName: 'Вместе Дешевле 1.1'
    },
    settings: {
        theme: 'system',
        language: 'ru',
        haptics: true
    },
    ui: {
        toasts: []
    }
};

/**
 * Creates the state store with subscribe/dispatch semantics.
 */
function createStore(initialState) {
    let state = initialState;
    const listeners = new Set();
    return {
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispatch(action) {
            state = reducer(state, action);
            listeners.forEach(listener => listener(state, action));
        }
    };
}

/**
 * State reducer handling immutable updates.
 */
function reducer(state, action) {
    switch (action.type) {
        case 'HYDRATE':
            return {
                ...state,
                ...action.payload,
                session: {
                    ...state.session,
                    pinExists: Boolean(action.payload?.user?.pin)
                }
            };
        case 'SESSION_LOGIN_AVAILABLE':
            return {
                ...state,
                session: { ...state.session, loginAvailable: true }
            };
        case 'NAVIGATE':
            return {
                ...state,
                session: { ...state.session, route: action.payload, pinInput: '', loading: false }
            };
        case 'PIN_INPUT_SET':
            return {
                ...state,
                session: { ...state.session, pinInput: action.payload }
            };
        case 'AUTH_START':
            return {
                ...state,
                session: { ...state.session, loading: true }
            };
        case 'AUTH_SUCCESS':
            return {
                ...state,
                session: {
                    ...state.session,
                    loading: false,
                    authenticated: true,
                    route: 'home',
                    pinInput: '',
                    pinExists: true
                }
            };
        case 'AUTH_FAILURE':
            return {
                ...state,
                session: { ...state.session, loading: false, pinInput: '' }
            };
        case 'SET_PIN':
            return {
                ...state,
                user: { ...state.user, pin: action.payload }
            };
        case 'LOGOUT':
            return {
                ...state,
                session: {
                    ...state.session,
                    authenticated: false,
                    route: 'pin',
                    pinInput: '',
                    loading: false
                }
            };
        case 'SET_USER_NAME':
            return {
                ...state,
                user: { ...state.user, name: action.payload }
            };
        case 'SET_BALANCE':
            return {
                ...state,
                user: { ...state.user, balance: action.payload }
            };
        case 'SET_THEME':
            return {
                ...state,
                settings: { ...state.settings, theme: action.payload }
            };
        case 'SET_LANGUAGE':
            return {
                ...state,
                settings: { ...state.settings, language: action.payload }
            };
        case 'SET_USAGE':
            return {
                ...state,
                usage: { ...state.usage, ...action.payload }
            };
        case 'SET_HAPTICS':
            return {
                ...state,
                settings: { ...state.settings, haptics: action.payload }
            };
        case 'ENQUEUE_TOAST':
            return {
                ...state,
                ui: { ...state.ui, toasts: [...state.ui.toasts, action.payload] }
            };
        case 'DISMISS_TOAST':
            return {
                ...state,
                ui: { ...state.ui, toasts: state.ui.toasts.filter(toast => toast.id !== action.payload) }
            };
        default:
            return state;
    }
}

/**
 * Loads persisted state from localStorage.
 */
function loadPersistedState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Не удалось загрузить состояние из localStorage', error);
        return null;
    }
}

/**
 * Persists a subset of the state for future sessions.
 */
function persistState(state) {
    try {
        const payload = {
            user: { ...state.user },
            usage: { ...state.usage },
            settings: { ...state.settings }
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Не удалось сохранить состояние', error);
    }
}

/**
 * Creates a toast notification descriptor.
 */
function createToast(type, title, message) {
    return {
        id: crypto.randomUUID?.() ?? `toast-${Date.now()}`,
        type,
        title,
        message
    };
}

/**
 * Applies theme to the document element.
 */
function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
}

/**
 * Initializes application logic.
 */
function bootstrap() {
    const persisted = loadPersistedState();
    const hydratedState = persisted ? reducer(defaultState, { type: 'HYDRATE', payload: persisted }) : defaultState;
    const store = createStore(hydratedState);

    const debouncedPersist = debounce(() => persistState(store.getState()), 400);
    store.subscribe((state, action) => {
        if (!['ENQUEUE_TOAST', 'DISMISS_TOAST'].includes(action?.type)) {
            debouncedPersist();
        }
        if (action?.type === 'SET_THEME' || action?.type === 'HYDRATE') {
            applyTheme(state.settings.theme);
        }
    });

    applyTheme(store.getState().settings.theme);

    const actions = createActions(store);
    initUI(store, actions);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const { settings } = store.getState();
        if (settings.theme === 'system') {
            applyTheme('system');
        }
    });

    setTimeout(() => store.dispatch({ type: 'SESSION_LOGIN_AVAILABLE' }), 1600);

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.warn('Service worker registration failed', error);
            });
        });
    }

    return store;
}

/**
 * Creates action handlers that encapsulate side-effects.
 */
function createActions(store) {
    return {
        startLogin() {
            store.dispatch({ type: 'NAVIGATE', payload: 'pin' });
        },
        navigate(route) {
            const { session } = store.getState();
            if (!session.authenticated && !['splash', 'pin'].includes(route)) {
                return;
            }
            store.dispatch({ type: 'NAVIGATE', payload: route });
        },
        appendPin(digit) {
            const state = store.getState();
            if (state.session.loading) return;
            if (state.session.pinInput.length >= 4) return;
            const nextValue = `${state.session.pinInput}${digit}`;
            store.dispatch({ type: 'PIN_INPUT_SET', payload: nextValue });
            if (nextValue.length === 4) {
                verifyPin(store, nextValue);
            }
        },
        removePinDigit() {
            const { session } = store.getState();
            if (session.loading) return;
            const nextValue = session.pinInput.slice(0, -1);
            store.dispatch({ type: 'PIN_INPUT_SET', payload: nextValue });
        },
        purchaseData(amount) {
            const { usage } = store.getState();
            store.dispatch({
                type: 'SET_USAGE',
                payload: { dataTotal: usage.dataTotal + amount }
            });
            emitToast(store, 'success', 'Трафик обновлён', `+${amount} ГБ добавлено к вашему тарифу.`);
        },
        purchaseCalls(amount) {
            const { usage } = store.getState();
            store.dispatch({
                type: 'SET_USAGE',
                payload: { callsLeft: usage.callsLeft + amount }
            });
            emitToast(store, 'success', 'Минуты активированы', `+${amount} минут теперь доступны.`);
        },
        logout() {
            store.dispatch({ type: 'LOGOUT' });
            emitToast(store, 'success', 'Сеанс завершён', 'Для входа снова введите PIN.');
        },
        setTheme(theme) {
            const { settings } = store.getState();
            if (settings.theme === theme) return;
            store.dispatch({ type: 'SET_THEME', payload: theme });
            applyTheme(theme);
            emitToast(store, 'success', 'Тема обновлена', 'Интерфейс адаптирован под ваши предпочтения.');
        },
        setLanguage(language) {
            const { settings } = store.getState();
            if (settings.language === language) return;
            store.dispatch({ type: 'SET_LANGUAGE', payload: language });
            emitToast(store, 'success', 'Язык обновлён', 'Переводы скоро появятся.');
        },
        updateName(name) {
            store.dispatch({ type: 'SET_USER_NAME', payload: name });
        },
        updateBalance(balance) {
            const safeBalance = Number.isFinite(balance) ? balance : 0;
            store.dispatch({ type: 'SET_BALANCE', payload: safeBalance });
        },
        haptic(intensity = 'light') {
            const { settings } = store.getState();
            if (!settings.haptics) return;
            if ('vibrate' in navigator) {
                if (intensity === 'heavy') {
                    navigator.vibrate?.(30);
                } else {
                    navigator.vibrate?.(15);
                }
            }
        }
    };
}

/**
 * Verifies the PIN and drives authentication flow with subtle delays.
 */
function verifyPin(store, pinValue) {
    const { user } = store.getState();
    store.dispatch({ type: 'AUTH_START' });
    setTimeout(() => {
        if (!user.pin) {
            store.dispatch({ type: 'SET_PIN', payload: pinValue });
            store.dispatch({ type: 'AUTH_SUCCESS' });
            emitToast(store, 'success', 'PIN создан', 'Теперь используйте этот код для входа.');
            persistState(store.getState());
            return;
        }
        if (user.pin === pinValue) {
            store.dispatch({ type: 'AUTH_SUCCESS' });
            emitToast(store, 'success', 'Добро пожаловать', 'Вы успешно вошли в аккаунт.');
        } else {
            store.dispatch({ type: 'AUTH_FAILURE' });
            emitToast(store, 'error', 'Неверный PIN', 'Попробуйте снова, мы сбросили ввод.');
        }
    }, 520);
}

/**
 * Emits a toast and schedules its dismissal.
 */
function emitToast(store, type, title, message) {
    const toast = createToast(type, title, message);
    store.dispatch({ type: 'ENQUEUE_TOAST', payload: toast });
    setTimeout(() => {
        store.dispatch({ type: 'DISMISS_TOAST', payload: toast.id });
    }, TOAST_DURATION);
}

/**
 * Utility debounce implementation for persisting state.
 */
function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

bootstrap();
