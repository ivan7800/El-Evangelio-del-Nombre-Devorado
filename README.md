# El Evangelio del Nombre Devorado

**El Evangelio del Nombre Devorado** es una app web estática/PWA para GitHub Pages basada en el grimorio homónimo de **I. Roig**.

Funciona como códice interno del Universo 404: lector ritual, archivo de símbolos, mapa literario, progreso local, skins visuales y ambiente sonoro generado en el navegador.

## Estado

Versión final: **v1.2.0-final-github**

- Lista para GitHub Pages.
- Sin backend.
- Sin dependencias externas.
- Sin analíticas.
- Sin enlaces externos de venta.
- Sin claves API.
- Funciona offline tras la primera carga mediante service worker.

## Contenido

- 45 secciones del grimorio.
- Más de 45.000 palabras.
- Versículos, fragmentos recuperados y apéndices.
- Códice de entidades, lugares y símbolos.
- Búsqueda local tolerante a tildes.
- Progreso, marcas y ajustes guardados en `localStorage`.
- Audio ambiental con WebAudio, sin archivos externos.

## Estructura

```text
.github/workflows/ci.yml
assets/
  cover.jpeg
  og-image.jpg
  icons/
docs/audit.md
src/content.js
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
package.json
tests/smoke-static.mjs
```

## Publicación en GitHub Pages

1. Crea un repositorio nuevo.
2. Sube todo el contenido de esta carpeta a la raíz del repositorio.
3. Entra en **Settings → Pages**.
4. Selecciona:
   - **Source:** Deploy from a branch
   - **Branch:** main
   - **Folder:** /(root)
5. Guarda y espera a que GitHub publique la URL.

## Verificación local

```bash
npm test
```

El test revisa estructura, sintaxis JS, manifest, rutas locales, contenido completo, ausencia de enlaces comerciales, ausencia de capítulos bloqueados y limpieza de frases mecánicas.

## Privacidad

La app no envía contenido a servidores. El progreso se guarda únicamente en el navegador del lector.

## Aviso editorial

El texto completo está incluido en `src/content.js`. Si el repositorio se publica como público, el grimorio completo quedará visible en GitHub.

## Derechos

El texto literario, portada, símbolos, personajes y universo narrativo pertenecen a **I. Roig**. Consulta `LICENSE` antes de reutilizar cualquier parte del proyecto.
