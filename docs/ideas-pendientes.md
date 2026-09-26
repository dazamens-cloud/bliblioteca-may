# Ideas pendientes

Cosas que han salido hablando y se han dejado para más adelante. Ninguna está empezada.

## Acceso rápido y QR

- **Enlace directo** `…/bliblioteca-may/#escanear`: abre la app en Añadir con la cámara
  ya encendida. Es la base de todo lo demás.
- **Acceso rápido en el icono** (`shortcuts` en `manifest.json`): en Android, al mantener
  pulsado el icono de la app sale «Escanear libro».
- **QR**, según para qué:
  - pegado en la estantería, para ir directo a escanear un libro nuevo;
  - en Perfil y ajustes en el PC, para abrir la app en el móvil;
  - para instalar la app en otro móvil sin pasar el enlace.

## Aspecto en el PC

La cabecera y la barra de abajo ocupan todo el ancho mientras el contenido va centrado
(640 px), y el texto de la lista pasa por detrás de la barra. En el móvil no pasa.
Arreglo: centrar la cabecera y la barra con el mismo ancho que el contenido.

## Funciones de BiblioCasa que necesitan datos nuevos

Fuera del rediseño Noche porque obligan a guardar información que hoy no se guarda:

- racha de días leyendo y tiempo medio de lectura (registrar cada sesión);
- género del libro;
- formato (tapa dura, bolsillo…) y fecha de compra;
- citas y notas al margen;
- «Avisarme» cuando salga un tomo nuevo de una saga.

## Abrir la app a más gente

Hoy cada casa necesita su propio Apps Script. Para que la use cualquiera haría falta un
backend de verdad (por ejemplo Firebase o Supabase), registro con correo o Google en
vez de PIN, cuidar la privacidad de los datos y más cuota de Google Books.
El diseño, las pantallas, la detección de sagas y Actividad se aprovechan tal cual.
