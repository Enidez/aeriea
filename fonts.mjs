// Polices (licence OFL) intégrées en base64 : le jeu reste un seul fichier, jouable hors ligne.
import fs from 'fs';
const F = [
  ['Cinzel', 'cinzel/files/cinzel-latin-700-normal', 700, 'normal'], ['Cinzel', 'cinzel/files/cinzel-latin-900-normal', 900, 'normal'],
  ['Barlow Condensed', 'barlow-condensed/files/barlow-condensed-latin-700-normal', 700, 'normal'], ['Barlow Condensed', 'barlow-condensed/files/barlow-condensed-latin-800-italic', 800, 'italic'],
  ['Barlow Condensed', 'barlow-condensed/files/barlow-condensed-latin-900-italic', 900, 'italic'],
  ['Barlow', 'barlow/files/barlow-latin-500-normal', 500, 'normal'], ['Barlow', 'barlow/files/barlow-latin-600-normal', 600, 'normal'],
];
export const fontCss = () => F.map(([fam, f, w, st]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(`node_modules/@fontsource/${f}.woff2`).toString('base64')}) format('woff2')}`).join('\n');
