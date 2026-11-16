import {readFile,writeFile} from 'node:fs/promises';
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
const core=(await readFile(new URL('./core.js',import.meta.url),'utf8')).replace(/\bexport /g,'');
const app=(await readFile(new URL('./app.js',import.meta.url),'utf8')).replace(/^import .*from '\.\/core\.js';\r?\n/m,'');
const result=html.replace('<script type="module" src="./app.js"></script>','<script type="module">\n'+core+'\n'+app+'\n</script>');
await writeFile(new URL('./whitebox-studio.html',import.meta.url),result,'utf8');
console.log('Built whitebox-studio.html: open directly in a browser (online Three.js dependency).');
