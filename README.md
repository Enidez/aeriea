# Aériea : MVP

## Jouer (le plus simple)
1. Télécharge `aeriea.html` et double-clique dessus : il s'ouvre dans ton navigateur (Chrome ou Edge conseillés pour la manette).
2. Branche la manette PS4 (USB ou Bluetooth), puis appuie sur n'importe quel bouton pour que le navigateur la détecte.
3. Branche l'ordinateur à la télé en HDMI, appuie sur **F** (ou le bouton « Plein écran ») et joue.

Tout est dans ce seul fichier (moteur 3D, modèles, sons), aucune connexion internet nécessaire.

## Commandes
| Manette PS4 | Clavier | À pied | À cheval | En vol |
|---|---|---|---|---|
| Stick gauche | ZQSD / WASD | marcher | diriger | piquer / monter / virer |
| Stick droit | flèches | caméra | caméra | caméra |
| R2 | Maj | courir | galop | battre des ailes (accélérer) |
| L2 | Ctrl | | | freiner |
| L1 / R1 | Z / C | | | tonneau |
| ✕ | Espace / Entrée | sauter | sauter | |
| △ | E | appeler l'aigle | appeler l'aigle | |
| □ | Q | monter à cheval | | descendre à cheval |
| ◯ | R | | descendre | atterrir |
| SHARE | I | | | inverser l'axe vertical |
| OPTIONS | Échap / P | pause | pause | pause |

## La course d'anneaux
Envole-toi et passe dans l'anneau vert **DÉPART** au-dessus du château. Le chrono démarre ; suis l'anneau doré (une flèche jaune t'indique le suivant). 17 anneaux, arrivée en rouge au-dessus du donjon.
Médaille d'or, d'argent ou de bronze selon le temps, plus des écus. **La médaille d'or débloque l'Aigle d'Or.** Record et récompenses sont sauvegardés dans le navigateur.

## Modifier le jeu
```
npm install
node build.mjs        # régénère dist/aeriea.html
```
Le code est dans `src/main.js` (Three.js 0.180). Vercel lance `npm run build` et publie `dist/`.

## Crédits des assets (gratuits)
- Chevalier animé (75 animations) : **KayKit Character Pack: Adventurers** par Kay Lousberg, licence CC0. https://kaylousberg.itch.io/kaykit-adventurers
- Cheval et cigogne animés (la cigogne est recolorée en aigle) : modèles des exemples officiels de **three.js** (créés par mirada pour « ROME: 3 Dreams of Black »), licence MIT du dépôt three.js. https://github.com/mrdoob/three.js
- Terrain, château, village, moulin, arbres, nuages, sons : générés par le code.
