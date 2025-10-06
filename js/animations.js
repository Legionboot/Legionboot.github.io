// Модуль анимаций. Использует AnimeJS, подключённый через CDN в index.html.
// При необходимости можно вынести дополнительные сценарии (например, анимацию уведомлений).

export function animateAvatar(button) {
  if (!window.anime) return;
  window.anime({
    targets: button.querySelector('svg'),
    rotate: [0, 360],
    scale: [1, 1.2, 1],
    duration: 1200,
    easing: 'easeInOutSine',
  });
}

export function animateWindowOpen(win) {
  if (!window.anime) return;
  window.anime({
    targets: win,
    opacity: [0, 1],
    translateY: [-12, 0],
    duration: 360,
    easing: 'spring(1, 80, 10, 0)',
  });
}

export function pulseUnreadBadge(element) {
  if (!window.anime) return;
  window.anime({
    targets: element,
    scale: [1, 1.15, 1],
    duration: 600,
    easing: 'easeOutQuad',
  });
}
