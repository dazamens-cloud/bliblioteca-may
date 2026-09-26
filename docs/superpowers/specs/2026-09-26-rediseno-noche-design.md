# Rediseño «Noche»: diseño

Fecha: 2026-09-26. Estado: aprobado en conversación, pendiente de plan de implementación.

Maquetas de referencia (privadas del dueño del repo):

- Tema noche y pergamino, pantalla Biblioteca: https://claude.ai/artifact/P4zcTMna5JJpEF5iByqW7Z
- Sagas, Añadir y Actividad: https://claude.ai/artifact/C9LRFQG3jmr62BH3hyUPt1
- Fondo de constelaciones (prueba de fluidez): https://claude.ai/artifact/9iZZLRnhs7oTV8ycCx83V3

## Objetivo

Cambiar el aspecto de toda la app y añadir una pantalla de **Actividad**. La
estructura de las pantallas sigue la de la app de ejemplo BiblioCasa: listas con
mucha información por libro, resúmenes con cifras, sagas con progreso. Los colores
son los del estilo «Grimorio», y detrás de todo hay un fondo animado de constelaciones.

No se añaden datos nuevos a los libros ni a las sagas. La única información nueva es
la meta del reto anual de cada perfil.

## Fuera de alcance

Racha de días, tiempo medio de lectura, género, formato de encuadernación, fecha de
compra, citas, notas al margen, avisos de tomos nuevos y rangos o niveles de lector.
Necesitan datos que la app no guarda. Se pueden añadir más adelante, por separado.

## 1. Aspecto

### Temas

- **Noche** (por defecto): fondo `#120f1c` con un degradado violeta `#2c2245` arriba,
  texto pergamino `#efe3c4` / `#b9a98a`, acento oro `#e2bf6a` / `#f3d98c`.
- **Pergamino**: fondo `#efe4cc` / `#f8f0dc`, texto sepia `#2e2213` / `#6b5638`,
  acento oro viejo `#8a5a17` / `#6d440c`.
- Selector en Ajustes: *Noche / Pergamino / Automático* (Automático sigue
  `prefers-color-scheme`: oscuro → noche, claro → pergamino). Se guarda en el
  dispositivo (`mb_tema`, común a todos los perfiles). El tema se aplica con un
  atributo `data-tema` en `<html>`, antes de pintar, para que no parpadee.
- Colores de estado, en los dos temas: leyendo = acento, leído = verde,
  prestado = coral, lo quiero = lila, por leer = texto tenue.
- `theme-color` del navegador y `manifest.json` pasan a los colores de noche.

Todos los colores van como variables en `:root` y cada tema las redefine. Los
componentes solo usan variables.

### Tipografía

- **Cinzel**: marca y etiquetas pequeñas en mayúsculas (cejas, secciones).
- **EB Garamond**: títulos de libros, sagas, cifras grandes y títulos de sección.
- **Figtree**: todo lo demás (interfaz, botones, texto).

Sustituyen a Newsreader y Plus Jakarta Sans. Los iconos siguen siendo Material Symbols.

### Tarjetas

Translúcidas: fondo del tema con alfa ~0,35 (noche) / ~0,4 (pergamino), desenfoque de
2 px y borde fino. El texto encima lleva una sombra muy suave del color del fondo
para que se lea aunque pase una línea de constelación por detrás. La tarjeta de
«Leyendo ahora» y los avisos son algo más opacos para destacar.

### Fondo de constelaciones (`cielo.js`, fichero nuevo)

Basado en el `network-background.js` que aportó el usuario, adaptado a móvil:

- Un `<canvas>` **fijo del tamaño de la pantalla** (no del documento). El scroll
  desplaza las estrellas a un 25 % de la velocidad del contenido (sensación de
  profundidad) y las que salen por un borde entran por el opuesto.
- 42 estrellas en móvil (`pointer: coarse` o ancho < 600 px), 75 en PC. Enlace entre
  estrellas a menos de 105 px (móvil) / 130 px (PC), con opacidad según la distancia.
- Brillo con una imagen precalculada (`drawImage`), no con `shadowBlur`.
  `devicePixelRatio` limitado a 2.
- Noche: estrellas oro y violeta con brillo. Pergamino: puntos de tinta sepia sin
  brillo y líneas más tenues. Cambia al cambiar de tema.
