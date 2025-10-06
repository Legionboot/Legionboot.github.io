// Менеджер плавающих окон. Управляет созданием, фокусом, закрытием и сохранением состояния.
// Использует gestures.js для перетаскивания и жестов pinch/rotate.

import { attachGestures } from './gestures.js';
import { db } from './db.js';

const windowsLayer = document.getElementById('windowsLayer');
const windowRegistry = new Map();
let zCounter = 100;

const gridSize = 24;

export const windowManager = {
  createWindow,
  focusWindow,
  closeWindow,
  setWindowSize,
  getWindow,
};

function createWindow({ id, title, contentHtml, x = 160, y = 120, w = 360, h = 240, modal = false }) {
  if (windowRegistry.has(id)) {
    return windowRegistry.get(id);
  }
  const win = document.createElement('section');
  win.className = 'floating-window';
  win.dataset.id = id;
  win.tabIndex = 0;
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', title);
  win.dataset.theme = document.documentElement.dataset.theme;
  if (modal) {
    win.setAttribute('aria-modal', 'true');
  }
  const header = document.createElement('header');
  header.className = 'window-header';
  header.innerHTML = `
    <span class="window-title">${title}</span>
    <div class="window-controls">
      <button class="window-button" data-action="minimize" aria-label="Свернуть">–</button>
      <button class="window-button" data-action="maximize" aria-label="Развернуть">⬜</button>
      <button class="window-button" data-action="close" aria-label="Закрыть">×</button>
    </div>
  `;
  const content = document.createElement('div');
  content.className = 'window-content';
  content.innerHTML = contentHtml;
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  content.appendChild(resizeHandle);
  win.append(header, content);
  win.dataset.title = title;
  win.dataset.contentHtml = contentHtml;
  win.dataset.headerDragging = 'false';
  windowsLayer.appendChild(win);
  windowRegistry.set(id, win);

  const stored = db.getWindowState(id) || {};
  const rect = {
    x,
    y,
    w,
    h,
    rotation: 0,
    ...stored,
  };
  applyRect(win, rect);
  focusWindow(id);

  header.addEventListener(
    'pointerdown',
    (event) => {
      startDrag(event, win, rect);
    },
    { passive: false },
  );
  resizeHandle.addEventListener('pointerdown', (event) => startResize(event, win, rect), { passive: false });

  header.addEventListener('dblclick', () => toggleMaximize(win, rect));
  header.querySelector('[data-action="close"]').addEventListener('click', () => closeWindow(id));
  header.querySelector('[data-action="minimize"]').addEventListener('click', () => minimizeWindow(win, rect));
  header.querySelector('[data-action="maximize"]').addEventListener('click', () => toggleMaximize(win, rect));

  attachGestures(win, {
    onDrag: (dx, dy) => {
      if (win.dataset.headerDragging === 'true') return;
      rect.x += dx;
      rect.y += dy;
      applyRect(win, rect, false);
    },
    onDragEnd: () => {
      if (win.dataset.headerDragging === 'true') return;
      snapToGrid(rect);
      applyRect(win, rect);
    },
    onPinch: (scaleDelta) => {
      rect.w = clamp(rect.w * scaleDelta, 220, 720);
      rect.h = clamp(rect.h * scaleDelta, 160, 720);
      applyRect(win, rect, false);
    },
    onPinchEnd: () => {
      applyRect(win, rect);
    },
    onRotate: (angle) => {
      rect.rotation = (rect.rotation || 0) + angle;
      applyRect(win, rect, false);
    },
    onRotateEnd: () => applyRect(win, rect),
    onLongPress: () => {
      win.classList.toggle('peek');
    },
    onThreeFingerSwipe: (direction) => {
      if (direction === 'left') minimizeWindow(win, rect);
      if (direction === 'right') focusWindow(id);
    },
  });

  win.addEventListener('pointerdown', () => focusWindow(id));

  return win;
}

function focusWindow(id) {
  const win = windowRegistry.get(id);
  if (!win) return;
  zCounter += 1;
  win.style.zIndex = zCounter;
  win.dataset.active = 'true';
  windowRegistry.forEach((other, key) => {
    if (key !== id) {
      other.dataset.active = 'false';
    }
  });
}

function closeWindow(id) {
  const win = windowRegistry.get(id);
  if (!win) return;
  win.remove();
  windowRegistry.delete(id);
  db.removeWindowState(id);
}

function getWindow(id) {
  return windowRegistry.get(id) || null;
}

