// Менеджер плавающих окон: создание, фокусировка, закрытие и привязка к сетке.
// Для расширения: добавить снап к виртуальным рабочим столам или док-панель.

import { animateWindowIntro, animateWindowClose } from './animations.js';
import { attachWindowGestures } from './gestures.js';

const layer = document.getElementById('windowLayer');
const SNAP_SIZE = 24;
const STORAGE_KEY = 'local_messenger_windows_state_v1';
let zIndexCursor = 100;
const windows = new Map();

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Не удалось прочитать состояние окон', err);
    return {};
  }
}

const state = readState();

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Не удалось сохранить состояние окон', err);
  }
}

function ensureLayerPointer() {
  layer.style.pointerEvents = windows.size ? 'auto' : 'none';
}

function snap(value) {
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}

function clampWindow(rect) {
  const padding = 16;
  const maxX = window.innerWidth - rect.width - padding;
  const maxY = window.innerHeight - rect.height - padding;
  return {
    x: Math.max(padding, Math.min(rect.x, Math.max(padding, maxX))),
    y: Math.max(padding, Math.min(rect.y, Math.max(padding, maxY))),
  };
}

function applyPosition(el, { x, y }) {
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function applySize(el, { w, h }) {
  if (w) el.style.width = `${w}px`;
  if (h) el.style.height = `${h}px`;
}

function withRaf(cb) {
  let rafId = null;
  return (...args) => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      cb(...args);
    });
  };
}

const moveWithRaf = withRaf((el, position) => applyPosition(el, position));
const sizeWithRaf = withRaf((el, size) => applySize(el, size));