- Ratón: solo en PC, aparta las estrellas cercanas y dibuja líneas hasta ellas.
- Se detiene: con una ficha (modal) abierta, con la pestaña en segundo plano
  (lo hace `requestAnimationFrame`) y con `prefers-reduced-motion` (se dibuja un
  fotograma quieto).
- Expone `iniciarCielo(canvas)` y `pausarCielo(bool)`, y lee los colores de las
  variables CSS del tema.

## 2. Pantallas

Barra inferior: **Biblioteca · Sagas · + (Añadir) · Actividad**. Ajustes deja la barra
y se abre tocando el avatar de la cabecera.

### Cabecera (todas)

Logo, «Mi Biblioteca» con el nombre de la sección debajo (Cinzel), icono de
sincronización (el de ahora, mismo comportamiento) y **avatar** con la inicial del
perfil (sin perfil: icono de persona). El avatar abre Perfil y Ajustes.

### Biblioteca

1. Tres cifras: **En casa** (libros con *lo tengo*), **Leyendo**, **Leídos** (con
   «N este año» debajo).
2. Aviso «N libros te faltan · Sagas a medias: A, B y N más», si hay sagas
   incompletas. Lleva a la pantalla Sagas con el filtro «Te faltan».
3. **Leyendo ahora**: la tarjeta que ya existe (`tarjetaLeyendo`) con el aspecto
   nuevo: portada, saga y tomo, título, autor, «Pág. X de Y», barra, y los botones
   de páginas y de terminado que ya hay. Si hay varios libros en lectura, se muestran
   todos, en orden.
4. Filtros con contador (los de ahora) y buscador (el de ahora).
5. **Mi estantería**: lista. Cada fila: portada pequeña, arriba «Saga · tomo» y el
   estado a la derecha, título, autor, y abajo la ubicación (o «A {persona}» si está
   prestado, o «Aún no está en casa» si es *lo quiero*) y a la derecha la valoración
   en estrellas o las páginas.

### Sagas

1. Resumen: «N sagas en marcha · X completas · Y con tomos por reunir».
2. Filtros: Todas / Te faltan / Completas, y «+ Nueva» (el editor de ahora).
3. Cada saga: «Saga · N tomos», nombre, autor, etiqueta «Faltan N» o «✓ Completa»,
   barra y «X de N en casa · %». Debajo, la fila de tomos (la que ya existe en
   `estantesSaga`) con portada, «Tomo N · estado» y título. Los tomos que faltan son
   un hueco punteado con el número en romano y «+ Lo quiero» (usa `crearDesdeSaga`
   con *tengo = false*, que ya existe).
4. Tocar la saga abre su ficha, como ahora.

### Añadir

1. Pestañas **Escanear / Buscar / A mano**. Escanear muestra el visor (el escáner de
   ahora, con marco dorado); Buscar, los campos de ISBN y de título; A mano abre la
   ficha vacía.
2. Resultados de búsqueda: como ahora, con el aspecto nuevo.
3. Ficha de vista previa (la de `abrirPreview`), rediseñada en **tres pasos**:
   1. **Saga y tomo**: al abrir la ficha se busca la saga con la misma lógica que
      hoy se ejecuta después de guardar (`comprobarSaga`): primero entre las sagas
      guardadas y, si no está, fuera (`descubrirSaga`). Mientras tanto se lee
      «Buscando saga…», y se puede guardar sin esperar. Resultado:
      - **Saga ya guardada**: se rellena el nombre y el número de tomo, editable
        con − / +; se puede cambiar por otra guardada o quitar.
      - **Saga nueva encontrada fuera**: se muestra «Empíreo · 5 tomos
        (nueva)». Al guardar el libro se abre el editor de saga para revisar la
        lista antes de guardarla, igual que ahora: el usuario **siempre** revisa una
        saga descubierta.
      - **Nada**: «Sin saga», con opción de elegir una guardada.
   2. **¿Cómo lo tienes?**: Por leer / Leyendo / Ya leído, y Lo tengo / Lo quiero.
   3. **¿Dónde lo guardas?** (opcional): baldas conocidas como etiquetas y «+ Nueva».
   Además: ISBN editable con su comprobación (ya existe) y el aviso de duplicado.
   Botón «Guardar en mi biblioteca».
