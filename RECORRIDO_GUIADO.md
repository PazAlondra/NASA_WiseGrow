# Recorrido guiado de Agroclimatic

## Ejecutar en VS Code

Abre la carpeta `PROYECTO_NASA/frontend` en una terminal y ejecuta:

```powershell
npm ci
npm run dev
```

Abre la dirección que imprime Vite. Usa una versión de Node compatible con Vite 8 (Node 22.12 o posterior; se comprobó con Node 24).
No se añadieron dependencias para el recorrido. El ZIP no incluye node_modules ni dist: se regeneran con npm ci y npm run build.

## Uso

- En la primera visita aparece una invitación opcional. “Ahora no” la oculta.
- El botón “Recorrido guiado” permite iniciarlo de nuevo en cualquier momento.
- Incluye 13 pasos: inicio, estado, temas, parcela, suelo, cultivos, validación, mapa, indicadores, gráfica, filtros, calendario y guía.
- Anterior y Siguiente cambian de paso. Terminar, × o Escape devuelven a la ruta inicial.
- Mientras está abierto, el recorrido bloquea los controles de la página para evitar cambios accidentales. Sal de él para completar los campos.
- El cuestionario conserva sus respuestas al navegar durante la sesión. No se guardan en un servidor ni después de recargar.
- Solo se guarda localmente si ya se vio la invitación. Si el almacenamiento no está disponible, el recorrido sigue funcionando.

## Personalización

- `frontend/src/components/tour/steps.js`: rutas, destinos, títulos y explicaciones.
- `frontend/src/components/tour/GuidedTour.jsx`: navegación, foco de teclado, ubicación del globo y avatar provisional.
- `frontend/src/components/tour/GuidedTour.css`: estilos adaptables, resaltado y globo.
- `data-tour` identifica cada elemento resaltado; conserva estos atributos al modificar las páginas.
- El emoji dentro de `.agro-tour-avatar` es provisional. Ahí se integrarán las animaciones cuando estén listas. La posición del globo se calcula en la interfaz.
- `frontend/src/pages/Questionnaire/initialData.js`: datos iniciales del cuestionario, cuyo estado ahora reside en AppLayout.

## Alcance

Es un recorrido guiado programado, no un chat con IA. El ChatWidget anterior sigue siendo una ayuda de respuesta fija.
Los textos diferencian los indicadores y ventanas ilustrativos de los datos reales. No ejecutan análisis ni prometen recomendaciones disponibles.
El mapa conserva sus capas NASA GIBS y su cuadrícula de demostración original.
Al cambiar de ruta, otros controles locales como filtros del calendario conservan el comportamiento original: pueden reiniciarse. La conservación de respuestas añadida corresponde al cuestionario.

## Validación

- `npm run build`: correcto.
- `npm run lint`: sin errores; queda una advertencia preexistente en el efecto de geolocalización de App.jsx.
- Prueba de DOM: los 13 destinos y rutas, avance, retroceso, finalización, salida con Escape, bloqueo y liberación del fondo, retorno a la ruta inicial y conservación de la superficie del cuestionario pasaron sin errores de ejecución.
- No fue posible iniciar Chromium en el entorno de desarrollo. La comprobación visual en navegador, incluida la posición del globo en móvil, queda pendiente.