function setWindowSize(id, w, h) {
  const win = windowRegistry.get(id);
  if (!win) return;
  const rect = getRect(win);
  rect.w = w;
  rect.h = h;
  applyRect(win, rect);
}

function startDrag(event, win, rect) {
  event.preventDefault();
  focusWindow(win.dataset.id);
  win.setPointerCapture(event.pointerId);
  win.dataset.headerDragging = 'true';
  let lastX = event.clientX;
  let lastY = event.clientY;
  const moveHandler = (moveEvent) => {
    moveEvent.preventDefault();
    const dx = moveEvent.clientX - lastX;
    const dy = moveEvent.clientY - lastY;
    lastX = moveEvent.clientX;
    lastY = moveEvent.clientY;
    rect.x += dx;
    rect.y += dy;
    applyRect(win, rect, false);
  };
  const upHandler = () => {
    win.releasePointerCapture(event.pointerId);
    win.removeEventListener('pointermove', moveHandler);
    win.removeEventListener('pointerup', upHandler);
    win.removeEventListener('pointercancel', upHandler);
    snapToGrid(rect);
    applyRect(win, rect);
    win.dataset.headerDragging = 'false';
  };
  win.addEventListener('pointermove', moveHandler);
  win.addEventListener('pointerup', upHandler);
  win.addEventListener('pointercancel', upHandler);
}

function startResize(event, win, rect) {
  event.preventDefault();
  focusWindow(win.dataset.id);
  win.setPointerCapture(event.pointerId);
  let lastX = event.clientX;
  let lastY = event.clientY;
  const moveHandler = (moveEvent) => {
    moveEvent.preventDefault();
    const dx = moveEvent.clientX - lastX;
    const dy = moveEvent.clientY - lastY;
    lastX = moveEvent.clientX;
    lastY = moveEvent.clientY;
    rect.w = clamp(rect.w + dx, 220, window.innerWidth);
    rect.h = clamp(rect.h + dy, 160, window.innerHeight);
    applyRect(win, rect, false);
  };
  const upHandler = () => {
    win.releasePointerCapture(event.pointerId);
    win.removeEventListener('pointermove', moveHandler);
    win.removeEventListener('pointerup', upHandler);
    win.removeEventListener('pointercancel', upHandler);
    snapToGrid(rect);
    applyRect(win, rect);
  };
  win.addEventListener('pointermove', moveHandler);
  win.addEventListener('pointerup', upHandler);
  win.addEventListener('pointercancel', upHandler);
}

function minimizeWindow(win, rect) {
  const minimized = win.dataset.minimized === 'true';
  win.dataset.minimized = minimized ? 'false' : 'true';
  applyRect(win, rect);
}

function toggleMaximize(win, rect) {
  const isMaximized = win.dataset.maximized === 'true';
  if (isMaximized) {
    const stored = db.getWindowState(win.dataset.id) || rect;
    win.dataset.maximized = 'false';
    applyRect(win, stored);
  } else {
    win.dataset.maximized = 'true';
    applyRect(win, {
      x: 32,
      y: 96,
      w: window.innerWidth - 120,
      h: window.innerHeight - 140,
      rotation: 0,
    });
  }
}

function applyRect(win, rect, persist = true) {
  const rotation = rect.rotation || 0;
  const scale = win.dataset.minimized === 'true' ? 0.85 : 1;
  win.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0) rotate(${rotation}deg) scale(${scale})`;
  win.style.width = `${rect.w}px`;
  win.style.height = `${rect.h}px`;
  win.dataset.x = rect.x;
  win.dataset.y = rect.y;
  win.dataset.w = rect.w;
  win.dataset.h = rect.h;
  win.dataset.rotation = rotation;
  if (persist) {
    db.saveWindowState(win.dataset.id, {
      ...rect,
      rotation,
      title: win.dataset.title,
      contentHtml: win.dataset.contentHtml,
    });
  }
}

function getRect(win) {
  return {
    x: parseFloat(win.dataset.x || '0'),
    y: parseFloat(win.dataset.y || '0'),
    w: parseFloat(win.dataset.w || win.offsetWidth),
    h: parseFloat(win.dataset.h || win.offsetHeight),
    rotation: parseFloat(win.dataset.rotation || '0'),
  };
}

function snapToGrid(rect) {
  rect.x = Math.round(rect.x / gridSize) * gridSize;
  rect.y = Math.round(rect.y / gridSize) * gridSize;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
