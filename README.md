# ORBITALE

Site vitrine 3D animé — Three.js + GSAP, sans build, sans Java.

## Lancer

Les modules ES ne marchent pas en `file://`, il faut un petit serveur :

```bash
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080.

## Structure

- `index.html` — la page
- `css/style.css` — styles
- `js/main.js` — point d'entrée
- `js/scene.js` — scènes 3D (hero + galerie)
- `js/anims.js` — animations (loader, scroll, curseur, tilt…)
