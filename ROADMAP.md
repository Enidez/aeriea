# Aériea — état du projet et suite

## Lancer le projet
```
npm install
npm run dev      # http://localhost:5173, rechargement automatique
node build.mjs   # dist/ (aeriea.html + music/)
```
La musique est servie à côté du jeu (`public/music` → `dist/music`). Ouvert directement depuis le disque, `aeriea.html` fonctionne mais sans musique.

## Fait (phase 1)

**Rendu et monde**
- Textures procédurales : herbe, roche, terre, sable, neige, pierre taillée, tuiles, bois, crépi, écailles…
- Terrain texturé par shader, herbe 3D animée, arbres balancés par le vent, nuages doux, eau réfléchissante, bloom.
- Quatre saisons : printemps au centre et au sud-ouest, hiver au nord-ouest (neige, lacs gelés), désert au nord-est, automne boueux au sud-est.
- Neuf lacs et des montagnes plus douces.
- Château et village (maisons à colombages posées sur des fondations), moulin, menhirs.

**Personnages** (modèles Sketchfab, CC-BY)
- Paladin joueur au squelette Mixamo, avec des textures éclaircies.
- Les 29 animations KayKit sont transposées par retargeting (`src/retarget.js`), avec ancrage des pieds au sol.
- Épée procédurale tenue dans la main.

**Montures**
- Aigle royal (avec des variantes), pygargue et dragon Flint Maw, riggés et animés (`src/flyers.js`).
- Souffle de feu en particules pour le dragon (`src/fire.js`).
- Cheval : modèle low-poly à morph targets, avec une pose d'arrêt calculée.
- Cavalier posé sur le dos animé de la monture, jambes en IK de part et d'autre des flancs.

**Gameplay**
- Mode libre et course d'anneaux.
- Appel de la monture, qui vient en piqué te cueillir, y compris au galop. Saut dans le vide, chute libre, rattrapage en plein ciel.
- Surf debout sur la monture.
- Figures : saltos, vrilles, tonneaux, looping, Immelmann (L1+R1), rase-mottes. Combos convertis en écus.
- Caméra de vol : stick droit pour l'orbite et le zoom.

**Boss : le Roi en armure**, sur son trône dans la cour du château (`src/combat.js`)
- Combat façon Sifu : verrouillage de cible, garde automatique, parade, esquive avec invulnérabilité.
- Jauge de posture, coup de grâce.
- Le roi télégraphie ses attaques ; celles en rouge sont imparables.

**Bots** (`src/bots.js`)
- 7 chevaliers sur aigles et dragons qui sillonnent le ciel et font des figures.
- 4 piétons au village.

**Interface, son, musique**
- Interface sobre en verre dépoli. Menu accessible : taille de l'interface, inversion de chaque axe, secousses et flashs, qualité, volume de la musique.
- Sons réalistes : vrais cris de rapace, chocs métalliques, souffles, feu.
- Bande-son adaptative (village, exploration, hiver, cheval, aigle, dragon, boss). Voir les crédits dans le README.

## Reste à faire

**Finitions phase 1**
- [ ] Cheval réaliste riggé (marche, trot, galop, arrêt) à la place du cheval low-poly.
- [ ] Avatar plus vivant :
  - mélange des animations selon la vitesse (blend spaces) ;
  - inclinaison dans les virages ;
  - mouvement secondaire de la cape et du plumet (spring bones) ;
  - ragdoll pour les chutes et les coups.
- [ ] Les bots ne réagissent pas au joueur et ne combattent pas.
- [ ] Le souffle de feu ne fait encore aucun dégât.
- [ ] Mesurer les FPS sur la machine branchée à la télé et optimiser : herbe, bots, bundle de 14,8 Mo.
- [ ] Ménage : `assets/Stork.glb`, `assets/Knight.glb` et `src/dragon.js` ne sont plus utilisés.
- [ ] Vérifier le déploiement Vercel, notamment `dist/music`.

**Phase 2 : battle royale**
- [ ] Multijoueur en ligne : il faut un serveur temps réel, Vercel étant statique. À choisir : WebSocket (Colyseus, PartyKit…) ou WebRTC.
- [ ] Grande forteresse façon Assassin's Creed (maisons, quartiers) avec du parkour : grimper, toits, sauts.
- [ ] Combat façon Sifu contre plusieurs ennemis : mains nues, épée, lance, arc, bâton de sorcier à boules de feu. Armes à ramasser dans la forteresse.
- [ ] Montures interdites dans la forteresse (déjà en place), utilisables un temps limité. Frappes aériennes depuis le dragon ou l'aigle : feu, lances, flèches.
- [ ] Loups autour du château. Écus et armes cachés dans les montagnes et les forêts. Inventaire.

## Carte du code
| Fichier | Rôle |
|---|---|
| `src/main.js` | Boucle de jeu, joueur, montures, figures, caméra, menus |
| `src/world.js` | Terrain, saisons, eau et glace, château, village, forêts, herbe, nuages |
| `src/textures.js` | Textures procédurales |
| `src/retarget.js` | Retargeting d'animations entre squelettes (KayKit → Mixamo / Biped) |
| `src/flyers.js` | Créatures volantes riggées (orientation, échelle, siège du cavalier) |
| `src/combat.js` | Combat contre le Roi en armure |
| `src/bots.js` | Bots volants et piétons |
| `src/fire.js` | Souffle de feu |
| `src/props.js` | Armes procédurales et fixation dans la main |
| `src/audio.js` | Bruitages |
| `src/music.js` | Musique adaptative |
| `tools/*.mjs` | Préparation des modèles (`slim-knight`, `pack-chars`, `pack-creatures`) |
