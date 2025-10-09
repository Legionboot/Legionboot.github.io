/**
 * UI layer responsible for rendering screens, transitions and interactive effects.
 * Each screen is declaratively rebuilt from the current state to keep DOM logic minimal.
 */
export function initUI(store, actions) {
    const root = document.getElementById('app');
    if (!root) {
        throw new Error('Не удалось найти корневой элемент приложения.');
    }

    root.innerHTML = '';

    const safeArea = document.createElement('div');
    safeArea.className = 'app-safe-area';
    safeArea.innerHTML = `
        <div class="app-frame">
            <div class="screen-stack" data-screen-stack></div>
            <nav class="nav-bar" data-nav-bar>
                <span class="nav-indicator" data-nav-indicator></span>
            </nav>
        </div>
        <div class="toast-layer" data-toast-layer></div>
    `;

    root.appendChild(safeArea);

    const screenStack = safeArea.querySelector('[data-screen-stack]');
    const navBar = safeArea.querySelector('[data-nav-bar]');
    const navIndicator = safeArea.querySelector('[data-nav-indicator]');
    const toastLayer = safeArea.querySelector('[data-toast-layer]');

    const navConfig = [
        { route: 'home', label: 'Главная', icon: '🏠' },
        { route: 'tariffs', label: 'Трафик', icon: '📶' },
        { route: 'calls', label: 'Звонки', icon: '📞' },
        { route: 'settings', label: 'Настройки', icon: '⚙️' }
    ];

    navBar.append(...navConfig.map(item => createNavItem(item)));

    /**
     * Creates a navigation item element.
     */
    function createNavItem(item) {
        const button = document.createElement('button');
        button.className = 'nav-item';
        button.type = 'button';
        button.dataset.route = item.route;
        button.dataset.action = 'navigate';
        button.dataset.ripple = '';
        button.innerHTML = `
            <span class="nav-item__icon">${item.icon}</span>
            <span>${item.label}</span>
        `;
        return button;
    }

    /**
     * Applies ripple feedback under pointer.
     */
    function handleRipple(event) {
        const target = event.target.closest('[data-ripple]');
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const diameter = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = `${diameter}px`;
        ripple.style.left = `${event.clientX - rect.left - diameter / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - diameter / 2}px`;
        target.querySelectorAll('.ripple').forEach(node => node.remove());
        target.appendChild(ripple);
    }

    safeArea.addEventListener('pointerdown', event => {
        handleRipple(event);
        if (event.target.closest('[data-ripple]')) {
            actions.haptic('light');
        }
    });

    safeArea.addEventListener('click', event => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;

        const { action } = actionTarget.dataset;
        switch (action) {
            case 'start-login':
                actions.startLogin();
                break;
            case 'navigate':
                actions.navigate(actionTarget.dataset.route);
                break;
            case 'pin-digit':
                actions.appendPin(actionTarget.dataset.digit);
                break;
            case 'pin-backspace':
                actions.removePinDigit();
                break;
            case 'purchase-data':
                actions.purchaseData(Number(actionTarget.dataset.amount));
                break;
            case 'purchase-calls':
                actions.purchaseCalls(Number(actionTarget.dataset.amount));
                break;
            case 'logout':
                actions.logout();
                break;
            case 'theme-select':
                actions.setTheme(actionTarget.value);
                break;
            case 'language-select':
                actions.setLanguage(actionTarget.value);
                break;
            case 'update-name':
                actions.updateName(actionTarget.value);
                break;
            case 'update-balance':
                actions.updateBalance(Number(actionTarget.value));
                break;
            default:
                break;
        }
    }, true);

    safeArea.addEventListener('input', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;
        const { action } = actionTarget.dataset;
        if (action === 'theme-select') {
            actions.setTheme(actionTarget.value);
        }
        if (action === 'language-select') {
            actions.setLanguage(actionTarget.value);
        }
        if (action === 'update-name') {
            actions.updateName(actionTarget.value);
        }
        if (action === 'update-balance') {
            if (actionTarget.value === '') {
                return;
            }
            const numericValue = Number(actionTarget.value);
            if (!Number.isNaN(numericValue)) {
                actions.updateBalance(numericValue);
            }
        }
    });

    /**
     * Attaches swipe back gesture to a given screen element.
     */
    function attachSwipeBack(screenElement, route) {
        const supportsBack = ['tariffs', 'calls', 'settings'].includes(route);
        if (!supportsBack) return;

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startTime = 0;
        const edgeSize = 48;

        const onPointerDown = event => {
            if (pointerId !== null) return;
            if (event.clientX > edgeSize) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startTime = performance.now();
            screenElement.setPointerCapture(pointerId);
        };

        const onPointerMove = event => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const deltaX = event.clientX - startX;
            const deltaY = Math.abs(event.clientY - startY);
            if (deltaX > 60 && deltaY < 60) {
                releasePointer();
                actions.navigate('home');
            }
        };

        const onPointerUp = event => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const deltaX = event.clientX - startX;
            const deltaY = Math.abs(event.clientY - startY);
            const duration = performance.now() - startTime;
            if (deltaX > 60 && deltaY < 60 && duration < 450) {
                actions.navigate('home');
            }
            releasePointer();
        };

        const releasePointer = () => {
            if (pointerId === null) return;
            screenElement.releasePointerCapture(pointerId);
            pointerId = null;
        };

        screenElement.addEventListener('pointerdown', onPointerDown);
        screenElement.addEventListener('pointermove', onPointerMove);
        screenElement.addEventListener('pointerup', onPointerUp);
        screenElement.addEventListener('pointercancel', releasePointer);
    }

    let activeScreen = null;

    /**
     * Performs a full screen re-render based on the current state.
     */
    function render(state) {
        const route = state.session.route;
        const screenFactory = screenRegistry[route] ?? screenRegistry['splash'];
        const nextScreen = screenFactory(state);
        nextScreen.dataset.route = route;

        if (activeScreen && activeScreen.dataset.route === route) {
            screenStack.replaceChild(nextScreen, activeScreen);
            activeScreen = nextScreen;
            requestAnimationFrame(() => nextScreen.classList.add('active'));
        } else {
            if (activeScreen) {
                activeScreen.classList.remove('active');
                activeScreen.classList.add('leaving');
                activeScreen.addEventListener('animationend', () => activeScreen?.remove(), { once: true });
            }
            screenStack.appendChild(nextScreen);
            requestAnimationFrame(() => nextScreen.classList.add('active'));
            activeScreen = nextScreen;
        }

        attachSwipeBack(nextScreen, route);
        updateNav(state);
    }

    /**
     * Updates navigation highlighting and indicator placement.
     */
    function updateNav(state) {
        const availableRoutes = ['home', 'tariffs', 'calls', 'settings'];
        const shouldShowNav = availableRoutes.includes(state.session.route) && state.session.authenticated;
        navBar.style.display = shouldShowNav ? 'flex' : 'none';
        if (!shouldShowNav) return;

        const activeRoute = state.session.route;
        const navItems = [...navBar.querySelectorAll('.nav-item')];
        navItems.forEach(item => {
            const isActive = item.dataset.route === activeRoute;
            item.classList.toggle('active', isActive);
            item.disabled = item.dataset.route === activeRoute;
        });

        const activeItem = navItems.find(item => item.dataset.route === activeRoute);
        if (activeItem) {
            const offset = activeItem.offsetLeft + activeItem.offsetWidth / 2 - navIndicator.offsetWidth / 2;
            navIndicator.style.transform = `translateX(${offset}px)`;
        }
    }

    /**
     * Renders toast notifications based on UI state.
     */
    function updateToasts(toasts) {
        toastLayer.innerHTML = '';
        toasts.forEach(toast => {
            const element = document.createElement('div');
            element.className = 'toast';
            element.dataset.type = toast.type;
            element.dataset.id = toast.id;
            element.innerHTML = `
                <strong>${toast.title}</strong>
                <span>${toast.message}</span>
            `;
            toastLayer.appendChild(element);
        });
    }

    /**
     * Screen component registry.
     */
    const screenRegistry = {
        splash: state => {
            const screen = createScreen('splash');
            const buttonLabel = state.session.pinExists ? 'Войти в аккаунт' : 'Создать PIN';
            screen.innerHTML = `
                <div class="hero">
                    <div class="hero-logo">B</div>
                    <div>
                        <h1 class="hero-title">BBank</h1>
                        <p class="hero-subtitle">Банк и связь, которые ощущаются как флагманский смартфон.</p>
                    </div>
                    <button class="button" data-action="start-login" data-ripple ${state.session.loginAvailable ? '' : 'disabled'}>
                        ${state.session.loginAvailable ? buttonLabel : 'Готовим интерфейс...'}
                    </button>
                    <p class="swipe-hint">Вдохните глубже — новый опыт финансов начинается здесь.</p>
                </div>
            `;
            return screen;
        },
        pin: state => {
            const screen = createScreen('pin');
            const dots = Array.from({ length: 4 }, (_, index) => `<span class="${index < state.session.pinInput.length ? 'filled' : ''}"></span>`).join('');
            const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'];
            screen.innerHTML = `
                <div class="hero" style="gap: 20px;">
                    <div>
                        <h1 class="hero-title">${state.user.pin ? 'Введите PIN' : 'Создайте PIN'}</h1>
                        <p class="hero-subtitle">${state.user.pin ? 'Для защиты ваших данных' : 'Придумайте четырёхзначный код'}</p>
                    </div>
                    <div class="pin-dots">${dots}</div>
                    <div class="keypad">
                        ${digits.map(digit => {
                            if (digit === '') {
                                return '<span></span>';
                            }
                            if (digit === '⌫') {
                                return '<button type="button" data-action="pin-backspace" data-ripple>⌫</button>';
                            }
                            return `<button type="button" data-action="pin-digit" data-digit="${digit}" data-ripple>${digit}</button>`;
                        }).join('')}
                    </div>
                    ${state.session.loading ? '<p class="section-subtitle">Проверяем код...</p>' : ''}
                </div>
            `;
            return screen;
        },
        home: state => {
            const screen = createScreen('home');
            const { usage, user } = state;
            const progress = Math.min(usage.dataUsed / usage.dataTotal, 1);
            const formattedBalance = formatCurrency(user.balance, user.currency);
            screen.innerHTML = `
                <header class="header">
                    <div class="header-info">
                        <p>Добро пожаловать</p>
                        <h1>${user.name}</h1>
                    </div>
                    <div class="avatar">${user.name.charAt(0) || 'B'}</div>
                </header>
                <section class="balance-card">
                    <span class="balance-meta">Ваш баланс</span>
                    <strong class="balance-amount">${formattedBalance}</strong>
                    <div class="balance-progress" data-progress="${progress}">
                        ${createProgressRing(progress, 96, `${usage.dataUsed.toFixed(1)} ГБ`, `из ${usage.dataTotal.toFixed(1)} ГБ`)}
                    </div>
                </section>
                <section class="widget-grid">
                    <article class="widget-card" data-action="navigate" data-route="tariffs" data-ripple>
                        <div class="widget-card__icon">📡</div>
                        <div class="widget-card__content">
                            <h2 class="widget-card__title">Интернет</h2>
                            <p class="widget-card__subtitle">${usage.dataUsed.toFixed(1)} ГБ из ${usage.dataTotal.toFixed(1)} ГБ</p>
                        </div>
                        <span class="widget-card__meta">Подробнее</span>
                    </article>
                    <article class="widget-card" data-action="navigate" data-route="calls" data-ripple>
                        <div class="widget-card__icon">📞</div>
                        <div class="widget-card__content">
                            <h2 class="widget-card__title">Звонки</h2>
                            <p class="widget-card__subtitle">${usage.callsLeft > 0 ? `${usage.callsLeft} минут` : 'Нет пакета'}</p>
                        </div>
                        <span class="widget-card__meta">Продлить</span>
                    </article>
                </section>
            `;
            return screen;
        },
        tariffs: state => {
            const screen = createScreen('tariffs');
            const { usage } = state;
            const progress = Math.min(usage.dataUsed / usage.dataTotal, 1);
            screen.innerHTML = `
                <div class="toolbar">
                    <button class="back-button" data-action="navigate" data-route="home" data-ripple>←</button>
                    <div>
                        <h1 class="section-heading">Интернет</h1>
                        <p class="section-subtitle">Тариф «${usage.planName}»</p>
                    </div>
                </div>
                <div class="balance-progress" data-progress="${progress}">
                    ${createProgressRing(progress, 120, `${Math.round(progress * 100)}%`, `${usage.dataUsed.toFixed(1)} из ${usage.dataTotal.toFixed(1)} ГБ`)}
                </div>
                <section class="widget-grid">
                    <p class="section-subtitle" style="text-align:center;">${usage.dataUsed.toFixed(1)} ГБ из ${usage.dataTotal.toFixed(1)} ГБ использовано</p>
                    <button class="button" data-action="purchase-data" data-amount="5" data-ripple>Купить +5 ГБ</button>
                    <button class="button button-secondary" data-action="purchase-data" data-amount="1" data-ripple>Купить +1 ГБ</button>
                </section>
            `;
            return screen;
        },
        calls: state => {
            const screen = createScreen('calls');
            const { usage } = state;
            screen.innerHTML = `
                <div class="toolbar">
                    <button class="back-button" data-action="navigate" data-route="home" data-ripple>←</button>
                    <div>
                        <h1 class="section-heading">Звонки</h1>
                        <p class="section-subtitle">Тариф «${usage.planName}»</p>
                    </div>
                </div>
                <div class="hero" style="gap: 18px; padding-top: 24px;">
                    <h2 class="hero-title" style="font-size: 32px;">${usage.callsLeft > 0 ? `${usage.callsLeft} минут` : 'Пакет израсходован'}</h2>
                    <p class="hero-subtitle" style="max-width:320px;">Подключите дополнительный пакет, чтобы оставаться на связи без границ.</p>
                    <div class="widget-grid" style="width:100%;">
                        <button class="button" data-action="purchase-calls" data-amount="100" data-ripple>Купить 100 минут</button>
                        <button class="button button-secondary" data-action="purchase-calls" data-amount="50" data-ripple>Купить 50 минут</button>
                    </div>
                </div>
            `;
            return screen;
        },
        settings: state => {
            const screen = createScreen('settings');
            const { user, settings } = state;
            screen.innerHTML = `
                <div class="toolbar">
                    <button class="back-button" data-action="navigate" data-route="home" data-ripple>←</button>
                    <div>
                        <h1 class="section-heading">Настройки</h1>
                        <p class="section-subtitle">Персонализируйте свой опыт</p>
                    </div>
                </div>
                <div class="settings-list">
                    <label class="settings-item">
                        Имя
                        <input type="text" value="${user.name}" placeholder="Ваше имя" data-action="update-name" />
                    </label>
                    <label class="settings-item">
                        Баланс
                        <input type="number" min="0" step="100" value="${Math.round(user.balance)}" data-action="update-balance" />
                    </label>
                    <label class="settings-item">
                        Тема
                        <select data-action="theme-select">
                            ${createOption('system', 'Системная', settings.theme)}
                            ${createOption('light', 'Светлая', settings.theme)}
                            ${createOption('dark', 'Тёмная', settings.theme)}
                        </select>
                    </label>
                    <label class="settings-item">
                        Язык
                        <select data-action="language-select">
                            ${createOption('ru', 'Русский', settings.language)}
                            ${createOption('en', 'English', settings.language)}
                        </select>
                    </label>
                </div>
                <button class="button button-secondary" data-action="logout" data-ripple>Завершить сеанс</button>
            `;
            return screen;
        }
    };

    /**
     * Utility to create an option element string with selected attribute.
     */
    function createOption(value, label, current) {
        return `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`;
    }

    /**
     * Creates a screen element container.
     */
    function createScreen(route) {
        const element = document.createElement('section');
        element.className = 'screen';
        element.dataset.route = route;
        return element;
    }

    store.subscribe((state) => {
        render(state);
        updateToasts(state.ui.toasts);
    });

    render(store.getState());
    updateToasts(store.getState().ui.toasts);
}

