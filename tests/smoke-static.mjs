import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const required = [
  'index.html',
  'styles.css',
  'app.js',
  'src/content.js',
  'manifest.webmanifest',
  'service-worker.js',
  'assets/cover.jpeg',
  'assets/og-image.jpg',
  'assets/icons/favicon.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'docs/audit.md',
  '.nojekyll'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function text(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

for (const file of required) {
  assert(fs.existsSync(path.join(root, file)), `Falta archivo requerido: ${file}`);
}

new Function(text('app.js'));
new Function(text('src/content.js'));
new Function(text('service-worker.js'));

const sandbox = { window: {} };
vm.runInNewContext(text('src/content.js'), sandbox);
const data = sandbox.window.EVANGELIO_DATA;
assert(data && Array.isArray(data.chapters), 'EVANGELIO_DATA no contiene chapters.');
assert(data.appVersion === '1.2.0-final-github', 'Versión de contenido incorrecta.');
assert(data.chapters.length === 45, 'El grimorio debe conservar 45 secciones.');
assert(data.chapters.length === data.stats.chapters, 'stats.chapters no coincide con chapters.length.');
assert(data.chapters.every(chapter => !('locked' in chapter)), 'No debe haber capítulos bloqueados.');
assert(data.stats.words >= 45000, 'El grimorio completo debería conservar más de 45.000 palabras.');
assert(Array.isArray(data.lore) && data.lore.length >= 8, 'Códice insuficiente.');
assert(Array.isArray(data.symbols) && data.symbols.length >= 6, 'Símbolos insuficientes.');
assert(data.externalLinks?.length === 0, 'No debe haber enlaces externos en los datos.');

const html = text('index.html');
const css = text('styles.css');
const app = text('app.js');
const content = text('src/content.js');
const readme = text('README.md');
const audit = text('docs/audit.md');
const allText = [html, css, app, content, readme, audit].join('\n');

const localRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => !ref.startsWith('#') && !/^https?:\/\//.test(ref));
for (const ref of localRefs) {
  assert(fs.existsSync(path.join(root, ref.split('?')[0])), `Referencia local rota: ${ref}`);
}

assert(!/<script[^>]+src="https?:\/\//i.test(html), 'No debe haber scripts externos.');
assert(!/<link[^>]+href="https?:\/\//i.test(html), 'No debe haber estilos externos.');
assert(/Content-Security-Policy/.test(html), 'Falta Content-Security-Policy.');
assert(/frame-ancestors 'none'/.test(html), 'CSP debería bloquear iframes externos.');
assert(/@media \(max-width: 980px\)/.test(css), 'Falta responsive tablet/móvil.');
assert(/@media \(max-width: 640px\)/.test(css), 'Falta responsive móvil compacto.');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicatedIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert(duplicatedIds.length === 0, `Hay IDs duplicados: ${[...new Set(duplicatedIds)].join(', ')}`);

const viewNames = new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]));
const routeNames = new Set([...html.matchAll(/data-route="([^"]+)"/g)].map(match => match[1]));
for (const route of routeNames) {
  assert(viewNames.has(route), `Ruta sin vista asociada: ${route}`);
}

const manifest = JSON.parse(text('manifest.webmanifest'));
assert(manifest.name === 'El Evangelio del Nombre Devorado', 'Nombre de manifest incorrecto.');
assert(manifest.icons?.length >= 2, 'Manifest sin iconos suficientes.');
for (const icon of manifest.icons) {
  assert(fs.existsSync(path.join(root, icon.src)), `Icono de manifest no encontrado: ${icon.src}`);
}

const saleHost = ['ama', 'zon'].join('');
const saleVerb = ['com', 'prar'].join('');
const oldExternalId = ['B0G', 'RTN', 'TNRZ'].join('');
const externalSalePattern = new RegExp(saleHost + '|' + oldExternalId + '|' + saleVerb + '|leer en ' + saleHost, 'i');
assert(!externalSalePattern.test(allText), 'Quedan restos de venta externa.');
assert(!/\bdemo\b|capítulo reservado|contenido reservado|muestra pública/i.test(content + html), 'Quedan restos de demo/reservado.');
assert(!/no es [^.;]{1,90}sino|no era [^.;]{1,90}sino|no fue [^.;]{1,90}sino/i.test(content), 'Quedan fórmulas mecánicas no es/no era/no fue X sino Y.');
assert(!/\bcomo si\b/i.test(content), 'Quedan comparativas mecánicas con "como si" en el texto literario.');
assert(!/\"Ahora[^\"]{0,80}\"/.test(content), 'Quedan párrafos literarios que arrancan con Ahora.');
assert(/const CACHE_NAME = 'evangelio-devorado-v1\.2\.0'/.test(text('service-worker.js')), 'Cache PWA no está en v1.2.0.');

console.log('Smoke test OK: proyecto estático final listo para GitHub Pages.');
