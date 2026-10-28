// Point d'entrée : branche les scènes 3D et les animations une fois GSAP chargé.
import { initHero, initShowcase } from './scene.js';
import { initAnims } from './anims.js';

function start() {
  const hero = initHero(document.getElementById('hero-canvas'));
  const showcase = initShowcase(document.getElementById('showcase-canvas'), (label) => {
    document.getElementById('showcase-label').textContent = label;
  });
  initAnims({ hero, showcase });
}

// Les scripts GSAP sont en "defer" : ils sont prêts au DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
