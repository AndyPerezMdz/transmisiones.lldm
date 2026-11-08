# Cabina en Vivo

Proyección para el templo que **escucha al expositor** y te sugiere en el momento la cita bíblica, el himno, el coro o el tema que mencionó. Presionas **Enter** y sale en las TVs y como banner en la transmisión de OBS.

Nada sale al aire sin que el operador lo confirme.

- **Cabina** (`/control`): voz, sugerencias, buscador rápido y control de lo que está al aire.
- **Pantalla** (`/pantalla`): la salida para las TVs (HDMI).
- **Overlay** (`/overlay`): el banner con fondo transparente para OBS.
- **Cantos** (`/cantos`): captura, edición e importación del himnario y los coros.

Es un sitio estático (sin build) en Vercel, con Supabase para la base de datos, el inicio de sesión y el tiempo real.

## Cómo se sincroniza

| De → a | Medio | ¿Necesita internet? |
| --- | --- | --- |
| Cabina → TVs en la **misma computadora** | `BroadcastChannel` del navegador | No |
| Cabina → OBS u otra computadora | Supabase Realtime (y una consulta cada 15 s como respaldo) | Sí |

Si se cae el internet a media reunión, las TVs conectadas a la laptop siguen funcionando.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en https://supabase.com.
2. En **SQL Editor**, pega todo `supabase/todo.sql` y presiona **Run**. Se puede correr las veces que quieras; cuando haya cambios nuevos, vuelve a correrlo. Si usas el CLI, `supabase db push` aplica lo mismo desde `supabase/migrations/`.
3. En **Authentication → Sign In / Providers → Email**, deja activados *Allow new users to sign up* y *Confirm email*. Cualquiera se puede registrar, pero quien no esté invitado a un equipo no ve nada.
4. En **Authentication → URL Configuration**, pon en *Site URL* la dirección de tu sitio en Vercel y agrega `https://tu-sitio/**` en *Redirect URLs* (para que los correos de confirmación y de "Olvidé mi contraseña" regresen ahí).
5. Regístrate en el sitio, confirma tu correo, entra y crea tu equipo (la congregación). Desde **Equipo** invitas a los demás por correo.
6. En **Project Settings → API**, copia la *Project URL* y la *publishable key* (o la *anon key* antigua) a `public/config.js`.
   La publishable key está hecha para ir en el navegador. **Nunca** pongas la *secret* / `service_role` key en el repo.

### Correos (obligatorio para que otros se registren)

Sin esto, Supabase **solo manda correos a las personas de tu organización en Supabase y como máximo 2 por hora**: nadie más recibiría la confirmación de registro ni el enlace de "Olvidé mi contraseña".