4. Tras guardar ya no se lanza la búsqueda de saga en segundo plano (ya se hizo en
   el paso 1); solo se abre el editor si la saga era nueva.

### Actividad (nueva)

1. Perfil: avatar grande, nombre del perfil y «N libros leídos · M en casa».
2. **Mi reto de {año}**: «X de META libros», barra y frase de ritmo:
   - por delante / justo / por detrás del ritmo, con los libros y meses que quedan;
   - «¡Reto cumplido!» si se ha llegado.
   El ritmo esperado es `meta × (día del año / días del año)`, redondeado.
   Botón «Cambiar meta» que despliega: número grande con − / +, barra deslizante de
   1 a 100 y «Guardar meta». Sin meta guardada, la tarjeta invita a ponerla.
3. Cuatro cifras: páginas leídas este año, libros leídos este año, autor más leído
   (entre todos los leídos) y sagas completas («X de N»).
4. Gráfico de libros terminados por mes del año actual (barras, meses futuros en
   gris). Un libro cuenta en el mes de su `fin`.
5. **Dónde están tus libros**: libros con *lo tengo* agrupados por ubicación
   (los que no tienen, en «Sin ubicación»), de más a menos, con barra; y una fila
   «Prestados».

«Leído este año» = `lectura === 'leido'` y `fin` empieza por el año actual. Los
leídos sin fecha cuentan en el total, pero no en el año ni en el gráfico.

### Perfil y Ajustes (se abre desde el avatar)

Lo que hay hoy en Ajustes (perfil, PIN, sincronizar, cambiar de perfil, copia de
seguridad) más el selector de tema. Con el aspecto nuevo.

### Ficha de un libro y ficha de una saga

Mismo contenido y comportamiento que ahora, con el aspecto nuevo.

## 3. Meta del reto: datos

- **Servidor** (`Code.gs`): la meta se guarda en una propiedad del script por perfil,
  `RETO_{perfil}`, con un JSON `{"2026": 20}` (una meta por año). No se crean
  pestañas nuevas en la hoja.
  - `doGet accion=todo` devuelve además `reto` (el objeto de ese perfil, `{}` si no hay).
  - `doPost accion=guardarReto` con `anio` y `meta` (entero de 1 a 100). Solo toca
    el perfil de la sesión.
- **App**: la meta se guarda también en el móvil (`mb_{perfil}_reto`) y se envía por
  la cola de siempre (`encolar`). Sin perfil, solo en el móvil.
- **Compatibilidad**: si el servidor aún es el antiguo y responde «accion
  desconocida» a `guardarReto`, ese envío se descarta y no bloquea la cola.
- **Despliegue**: `Code.gs` nuevo → nueva implementación → nueva URL en
  `URL_SCRIPT`. Como siempre, hay que crear una implementación nueva.

## 4. Organización del código

- `cielo.js` (nuevo): el fondo. Sin dependencias del resto.
- `actividad.js` (nuevo): cálculos de Actividad como funciones puras que reciben
  `libros` y `sagas` (`resumenAnio`, `porMes`, `autorMasLeido`, `reparto`, `ritmo`),
  y el render de la pantalla. Así se prueban sin navegador.
- `style.css`: se reescribe entero con las variables de los dos temas.
- `index.html`: cabecera, pantallas y barra nuevas; carga de fuentes nueva.
- `script.js`: cambian las plantillas de render y la navegación (Ajustes desde el
  avatar); la lógica de datos, la sincronización y los perfiles no cambian.
- `sw.js`: añadir `cielo.js` y `actividad.js` al `APP_SHELL`.

## 5. Pruebas

- Funciones de `actividad.js` con datos de ejemplo en Node: año actual, libros sin
  fecha, sin libros, reto cumplido y por detrás.
- `Code.gs` con los servicios de Google simulados (como con los perfiles):
  `guardarReto` válido, fuera de rango y de otro perfil sin clave; `todo` devuelve
  `reto`.
- Chromium a tamaño móvil: cada pantalla en los dos temas con datos de ejemplo,
  captura de cada una; cambiar de tema; cambiar la meta; añadir un libro con saga
  detectada y sin saga; que la cola no se bloquee con un servidor antiguo.
- Fluidez: medir fps del fondo en Chromium con la lista llena.
- Un único PR. El usuario fusiona después de desplegar el `Code.gs` nuevo.
