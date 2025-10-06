// Распознавание жестов multitouch на основе Pointer Events.
// Поддержка: drag (1 палец), pinch/rotate (2 пальца), трипальный свайп, long press.

const LONG_PRESS_DELAY = 600;
const SWIPE_THRESHOLD = 80;
const MOVE_THRESHOLD = 6;

export function attachGestures(target, callbacks = {}) {
  const state = {
    pointers: new Map(),
    lastDragEvent: null,
    rafId: null,
    initialDistance: null,
    initialAngle: null,
    lastScale: 1,
    lastRotation: 0,
    gestureMode: null,
    longPressTimer: null,
    longPressTriggered: false,
    threeFingerDirection: null,
  };

  const getPointerValues = () => Array.from(state.pointers.values());

  function scheduleUpdate() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(processGestures);
  }

  function processGestures() {
    state.rafId = null;
    const pointers = getPointerValues();
    if (pointers.length === 0) return;

    if (pointers.length === 1) {
      const pointer = pointers[0];
      if (!pointer.lastX) {
        pointer.lastX = pointer.x;
        pointer.lastY = pointer.y;
        return;
      }
      const dx = pointer.x - pointer.lastX;
      const dy = pointer.y - pointer.lastY;
      const distance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
      if (distance > MOVE_THRESHOLD) {
        cancelLongPress();
      }
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
      if (callbacks.onDrag && (dx || dy)) {
        callbacks.onDrag(dx, dy);
      }
    } else if (pointers.length === 2) {
      const [p1, p2] = pointers;
      const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      if (state.initialDistance == null) {
        state.initialDistance = currentDistance;
      }
      if (state.initialAngle == null) {
        state.initialAngle = currentAngle;
      }
      const scale = currentDistance / state.initialDistance;
      const rotation = ((currentAngle - state.initialAngle) * 180) / Math.PI;
      const scaleDelta = scale / (state.lastScale || 1);
      const rotationDelta = rotation - (state.lastRotation || 0);
      state.lastScale = scale;
      state.lastRotation = rotation;
      if (Math.abs(scaleDelta - 1) > 0.01 && callbacks.onPinch) {
        callbacks.onPinch(scaleDelta);
        state.gestureMode = 'pinch';
      }
      if (Math.abs(rotationDelta) > 1 && callbacks.onRotate) {
        callbacks.onRotate(rotationDelta);
        state.gestureMode = 'rotate';
      }
    } else if (pointers.length === 3) {
      const avgDx = pointers.reduce((sum, p) => sum + (p.x - p.startX), 0) / pointers.length;
      if (!state.threeFingerDirection) {
        if (Math.abs(avgDx) > SWIPE_THRESHOLD) {
          state.threeFingerDirection = avgDx > 0 ? 'right' : 'left';
          if (callbacks.onThreeFingerSwipe) {
            callbacks.onThreeFingerSwipe(state.threeFingerDirection);
          }
        }
      }
    }
  }

  function cancelLongPress() {
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
  }

  function handlePointerDown(event) {
    target.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    });
    if (state.pointers.size === 1) {
      state.longPressTriggered = false;
      cancelLongPress();
      state.longPressTimer = setTimeout(() => {
        state.longPressTriggered = true;
        if (callbacks.onLongPress) callbacks.onLongPress();
      }, LONG_PRESS_DELAY);
    } else {
      cancelLongPress();
    }
    scheduleUpdate();
  }

  function handlePointerMove(event) {
    const pointer = state.pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    scheduleUpdate();
  }

  function handlePointerUp(event) {
    target.releasePointerCapture(event.pointerId);
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) {
      if (callbacks.onPinchEnd && state.gestureMode === 'pinch') {
        callbacks.onPinchEnd();
      }
      if (callbacks.onRotateEnd && state.gestureMode === 'rotate') {
        callbacks.onRotateEnd();
      }
      state.initialDistance = null;
      state.initialAngle = null;
      state.lastScale = 1;
      state.lastRotation = 0;
      state.gestureMode = null;
    }
    if (state.pointers.size === 0) {
      if (!state.longPressTriggered && callbacks.onDragEnd) {
        callbacks.onDragEnd();
      }
      cancelLongPress();
      state.threeFingerDirection = null;
    }
  }

  function handlePointerCancel(event) {
    if (state.pointers.has(event.pointerId)) {
      state.pointers.delete(event.pointerId);
    }
    cancelLongPress();
  }

  target.addEventListener('pointerdown', handlePointerDown, { passive: false });
  target.addEventListener('pointermove', handlePointerMove, { passive: false });
  target.addEventListener('pointerup', handlePointerUp, { passive: false });
  target.addEventListener('pointercancel', handlePointerCancel, { passive: false });
  target.addEventListener('lostpointercapture', () => {
    state.pointers.clear();
    cancelLongPress();
  });
}
