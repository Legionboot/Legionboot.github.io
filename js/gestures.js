// Обработчик Pointer Events для окон: drag, resize, pinch, longpress, трипальные свайпы.
// При желании можно подключить Hammer.js или Gestures API, но здесь всё реализовано вручную.

const LONG_PRESS_DELAY = 550;
const MOVE_THRESHOLD = 8;

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function averageDelta(pointers) {
  const entries = Array.from(pointers.values());
  const base = entries[0];
  const dx = entries.reduce((acc, pointer) => acc + (pointer.x - pointer.startX), 0) / entries.length;
  const dy = entries.reduce((acc, pointer) => acc + (pointer.y - pointer.startY), 0) / entries.length;
  return { dx, dy, base };
}

export function attachWindowGestures(windowEl, callbacks = {}) {
  const dragHandle = windowEl.querySelector('[data-drag-handle]') || windowEl;
  const resizeHandle = windowEl.querySelector('[data-resize-handle]');
  const pointers = new Map();
  let mode = null;
  let longPressTimer = null;
  let pinchInitialDistance = 0;
  let pinchLastScale = 1;
  let startWindowX = parseFloat(windowEl.dataset.x) || 0;
  let startWindowY = parseFloat(windowEl.dataset.y) || 0;
  let startWidth = windowEl.offsetWidth;
  let startHeight = windowEl.offsetHeight;
  let frameRequested = false;
  let pendingDrag = null;
  let pendingResize = null;
  let pendingPinch = null;

  const scheduleFrame = () => {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      if (pendingDrag) {
        callbacks.onDrag?.(pendingDrag);
        pendingDrag = null;
      }
      if (pendingResize) {
        callbacks.onResize?.(pendingResize);
        pendingResize = null;
      }
      if (pendingPinch) {
        callbacks.onPinch?.(pendingPinch);
        pendingPinch = null;
      }
    });
  };

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const reset = () => {
    const prevMode = mode;
    pointers.clear();
    clearLongPress();
    mode = null;
    pinchInitialDistance = 0;
    pinchLastScale = 1;
    if (prevMode === 'drag') callbacks.onDragEnd?.();
    if (prevMode === 'resize') callbacks.onResizeEnd?.();
    if (prevMode === 'pinch') callbacks.onPinchEnd?.();
  };

  const startLongPress = () => {
    clearLongPress();
    longPressTimer = setTimeout(() => {
      callbacks.onLongPress?.();
      clearLongPress();
    }, LONG_PRESS_DELAY);
  };

  const onPointerDown = (event) => {
    if (event.button > 0) return;
    const target = event.target;
    const isResize = resizeHandle && (target === resizeHandle || resizeHandle.contains(target));
    const isDrag = !isResize && (dragHandle.contains(target) || target.closest('[data-drag-handle]'));
    if (!isResize && !isDrag) return;

    mode = isResize ? 'resize' : 'drag';
    pointers.set(event.pointerId, {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      type: event.pointerType,
      startTime: event.timeStamp,
    });

    startWindowX = parseFloat(windowEl.dataset.x) || 0;
    startWindowY = parseFloat(windowEl.dataset.y) || 0;
    startWidth = windowEl.offsetWidth;
    startHeight = windowEl.offsetHeight;

    if (typeof windowEl.setPointerCapture === 'function') {
      try {
        windowEl.setPointerCapture(event.pointerId);
      } catch (error) {
        // ignore capture errors
      }
    }
    startLongPress();
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    const movedDistance = distance(pointer, { x: pointer.startX, y: pointer.startY });
    if (movedDistance > MOVE_THRESHOLD) {
      clearLongPress();
    }

    if (pointers.size === 1 && mode === 'drag') {
      const dx = pointer.x - pointer.startX;
      const dy = pointer.y - pointer.startY;
      pendingDrag = { x: startWindowX + dx, y: startWindowY + dy };
      scheduleFrame();
    } else if (pointers.size === 1 && mode === 'resize') {
      const dx = pointer.x - pointer.startX;
      const dy = pointer.y - pointer.startY;
      const width = Math.max(280, startWidth + dx);
      const height = Math.max(220, startHeight + dy);
      pendingResize = { width, height };
      scheduleFrame();
    } else if (pointers.size === 2) {
      clearLongPress();
      const [first, second] = Array.from(pointers.values());
      if (!pinchInitialDistance) {
        pinchInitialDistance = distance(first, second);
      }
      const dist = distance(first, second);
      const scale = Math.min(Math.max(dist / pinchInitialDistance, 0.6), 1.6);
      pinchLastScale = scale;
      mode = 'pinch';
      pendingPinch = { scale };
      scheduleFrame();
    }
  };

  const onPointerUp = (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    clearLongPress();

    if (typeof windowEl.releasePointerCapture === 'function') {
      try {
        windowEl.releasePointerCapture(event.pointerId);
      } catch (error) {
        // noop
      }
    }

    if (mode === 'drag' && pointers.size === 0 && pendingDrag) {
      callbacks.onDrag?.(pendingDrag);
      callbacks.onDragEnd?.();
      pendingDrag = null;
    }

    if (mode === 'resize' && pointers.size === 0 && pendingResize) {
      callbacks.onResize?.(pendingResize);
      callbacks.onResizeEnd?.();
      pendingResize = null;
    }

    if (pointers.size === 0 && pinchLastScale !== 1) {
      callbacks.onPinchEnd?.({ scale: pinchLastScale });
    }

    if (mode !== 'swipe3' && pointers.size === 0) {
      const totalDuration = event.timeStamp - (pointer?.startTime || 0);
      if (totalDuration < 220 && distance(pointer, { x: pointer.startX, y: pointer.startY }) < MOVE_THRESHOLD) {
        // tap — ничего не делаем, окно уже в фокусе
      }
    }

    if (pointers.size === 0) {
      mode = null;
      pinchInitialDistance = 0;
      pinchLastScale = 1;
    }
  };

  const onPointerCancel = (event) => {
    if (pointers.has(event.pointerId)) {
      pointers.delete(event.pointerId);
    }
    clearLongPress();
    if (pointers.size === 0) {
      reset();
    }
  };

  const detectThreeFingerSwipe = (event) => {
    if (pointers.size !== 3) return;
    if (mode && mode !== 'swipe3') return;
    mode = 'swipe3';
    const { dx, dy } = averageDelta(pointers);
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 60 && absY < 60) return;
    const direction = absX > absY ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    callbacks.onThreeFingerSwipe?.(direction);
    reset();
    event.preventDefault();
  };

  const listenTarget = windowEl;
  const handlePointerMove = (event) => {
    onPointerMove(event);
    detectThreeFingerSwipe(event);
  };
  listenTarget.addEventListener('pointerdown', onPointerDown, { passive: false });
  listenTarget.addEventListener('pointermove', handlePointerMove, { passive: false });
  listenTarget.addEventListener('pointerup', onPointerUp, { passive: false });
  listenTarget.addEventListener('pointercancel', onPointerCancel, { passive: false });

  // Public API — возвращаем функцию очистки
  return () => {
    listenTarget.removeEventListener('pointerdown', onPointerDown);
    listenTarget.removeEventListener('pointermove', handlePointerMove);
    listenTarget.removeEventListener('pointerup', onPointerUp);
    listenTarget.removeEventListener('pointercancel', onPointerCancel);
  };
}

// Идея для будущего: вынести эти жесты в отдельный GestureController, чтобы переиспользовать в других приложениях.
