// Распознавание жестов на основе Pointer Events.
// Для расширения: подключить gestures.js к другим компонентам (например, canvas или редактору).

const LONG_PRESS_DELAY = 550;
const SWIPE_THRESHOLD = 80;
const activeGestures = new WeakMap();

function getGestureState(element) {
  if (!activeGestures.has(element)) {
    activeGestures.set(element, {
      pointers: new Map(),
      pinchStartDistance: null,
      rotationStartAngle: null,
      lastScale: 1,
      lastAngle: 0,
      longPressTimer: null,
      centroidStart: null,
    });
  }
  return activeGestures.get(element);
}

export function attachWindowGestures(element, callbacks = {}) {
  const state = getGestureState(element);

  const onPointerDown = (event) => {
    element.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, copyPointer(event));
    if (state.pointers.size === 1) {
      startLongPress(event, state, callbacks);
    }
    if (state.pointers.size >= 2) {
      cancelLongPress(state);
      initializePinch(state);
      state.centroidStart = getCentroid(state.pointers);
    }
  };

  const onPointerMove = (event) => {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, copyPointer(event));
    cancelLongPress(state);
    if (state.pointers.size === 2) {
      handlePinchRotate(element, state, callbacks);
    }
    if (state.pointers.size === 3) {
      handleThreeFingerSwipe(state, callbacks);
    }
  };

  const onPointerUp = (event) => {
    element.releasePointerCapture(event.pointerId);
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) {
      finalizePinchRotate(element, state, callbacks);
    }
    if (!state.pointers.size) {
      cancelLongPress(state);
      state.centroidStart = null;
    }
  };

  const onPointerCancel = onPointerUp;

  element.addEventListener('pointerdown', onPointerDown, { passive: false });
  element.addEventListener('pointermove', onPointerMove, { passive: false });
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  element.addEventListener('wheel', (event) => {
    if (callbacks.onPinch) {
      event.preventDefault();
      const scaleDelta = event.deltaY < 0 ? 1.05 : 0.95;
      callbacks.onPinch(scaleDelta);
    }
  }, { passive: false });
}

function copyPointer(event) {
  return {
    id: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
  };
}

function startLongPress(event, state, callbacks) {
  cancelLongPress(state);
  state.longPressTimer = window.setTimeout(() => {
    callbacks.onLongPress?.(event);
  }, LONG_PRESS_DELAY);
}

function cancelLongPress(state) {
  if (state.longPressTimer) {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  }
}

function initializePinch(state) {
  const [a, b] = Array.from(state.pointers.values());
  state.pinchStartDistance = distanceBetween(a, b);
  state.rotationStartAngle = angleBetween(a, b);
  state.lastScale = 1;
  state.lastAngle = 0;
}

function handlePinchRotate(element, state, callbacks) {
  const [a, b] = Array.from(state.pointers.values());
  const distance = distanceBetween(a, b);
  if (state.pinchStartDistance) {
    const scale = distance / state.pinchStartDistance;
    if (Math.abs(scale - state.lastScale) > 0.02) {
      callbacks.onPinch?.(scale);
      state.lastScale = scale;
    }
  }
  const angle = angleBetween(a, b);
  const deltaAngle = angle - (state.rotationStartAngle ?? angle);
  if (Math.abs(deltaAngle - state.lastAngle) > 2) {
    callbacks.onRotate?.(deltaAngle);
    state.lastAngle = deltaAngle;
  }
}

function finalizePinchRotate(element, state, callbacks) {
  if (state.lastAngle && callbacks.onRotateEnd) {
    callbacks.onRotateEnd(state.lastAngle);
  }
  state.pinchStartDistance = null;
  state.rotationStartAngle = null;
  state.lastScale = 1;
  state.lastAngle = 0;
}

function handleThreeFingerSwipe(state, callbacks) {
  const centroid = getCentroid(state.pointers);
  if (!state.centroidStart) {
    state.centroidStart = centroid;
    return;
  }
  const deltaY = centroid.y - state.centroidStart.y;
  const deltaX = centroid.x - state.centroidStart.x;
  if (Math.abs(deltaY) > SWIPE_THRESHOLD || Math.abs(deltaX) > SWIPE_THRESHOLD) {
    const direction = Math.abs(deltaY) > Math.abs(deltaX)
      ? deltaY > 0 ? 'down' : 'up'
      : deltaX > 0 ? 'right' : 'left';
    callbacks.onThreeFingerSwipe?.(direction);
    state.centroidStart = centroid;
  }
}

function distanceBetween(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function angleBetween(a, b) {
  return (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI;
}

function getCentroid(pointers) {
  const arr = Array.from(pointers.values());
  const sum = arr.reduce((acc, p) => ({
    x: acc.x + p.clientX,
    y: acc.y + p.clientY,
  }), { x: 0, y: 0 });
  return {
    x: sum.x / arr.length,
    y: sum.y / arr.length,
  };
}
