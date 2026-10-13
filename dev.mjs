// Serveur de développement : http://localhost:5173, rebuild + rechargement auto à chaque modification de src/.
import * as esbuild from 'esbuild'; import fs from 'fs'; import { fontCss } from './fonts.mjs';
const PORT = Number(process.env.PORT) || 5173;
const writeHtml = () => {
  const html = fs.readFileSync('src/index.html', 'utf8').replace('/*FONTS*/', fontCss()).split('<script>/*BUNDLE*/</script>')
    .join('<script src="main.js"></script><script>new EventSource("/esbuild").addEventListener("change",()=>location.reload())</script>');
  fs.mkdirSync('.dev', { recursive: true }); fs.writeFileSync('.dev/index.html', html);
};
writeHtml(); fs.watch('src/index.html', writeHtml); fs.cpSync('public', '.dev', { recursive: true });
const ctx = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', loader: { '.glb': 'binary', '.mp3': 'binary' }, outdir: '.dev', sourcemap: true, target: 'es2020', logLevel: 'info' });
await ctx.watch();
await ctx.serve({ servedir: '.dev', port: PORT});
console.log(`Aériea en dev : http://localhost:${PORT}`);
