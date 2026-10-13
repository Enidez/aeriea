import * as esbuild from 'esbuild'; import fs from 'fs'; import { fontCss } from './fonts.mjs';
const r = await esbuild.build({ entryPoints:['src/main.js'], bundle:true, minify:true, format:'iife', loader:{'.glb':'binary','.mp3':'binary'}, write:false, target:'es2020' });
const js = r.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html = fs.readFileSync('src/index.html','utf8').replace('/*FONTS*/', fontCss()).split('<script>/*BUNDLE*/</script>').join('<script>'+js+'</script>');
fs.mkdirSync('dist',{recursive:true}); fs.cpSync('public','dist',{recursive:true}); fs.writeFileSync('dist/aeriea.html', html); fs.writeFileSync('dist/index.html', html); console.log('ok', (html.length/1e6).toFixed(2),'MB');
const art = html.replace(/<!doctype html>\s*<html[^>]*><head>/i,'').replace(/<\/head><body>/i,'').replace(/<\/body><\/html>\s*$/i,'');
fs.writeFileSync('dist/artifact.html', art); console.log('artifact', art.slice(0,200).replace(/\n/g,' '));
