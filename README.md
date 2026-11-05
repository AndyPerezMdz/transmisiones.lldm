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
2. En **SQL Editor**, pega y ejecuta `supabase/migrations/20261105000000_inicio.sql`. Si usas el CLI, basta con `supabase db push`.
3. En **Authentication → Sign In / Providers → Email**, desactiva *Allow new users to sign up* para que nadie más pueda crear cuenta.
4. En **Authentication → Users → Add user**, crea tu usuario con correo y contraseña.
5. En **Project Settings → API**, copia la *Project URL* y la *publishable key* (o la *anon key* antigua) a `public/config.js`.
   La publishable key está hecha para ir en el navegador. **Nunca** pongas la *secret* / `service_role` key en el repo.

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
- Seguridad: los cantos solo los ve su dueño. El estado de una sala (lo que se proyecta) lo puede leer cualquiera que tenga el enlace, porque es lo mismo que se ve en las TVs. Solo el dueño puede cambiarlo.
