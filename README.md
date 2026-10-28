# ORBITALE

Site vitrine 3D animé d'un studio fictif — Three.js + GSAP, sans build, sans Java.

## Lancer

Les modules ES ne marchent pas en `file://`, il faut un petit serveur :

```bash
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080.

## Pages

| Page | Fichier | Contenu |
| --- | --- | --- |
| Accueil | `index.html` | Hero 3D, manifeste, services, processus, galerie 3D, projets, témoignages, FAQ |
| Projets | `projets.html` | Carrousel 3D, filtres, fiches projet avec aperçu WebGL |
| Labo | `labo.html` | Bac à sable 3D : formes, matériaux, couleurs, capture, partage par lien |
| Studio | `studio.html` | Globe 3D, histoire, valeurs, équipe, offres d'emploi |
| Jeu | `jeu.html` | ORBITE, jeu arcade 3D avec records locaux |
| Contact | `contact.html` | Formulaire en 3 étapes qui prépare un e-mail |
| 404 | `404.html` | Perdu dans l'espace |
| Mentions | `mentions.html` | Mentions légales et confidentialité |

## Structure

- `css/style.css` — styles partagés (variables, nav, menu mobile, boutons, footer) + accueil
- `css/<page>.css` — styles propres à chaque page
- `js/common.js` — nav, menu mobile, curseur, effet magnétique, transitions entre pages
- `js/scene.js` — scènes 3D de l'accueil
- `js/anims.js` — animations de l'accueil
- `js/<page>.js` — logique propre à chaque page

## Données locales

Le site ne dépose aucun cookie. Il utilise seulement le stockage local du navigateur pour le brouillon du
formulaire de contact, les records du jeu et quelques préférences.