1. Crea una cuenta gratis en un servicio de correo, por ejemplo [Brevo](https://www.brevo.com) o [Resend](https://resend.com), y verifica el correo o dominio desde el que vas a mandar.
2. Copia los datos SMTP que te dan: servidor, puerto, usuario y contraseña (o llave).
3. En Supabase: **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*, pega los datos y pon como remitente algo como `Cabina en Vivo <no-responder@tu-dominio>`.
4. En **Authentication → Rate Limits**, sube el límite de correos por hora (por ejemplo, a 30).
5. Opcional: en **Authentication → Emails → Templates** traduce los mensajes de *Confirm signup* y *Reset password* al español.

### Que Supabase no se duerma

El plan gratis pausa el proyecto tras una semana sin actividad. El archivo `.github/workflows/despertar-supabase.yml` hace una consulta pequeña cada día desde GitHub Actions; no hay que configurar nada, solo tener el repo en GitHub. Puedes probarlo en la pestaña **Actions → Despertar Supabase → Run workflow**. (GitHub apaga las tareas programadas de repos que pasan 60 días sin cambios; si pasa, se vuelve a activar desde esa misma pestaña.)

### 2. Vercel

1. Sube el repo a GitHub.
2. En Vercel: **Add New → Project**, importa el repo y despliega. No necesita nada más, porque `vercel.json` ya indica que no hay build y que la carpeta es `public/`.

### 3. En el templo

1. Entra a tu sitio, inicia sesión y crea una **sala** (por ejemplo "Templo principal").
2. **Abrir cabina** en Chrome o Edge, en la pantalla de la laptop.
3. **Pantalla (TVs)**: ábrela en otra ventana, arrástrala a la salida HDMI (`Windows + P` → *Extender*) y presiona `F11`.
4. **OBS**: agrega una fuente *Navegador* con la dirección de OBS que aparece en la sala, a 1920 × 1080, encima de las cámaras.
5. **Micrófono**: conecta el receptor (por ejemplo DJI) por USB y elígelo como entrada en *Configuración → Sonido* de Windows. La primera vez, el navegador te pedirá permiso para usarlo.
6. **Cámaras desde celulares**: abre https://vdo.ninja en cada celular, elige *Add your camera to OBS* y pega el enlace *view* en una fuente *Navegador* de OBS.

## Uso

**Voz:** presiona **Escuchar** (`M`). Lo que se detecta aparece como tarjeta. Con `Enter` la pones al aire y con `Supr` la descartas. Si el expositor dice "versículo 18" sin repetir el libro, se usa el último libro y capítulo que mencionó.

**Buscador** (`/`):

| Escribes | Sale |
| --- | --- |
| `jn 3 16` · `juan 3:16-18` · `1co 13` | Cita (un versículo, un rango o el capítulo completo) |
| `h246` · `himno 246` | Himno |
| `c7` · `coro 7` | Coro |
| `t: La fe que vence` | Tema del culto |
| `un pedazo de letra` | Busca en títulos y letras |

**Teclas** (con el cursor fuera de los campos de texto): `→` / `Espacio` / `AvPág` para avanzar, `←` / `RePág` para regresar, `Esc` para limpiar, `B` para fondo, `O` para el banner de OBS y `U` para la ubicación.

## Cantos

En `/cantos` puedes capturarlos uno por uno o importar un archivo. Primero elige la pestaña Himnario o Coros, luego **Importar…**. Si un canto llega con un número que ya existe, se reemplaza.

**TXT**: cada canto empieza con `# número Título`, las estrofas se separan con una línea en blanco y la etiqueta va entre corchetes, que son opcionales:

```text
# 1 Mi primer canto
[Estrofa 1]
Primera línea
Segunda línea

[Coro]
Línea del coro
```

**JSON**: una lista de objetos. Se aceptan nombres en inglés o español:

```json
[{ "numero": 1, "titulo": "Mi primer canto", "letra": "Primera línea\nSegunda línea\n\n[Coro]\nLínea del coro" },
 { "number": 2, "title": "Otro", "sections": [{ "type": "chorus", "label": "Coro", "lines": ["..."] }] }]
```

## Desarrollo

```bash
npm install        # solo para pruebas y para actualizar supabase-js
npm run dev        # http://localhost:5173  (sin config.js arranca en modo demo)
npm test
npm run vendor     # vuelve a empaquetar public/vendor/supabase.js
```

El **modo demo** (`?demo`, o `config.js` vacío) funciona sin base de datos con tres cantos de prueba, y solo sincroniza ventanas del mismo navegador.

## Notas

- La voz usa el reconocimiento del navegador: necesita Chrome o Edge y conexión a internet.
- La Biblia incluida es la **Reina-Valera 1909**, que es de dominio público (`public/data/rv1909.json`).
- Equipos: cantos, salas y diseños pertenecen a un equipo y los comparten todos sus miembros. Los administradores invitan o quitan personas y crean salas; los miembros operan la cabina y editan cantos y diseño. Al entrar, se aceptan solas las invitaciones hechas a tu correo (ya confirmado).
- Seguridad: los cantos solo los ve su equipo. El estado de una sala (lo que se proyecta) lo puede leer cualquiera que tenga el enlace, porque es lo mismo que se ve en las TVs. Solo su equipo puede cambiarlo.

## Créditos

- **Himnario y coros base** (`public/data/catalogo-base/`): vienen de los recursos de [Proyector LLDM](https://github.com/HuriTolentino/ProyectorLLDM), de **Huri Tolentino**, bajo su licencia PolyForm Noncommercial 1.0.0 (copia en esa carpeta). Por eso esos catálogos solo se pueden usar y compartir **sin fines de lucro**. En la app se ofrecen como opción en **Cantos**; cada equipo decide si los agrega.
- **Biblia:** Reina-Valera 1909 (dominio público).
- **Fuentes:** licencias libres, ver `public/fonts/LICENCIAS.txt`.
- **Íconos:** [Lucide](https://lucide.dev) (licencia ISC).
