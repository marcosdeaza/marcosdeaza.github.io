# marcosdeaza.github.io

Portfolio de Marcos de Aza. Sitio estático en español (`/`) e inglés (`/en/`), generado a partir de los repositorios públicos de GitHub.

## Cómo se actualiza

Una acción comprueba cada 10 minutos si alguno de los repositorios públicos ha recibido un push. Si es así, vuelve a leer solo los commits de esos repositorios y publica el sitio de nuevo; si no, no hace nada.

- Un repositorio público nuevo aparece solo en el Archivo.
- La acción guarda `data/github.json` con un commit propio: haz `git pull --rebase` antes de subir cambios.
- Para destacarlo en Proyectos, añádele el topic `portfolio` en GitHub. Usará su descripción, su lenguaje y su web.
- Para escribir el texto a mano en los dos idiomas, añade una entrada en `featured` dentro de `content/site.json`.
- Para ocultar uno, añade su nombre a `hidden`. Los que llevan el topic `university` van al grupo Universidad.

El reloj de la portada cuenta los commits propios por franja de 20 minutos, en hora de Valencia. Los commits de bots y agentes no cuentan.

## En local

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
python3 -m http.server 4719 --directory dist
```

`node scripts/build.mjs --offline` regenera el HTML con los datos guardados en `data/github.json`, sin llamar a la API.

## Piezas

- `content/site.json`: textos, proyectos destacados y ajustes.
- `scripts/build.mjs`: lee GitHub y genera `dist/`.
- `src/`: estilos, script de la aguja, favicon y fuentes (Castoro, Castoro Titling, Michroma y B612 Mono, todas con licencia OFL).
