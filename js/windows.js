// Менеджер окон: создание, фокусировка, закрытие, сохранение состояния.
// Можно расширить — добавить управление через WebSocket, чтобы синхронизировать окна между устройствами.

import { attachWindowGestures } from './gestures.js';
import { animateWindowOpen, animateWindowFocus, animateWindowClose, animateWindowMinimize, animateWindowRestore } from './animations.js';

const WINDOWS_STATE_KEY = 'local_messenger_windows_layout_v1';
const windowsMap = new Map();
let zCounter = 200;

function getLayer() {
  const layer = document.getElementById('windowLayer');
  if (!layer) {
    throw new Error('Не найден слой окон (#windowLayer). Убедитесь, что index.html содержит нужный контейнер.');
  }
  return layer;
}

function loadState() {
  try {
    const raw = localStorage.getItem(WINDOWS_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Не удалось прочитать состояние окон', error);
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(WINDOWS_STATE_KEY, JSON.stringify(state));
}

function persistWindow(windowEl) {
  const state = loadState();
  state[windowEl.id] = {
    x: parseFloat(windowEl.dataset.x) || 0,
    y: parseFloat(windowEl.dataset.y) || 0,
    width: windowEl.offsetWidth,
    height: windowEl.offsetHeight,
    slot: windowEl.dataset.slot || null,
    state: windowEl.dataset.state || 'normal',
    scale: parseFloat(windowEl.dataset.scale) || 1,
  };
  saveState(state);
}

function removePersisted(id) {
  const state = loadState();
  delete state[id];
  saveState(state);
}

function snapToGrid(windowEl) {
  const viewportWidth = window.innerWidth;
  if (viewportWidth < 900 || windowEl.dataset.type === 'modal') {
    windowEl.dataset.slot = '';
    return;
  }
  const rect = windowEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const segment = viewportWidth / 3;
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 16;
  const currentY = parseFloat(windowEl.dataset.y) || 120;
  if (centerX < segment) {
    windowEl.dataset.slot = 'left';
    windowEl.style.width = '320px';
    updatePosition(windowEl, gap, currentY);
  } else if (centerX > segment * 2) {
    windowEl.dataset.slot = 'right';
    windowEl.style.width = '320px';
    const x = viewportWidth - 320 - gap;
    updatePosition(windowEl, x, currentY);
  } else {
    windowEl.dataset.slot = 'center';
    const reserved = 320 * 2 + gap * 2;
    const width = Math.max(420, viewportWidth - reserved);
    windowEl.style.width = `${width}px`;
    const x = (viewportWidth - width) / 2;
    updatePosition(windowEl, x, currentY);
  }
  windowEl.dataset.snapped = 'true';
}

function updatePosition(windowEl, x, y) {
  const scale = parseFloat(windowEl.dataset.scale) || 1;
  windowEl.dataset.x = String(x);
  windowEl.dataset.y = String(y);
  windowEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

function applyState(windowEl, state) {
  if (!state) return;
  let finalX = parseFloat(windowEl.dataset.x) || 0;
  let finalY = parseFloat(windowEl.dataset.y) || 0;
  if (typeof state.x === 'number' && typeof state.y === 'number') {
    finalX = state.x;
    finalY = state.y;
  }
  if (state.width) {
    windowEl.style.width = `${state.width}px`;
  }
  if (state.height) {
    windowEl.style.height = `${state.height}px`;
  }
  if (state.slot) {
    windowEl.dataset.slot = state.slot;
    windowEl.dataset.snapped = 'true';
  }
  if (state.state) {
    windowEl.dataset.state = state.state;
  }
  if (state.scale) {
    windowEl.dataset.scale = state.scale;
  }
  updatePosition(windowEl, finalX, finalY);
}

function buildWindowElement({ id, title, content, contentHtml, slot, x = 120, y = 140, w = 360, h = 420, modal = false }) {
  const windowEl = document.createElement('section');
  windowEl.className = 'window fade-in';
  windowEl.id = id;
  windowEl.setAttribute('role', modal ? 'dialog' : 'region');
  windowEl.setAttribute('aria-label', title);
  windowEl.dataset.type = modal ? 'modal' : 'window';
  windowEl.dataset.state = 'normal';
  windowEl.dataset.scale = '1';
  if (slot) {
    windowEl.dataset.slot = slot;
  }
  windowEl.style.width = `${w}px`;
  windowEl.style.height = `${h}px`;
  updatePosition(windowEl, x, y);

  windowEl.innerHTML = `
    <header class="window__titlebar" data-drag-handle>
      <span class="window__title">${title}</span>
      <div class="window__controls">
        <button class="window__btn" data-action="minimize" aria-label="Свернуть">—</button>
        <button class="window__btn" data-action="snap" aria-label="Прикрепить к сетке">▢</button>
        <button class="window__btn" data-action="close" aria-label="Закрыть">×</button>
      </div>
    </header>
    <div class="window__body">
      <div class="window__content" data-window-content></div>
      <div class="window__resize-handle" data-resize-handle></div>
    </div>
  `;

  const contentTarget = windowEl.querySelector('[data-window-content]');
  if (content instanceof HTMLElement) {
    contentTarget.append(content);
  } else if (typeof contentHtml === 'string') {
    contentTarget.innerHTML = contentHtml;
  }

  return windowEl;
}

function handleControlClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const windowEl = event.currentTarget.closest('.window');
  if (!windowEl) return;
  const action = button.dataset.action;
  if (action === 'close') {
    closeWindow(windowEl.id);
  } else if (action === 'minimize') {
    if (windowEl.dataset.state === 'minimized') {
      windowEl.dataset.state = 'normal';
      animateWindowRestore(windowEl);
    } else {
      windowEl.dataset.state = 'minimized';
      animateWindowMinimize(windowEl);
    }
    persistWindow(windowEl);
  } else if (action === 'snap') {
    snapToGrid(windowEl);
    persistWindow(windowEl);
  }
}

export function createWindow(options) {
  const existing = windowsMap.get(options.id);
  if (existing) {
    focusWindow(options.id);
    return existing;
  }
  const layer = getLayer();
  const state = loadState()[options.id];
  const windowEl = buildWindowElement(options);
  if (state) {
    applyState(windowEl, state);
  }
  layer.append(windowEl);
  windowsMap.set(options.id, windowEl);
  focusWindow(options.id);
  animateWindowOpen(windowEl);

  windowEl.querySelector('.window__titlebar').addEventListener('pointerdown', () => focusWindow(windowEl.id));
  windowEl.addEventListener('pointerdown', () => focusWindow(windowEl.id));
  windowEl.addEventListener('click', handleControlClick);

  let pinchActive = false;
  let pinchBaseScale = parseFloat(windowEl.dataset.scale) || 1;
  attachWindowGestures(windowEl, {
    onDrag: ({ x, y }) => {
      delete windowEl.dataset.snapped;
      updatePosition(windowEl, x, y);
    },
    onDragEnd: () => {
      snapToGrid(windowEl);
      persistWindow(windowEl);
    },
    onResize: ({ width, height }) => {
      windowEl.style.width = `${width}px`;
      windowEl.style.height = `${height}px`;
    },
    onResizeEnd: () => {
      persistWindow(windowEl);
    },
    onPinch: ({ scale }) => {
      if (!pinchActive) {
        pinchActive = true;
        pinchBaseScale = parseFloat(windowEl.dataset.scale) || 1;
      }
      const clamped = Math.min(1.6, Math.max(0.7, pinchBaseScale * scale));
      windowEl.dataset.scale = String(clamped);
      updatePosition(windowEl, parseFloat(windowEl.dataset.x) || 0, parseFloat(windowEl.dataset.y) || 0);
    },
    onPinchEnd: () => {
      pinchActive = false;
      updatePosition(windowEl, parseFloat(windowEl.dataset.x) || 0, parseFloat(windowEl.dataset.y) || 0);
      persistWindow(windowEl);
    },
    onLongPress: () => {
      windowEl.dataset.state = windowEl.dataset.state === 'minimized' ? 'normal' : 'minimized';
      if (windowEl.dataset.state === 'minimized') {
        animateWindowMinimize(windowEl);
      } else {
        animateWindowRestore(windowEl);
      }
      persistWindow(windowEl);
    },
    onThreeFingerSwipe: (direction) => {
      window.dispatchEvent(new CustomEvent('window:swipe', { detail: { id: windowEl.id, direction } }));
    },
  });

  persistWindow(windowEl);

  if (typeof options.onMount === 'function') {
    options.onMount(windowEl);
  }

  return windowEl;
}

export function focusWindow(id) {
  const windowEl = windowsMap.get(id);
  if (!windowEl) return;
  windowsMap.forEach((win) => {
    if (win === windowEl) {
      win.dataset.focused = 'true';
      win.style.zIndex = ++zCounter;
    } else {
      win.dataset.focused = 'false';
    }
  });
  animateWindowFocus(windowEl);
}

export function closeWindow(id) {
  const windowEl = windowsMap.get(id);
  if (!windowEl) return;
  animateWindowClose(windowEl, () => {
    windowEl.remove();
    windowsMap.delete(id);
    removePersisted(id);
  });
}

export function setWindowSize(id, width, height) {
  const windowEl = windowsMap.get(id);
  if (!windowEl) return;
  windowEl.style.width = `${width}px`;
  windowEl.style.height = `${height}px`;
  persistWindow(windowEl);
}

export function persistState() {
  windowsMap.forEach((windowEl) => persistWindow(windowEl));
}

export function listWindows() {
  return Array.from(windowsMap.values());
}

// Возможное расширение: добавить док-панель для минимизированных окон.
