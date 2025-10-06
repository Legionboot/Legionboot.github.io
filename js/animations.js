// Обёртки над AnimeJS. Здесь можно добавлять новые анимации (например, bounce, physics).

function animate(element, params) {
  if (typeof anime === 'undefined') {
    console.warn('AnimeJS не загружен');
    return { finished: Promise.resolve() };
  }
  return anime({ targets: element, ...params });
}

export function animateWindowOpen(windowEl) {
  animate(windowEl, {
    opacity: [0, 1],
    translateY: [-12, 0],
    duration: 340,
    easing: 'cubicBezier(0.22, 1, 0.36, 1)',
  });
}

export function animateWindowFocus(windowEl) {
  animate(windowEl, {
    boxShadow: ['0px 20px 40px rgba(0,0,0,0.35)', '0px 32px 64px rgba(0,230,118,0.45)'],
    duration: 260,
    easing: 'easeOutQuad',
  });
}

export function animateWindowClose(windowEl, onComplete) {
  animate(windowEl, {
    opacity: [1, 0],
    translateY: [0, 28],
    duration: 220,
    easing: 'easeInCubic',
    complete: onComplete,
  });
}

export function animateWindowMinimize(windowEl) {
  animate(windowEl, {
    opacity: [1, 0.6],
    duration: 180,
    easing: 'easeInOutQuad',
  });
}

export function animateWindowRestore(windowEl) {
  animate(windowEl, {
    opacity: [0.7, 1],
    duration: 200,
    easing: 'easeOutQuad',
  });
}

export function animateAvatarPulse(avatarEl) {
  animate(avatarEl, {
    scale: [1, 1.08, 1],
    duration: 520,
    easing: 'easeInOutSine',
  });
}

export function animateMessageSend(messageEl) {
  animate(messageEl, {
    translateY: [12, 0],
    opacity: [0, 1],
    duration: 260,
    easing: 'easeOutQuad',
  });
}

// В будущем можно добавить анимации для группового перемещения окон и демонстрации жестов.
