# Le Double Smash — expérience 3D interactive

Le burger de la photo de référence, reconstruit en vraie 3D temps réel (Three.js / WebGL).
Chaque ingrédient est un objet séparé, avec sa propre géométrie et ses propres textures PBR.
Le scroll démonte puis remonte le burger.

## Lancer le projet

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Build de production (site statique dans `dist/`, déployable sur n'importe quel hébergeur) :

```bash
npm run build
npm run preview
```

## Interactions

| Geste | Effet |
| --- | --- |
| Molette / scroll | démonte (vers le bas) ou reconstruit (vers le haut) le burger |
| Déplacer la souris | parallaxe légère, la lumière principale suit le curseur |
| Cliquer-glisser | tourner autour du burger (avec inertie) |
| Ctrl/⌘/Alt + molette, pincement du trackpad, molette pendant un glisser | zoom |
| Survol d'un ingrédient ou de son label | mise en évidence |
| Clic sur un ingrédient ou son label | fiche détaillée + caméra centrée sur l'ingrédient |
| ↑ ↓ dans la fiche, Échap | ingrédient précédent/suivant, fermer |
| Double-clic / bouton « Recentrer la vue » | réinitialise la caméra |

Paramètres d'URL utiles : `?p=0.6` fige la progression du scroll (réglages, captures) ;
`?open=patty_top` ou `#patty_top` ouvre directement la fiche d'un ingrédient.

## Architecture

```
web/
├── index.html                  structure de la page (hero épinglé, sections suivantes)
├── src/
│   ├── main.js                 orchestration : scroll, boucle de rendu, UI, qualité adaptative
│   ├── content/ingredients.js  textes de chaque ingrédient (nom, accroche, description, infos)
│   ├── scene/
│   │   ├── Stage.js            renderer, lumières, planche/mur, post-traitement (GTAO, DOF, grain)
│   │   ├── materials.js        chargement des textures PBR → MeshPhysicalMaterial
│   │   ├── geometry.js         outils : révolution de profils déformés, feuilles épaisses, bruit
│   │   ├── parts/              un module par ingrédient (bun, patty, cheese, toppings)
│   │   ├── Burger.js           empilement des couches + animation de séparation
│   │   ├── choreography.js     timing du scroll (splines par couche) et trajectoire caméra
│   │   └── CameraRig.js        caméra : trajectoire + orbite utilisateur + zoom + focus
│   ├── interaction/Pointer.js  souris / tactile : parallaxe, orbite, zoom, survol, clic
│   ├── ui/Labels.js            labels éditoriaux reliés aux ingrédients par un filet
│   ├── ui/Detail.js            panneau de détail
│   └── styles/main.css
├── public/textures/            textures PBR générées (albedo, normal, ORM)
└── tools/gen_textures.py       générateur procédural des textures
```

### Modifier…

- **Les textes** : `src/content/ingredients.js`. Les ingrédients ont été identifiés à partir de la
  photo. Ajustez les descriptions pour qu'elles correspondent à la vraie recette.
- **Le rythme du démontage** : `LAYERS` dans `src/scene/choreography.js`. Chaque couche a des clés
  `[progression, décalage vertical en cm]`, interpolées par une spline monotone sans à-coups.
- **La caméra** : `CAMERA_KEYS` dans le même fichier (azimut, élévation, hauteur visée, champ, flou).
- **Les formes** : `src/scene/parts/*.js` (dimensions en centimètres, mesurées sur la photo).
- **Les textures** : `npm run textures` (Python 3 + numpy, pillow, scipy) régénère toutes les maps.
  Vous pouvez aussi remplacer les JPEG de `public/textures/` par des scans photo, à condition de garder la
  même disposition UV (voir l'en-tête de `tools/gen_textures.py`).

## Rendu

- Géométries procédurales : dôme de brioche déformé et asymétrique, 500+ graines de sésame instanciées
  et réparties sans chevauchement, steaks aux bords dentelés et reliefs de viande hachée, fromage fondu
  qui épouse le steak et coule sur les bords, sauce en flaque, pickles, oignons en lamelles translucides.
- Matériaux physiques : clearcoat (dorure à l'œuf, sauce, gras), sheen, normal maps, roughness et AO maps.
- Éclairage studio : environnement HDR (IBL), key light douce avec ombres, contre-jour chaud, fill.
- Post-traitement : occlusion ambiante GTAO, profondeur de champ, vignettage et grain photo.
- La qualité s'adapte automatiquement au matériel (AO, flou, résolution), avec un profil allégé sur mobile.