export function createWindow({ id, title, contentHtml, x = 80, y = 80, w = 360, h = 320, modal = false }) {
  if (!id) throw new Error('Не указан id окна');

  if (windows.has(id)) {
    focusWindow(id);
    const existing = windows.get(id);
    if (contentHtml) {
      existing.body.innerHTML = contentHtml;
    }
    return existing;
  }

  const el = document.createElement('section');
  el.className = 'window';
  el.dataset.id = id;
  if (modal) {
    el.classList.add('window--modal');
  }

  const header = document.createElement('header');
  header.className = 'window__header';
  header.innerHTML = `
    <h3 class="window__title">${title ?? 'Окно'}</h3>
    <div class="window__controls">
      <button class="window__btn" data-action="minimize" aria-label="Свернуть">—</button>
      <button class="window__btn" data-action="maximize" aria-label="Растянуть">▢</button>
      <button class="window__btn" data-action="close" aria-label="Закрыть">×</button>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'window__body';
  body.innerHTML = contentHtml || '';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'window__resize-handle';
  resizeHandle.innerHTML = '◢';

  el.append(header, body, resizeHandle);
  layer.appendChild(el);

  const saved = state[id];
  const rect = {
    x: saved?.x ?? x,
    y: saved?.y ?? y,
    w: saved?.w ?? w,
    h: saved?.h ?? h,
  };

  applySize(el, rect);
  applyPosition(el, clampWindow(rect));

  const windowRecord = {
    id,
    element: el,
    header,
    body,
    resizeHandle,
    state: rect,
    minimized: false,
    modal,
  };

  windows.set(id, windowRecord);
  focusWindow(id);
  ensureLayerPointer();
  animateWindowIntro(el);
  window.dispatchEvent(new CustomEvent('window:opened', { detail: { id } }));
  attachWindowGestures(el, {
    onPinch: (scale) => {
      const newWidth = Math.max(220, rect.w * scale);
      const newHeight = Math.max(160, rect.h * scale);
      rect.w = newWidth;
      rect.h = newHeight;
      sizeWithRaf(el, { w: newWidth, h: newHeight });
      state[id] = { ...state[id], w: newWidth, h: newHeight };
      persistState();
    },
    onRotate: (angle) => {
      el.style.rotate = `${angle}deg`;
    },
    onRotateEnd: () => {
      el.style.rotate = '0deg';
    },
    onThreeFingerSwipe: (direction) => {
      if (direction === 'down') {
        minimizeWindow(id, true);
      }
    },
    onLongPress: () => {
      el.classList.toggle('window--modal');
    },
  });

  header.addEventListener('pointerdown', (event) => startDrag(event, windowRecord));
  resizeHandle.addEventListener('pointerdown', (event) => startResize(event, windowRecord));
  header.addEventListener('dblclick', () => toggleMaximize(windowRecord));
  header.addEventListener('mousedown', () => focusWindow(id));

  header.querySelectorAll('.window__btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === 'close') closeWindow(id);
      if (action === 'minimize') minimizeWindow(id);
      if (action === 'maximize') toggleMaximize(windowRecord);
    });
  });

  return windowRecord;
}

function toggleMaximize(windowRecord) {
  const { element, state: rect, id } = windowRecord;
  const maximized = element.dataset.state === 'maximized';
  if (maximized) {
    element.dataset.state = '';
    applySize(element, rect);
    applyPosition(element, rect);
  } else {
    element.dataset.state = 'maximized';
    element.style.width = `${window.innerWidth - 40}px`;
    element.style.height = `${window.innerHeight - 60}px`;
    applyPosition(element, { x: 20, y: 20 });
  }
  persistStateSnapshot(id, rect);
}

function minimizeWindow(id, silent = false) {
  const record = windows.get(id);
  if (!record) return;
  const { element } = record;
  const isMin = element.dataset.state === 'minimized';
  element.dataset.state = isMin ? '' : 'minimized';
  if (!silent) {
    persistStateSnapshot(id, record.state);
  }
}

function persistStateSnapshot(id, rect) {
  state[id] = {
    x: rect.x,
    y: rect.y,
    w: parseInt(rect.w, 10) || rect.w,
    h: parseInt(rect.h, 10) || rect.h,
  };
  persistState();
}

function startDrag(event, record) {
  event.preventDefault();
  focusWindow(record.id);
  const { element, state: rect } = record;
  const pointerId = event.pointerId;
  const start = { x: rect.x, y: rect.y };
  const offset = { x: event.clientX - rect.x, y: event.clientY - rect.y };

  const move = (moveEvent) => {
    const next = {
      x: moveEvent.clientX - offset.x,
      y: moveEvent.clientY - offset.y,
    };
    const clamped = clampWindow({ ...rect, ...next });
    rect.x = clamped.x;
    rect.y = clamped.y;
    moveWithRaf(element, rect);
  };

  const up = () => {
    element.releasePointerCapture(pointerId);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', up);
    rect.x = snap(rect.x);
    rect.y = snap(rect.y);
    applyPosition(element, rect);
    persistStateSnapshot(record.id, rect);
  };

  element.setPointerCapture(pointerId);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
}

function startResize(event, record) {
  event.preventDefault();
  event.stopPropagation();
  focusWindow(record.id);
  const { element, state: rect } = record;
  const pointerId = event.pointerId;
  const startSize = { w: rect.w, h: rect.h };
  const startPos = { x: event.clientX, y: event.clientY };

  const move = (moveEvent) => {
    const deltaX = moveEvent.clientX - startPos.x;
    const deltaY = moveEvent.clientY - startPos.y;
    rect.w = Math.max(220, startSize.w + deltaX);
    rect.h = Math.max(160, startSize.h + deltaY);
    sizeWithRaf(element, rect);
  };

  const up = () => {
    element.releasePointerCapture(pointerId);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', up);
    rect.w = snap(rect.w);
    rect.h = snap(rect.h);
    applySize(element, rect);
    persistStateSnapshot(record.id, rect);
  };

  element.setPointerCapture(pointerId);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
}

export function focusWindow(id) {
  const record = windows.get(id);
  if (!record) return;
  zIndexCursor += 1;
  record.element.style.zIndex = zIndexCursor;
  windows.forEach((w) => w.element.classList.toggle('window--focused', w.id === id));
  window.dispatchEvent(new CustomEvent('window:focused', { detail: { id } }));
}

export function closeWindow(id) {
  const record = windows.get(id);
  if (!record) return;
  animateWindowClose(record.element, () => {
    layer.removeChild(record.element);
    windows.delete(id);
    delete state[id];
    persistState();
    ensureLayerPointer();
    window.dispatchEvent(new CustomEvent('window:closed', { detail: { id } }));
  });
}

export function setWindowSize(id, w, h) {
  const record = windows.get(id);
  if (!record) return;
  record.state.w = w;
  record.state.h = h;
  applySize(record.element, { w, h });
  persistStateSnapshot(id, record.state);
}

window.addEventListener('resize', () => {
  windows.forEach((record) => {
    const clamped = clampWindow({ ...record.state });
    record.state.x = clamped.x;
    record.state.y = clamped.y;
    applyPosition(record.element, clamped);
  });
  persistState();
});
