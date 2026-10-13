# Aériea : MVP

## Jouer (le plus simple)
1. Télécharge `aeriea.html` et double-clique dessus : il s'ouvre dans ton navigateur (Chrome ou Edge conseillés pour la manette).
2. Branche la manette PS4 (USB ou Bluetooth), puis appuie sur n'importe quel bouton pour que le navigateur la détecte.
3. Branche l'ordinateur à la télé en HDMI, appuie sur **F** (ou le bouton « Plein écran ») et joue.

Tout est dans ce seul fichier (moteur 3D, modèles, sons), aucune connexion internet nécessaire.

## Modes de jeu
- **Exploration libre** : aucun anneau, tu explores et tu enchaînes les figures (les combos rapportent des écus).
- **Course d'anneaux** : le chrono démarre dans l'anneau vert DÉPART.
On change de mode et de monture dans le menu (**OPTIONS** / Échap).

## Montures volantes
Aigle royal, Faucon des neiges (rapide, agile), Corbeau géant, Dragon (énorme, lent à virer) et Aigle d'Or (médaille d'or en course).

## Commandes
| Manette PS4 | Clavier | À pied | À cheval | En vol | Chute libre |
|---|---|---|---|---|---|
| Stick gauche | ZQSD / WASD | marcher | diriger | piloter | se diriger |
| Stick droit | flèches | caméra | caméra | caméra | caméra |
| R2 | Maj | courir | galop | battre des ailes | |
| L2 | Ctrl | | | freiner | |
| L1 / R1 | Z / C | | | tonneau (debout : vrille) | vrille |
| ✕ | Espace / Entrée | sauter (×2 : salto) | sauter | se lever / sauter (surf) | salto avant |
| □ | Q | monter à cheval / siffler le cheval | | looping | salto arrière |
| △ | E | appeler la monture volante | elle te cueille au galop | debout : se rasseoir | la monture vient te rattraper |
| ◯ | R | | descendre | plonger dans le vide | |
| OPTIONS | Échap / P | menu | menu | menu | menu |

## La course d'anneaux
Envole-toi et passe dans l'anneau vert **DÉPART** au-dessus du château. Le chrono démarre ; suis l'anneau doré (une flèche jaune t'indique le suivant). 17 anneaux, arrivée en rouge au-dessus du donjon.
Médaille d'or, d'argent ou de bronze selon le temps, plus des écus. **La médaille d'or débloque l'Aigle d'Or.** Record et récompenses sont sauvegardés dans le navigateur.

## Modifier le jeu
```
npm install
npm run dev           # http://localhost:5173, rechargement auto à chaque modification
node build.mjs        # régénère dist/aeriea.html
```
Code (Three.js 0.180) : `src/main.js` (jeu, montures, figures), `src/world.js` (terrain, château, village, forêts, herbe, nuages), `src/textures.js` (textures procédurales), `src/dragon.js` (dragon procédural). Vercel lance `npm run build` et publie `dist/`.

## Crédits des assets (gratuits)
- Chevalier animé (75 animations) : **KayKit Character Pack: Adventurers** par Kay Lousberg, licence CC0. https://kaylousberg.itch.io/kaykit-adventurers
- Cheval et cigogne animés (la cigogne est recolorée en aigle) : modèles des exemples officiels de **three.js** (créés par mirada pour « ROME: 3 Dreams of Black »), licence MIT du dépôt three.js. https://github.com/mrdoob/three.js
- Paladin (personnage joueur) : « Paladin J Nordstrom » publié par mand0fam sur Sketchfab, licence CC-BY 4.0 (personnage d'origine Adobe Mixamo). https://sketchfab.com/3d-models/e6014cae74bd437f8677612bed49c049
- Le Roi en armure : « Armored King » par Calviking073, licence CC-BY 4.0. https://sketchfab.com/3d-models/e3978fb660cf47278485d44eeba488ef
- Cri de rapace : « Screaming Hawk » par PsychoBird, CC BY 3.0 ; appel de buse à queue rousse par Jonathon Jongsma (xeno-canto XC71575), CC BY-SA 3.0, via Wikimedia Commons.
- Aigle royal : « White Eagle Animation Fast Fly » par GremorySaiyan ; pygargue : « Bald Eagle » par ucdavisterc ; dragon : « Flint Maw » par Spinnee — Sketchfab, licence CC-BY 4.0.
- Musiques (licence CC-BY 4.0 sauf mention) :
  - « Song of the Forge », « Path Through the Mountains », « Icarus », « Goliath » — Scott Buckley, https://www.scottbuckley.com.au
  - « Adventure », « Magic Tavern » — Alexander Nakarada, https://www.creatorchords.com
  - « Middle Earth » — Luis Humanoide (libre de droits, crédit demandé), https://youtu.be/delK8nKRvUU
  Fichiers dans public/music (servis à côté du jeu).
- Polices : Cinzel, Barlow et Barlow Condensed (SIL Open Font License).
- Terrain, textures, château, village, moulin, arbres, herbe, nuages, dragon, sons : générés par le code.
