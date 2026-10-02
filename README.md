# marcosdeaza.github.io

Portfolio de Marcos de Aza. Sitio estático en español (`/`) e inglés (`/en/`), generado a partir de los repositorios públicos de GitHub.

## Cómo se actualiza

Una acción se ejecuta cada hora, lee los repositorios públicos y sus commits, y vuelve a publicar el sitio si algo ha cambiado.

- Un repositorio público nuevo aparece solo en el Archivo.
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