/**
 * Builds a circular progress indicator as an SVG snippet.
 */
function createProgressRing(progress, radius = 96, label = '', caption = '') {
    const clamped = Math.max(0, Math.min(1, progress));
    const normalizedRadius = radius - 10;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - clamped * circumference;
    const gradientId = `progressGradient-${Math.random().toString(36).slice(2, 8)}`;
    return `
        <svg viewBox="0 0 ${radius * 2} ${radius * 2}">
            <defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0a84ff" />
                    <stop offset="100%" stop-color="#a955f7" />
                </linearGradient>
            </defs>
            <circle class="progress-ring__bg" stroke-width="16" r="${normalizedRadius}" cx="${radius}" cy="${radius}"></circle>
            <circle class="progress-ring__circle" stroke="url(#${gradientId})" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${strokeDashoffset}" r="${normalizedRadius}" cx="${radius}" cy="${radius}"></circle>
        </svg>
        <div class="progress-content">
            <span class="progress-value">${label || `${Math.round(clamped * 100)}%`}</span>
            ${caption ? `<span class="progress-caption">${caption}</span>` : ''}
        </div>
    `;
}

/**
 * Formats currency with locales.
 */
function formatCurrency(value, currency) {
    try {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0
        }).format(value);
    } catch (error) {
        return `${value.toFixed(0)} ${currency}`;
    }
}
