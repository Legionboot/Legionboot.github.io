// Обёртки над AnimeJS для единообразных анимаций.
// Для расширения: добавить анимации открытия вкладок или жестовых подсказок.

const FALLBACK = {
  play: () => {},
};

function getAnime() {
  return window.anime ?? {
    timeline: () => FALLBACK,
    spring: () => FALLBACK,
    remove: () => {},
    ({ targets }) => ({ targets }),
  };
}

export function animateWindowIntro(element) {
  const anime = getAnime();
  anime({
    targets: element,
    duration: 320,
    easing: 'easeOutCubic',
    translateY: [24, 0],
    opacity: [0, 1],
  });
}

export function animateWindowClose(element, onComplete) {
  const anime = getAnime();
  anime({
    targets: element,
    duration: 220,
    easing: 'easeInCubic',
    opacity: [1, 0],
    translateY: [0, 32],
    complete: onComplete,
  });
}

export function pulseAvatar(element) {
  const anime = getAnime();
  anime({
    targets: element,
    duration: 520,
    direction: 'alternate',
    easing: 'easeInOutCubic',
    scale: [1, 1.08],
  });
}

export function badgeFlash(element) {
  const anime = getAnime();
  anime({
    targets: element,
    duration: 380,
    easing: 'easeOutQuad',
    backgroundColor: ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.12)'],
  });
}

export function toast(element) {
  const anime = getAnime();
  anime({
    targets: element,
    duration: 260,
    easing: 'easeOutCubic',
    translateY: [16, 0],
    opacity: [0, 1],
  });
}
