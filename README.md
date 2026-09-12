# Haircut Style Demo

Base técnica de la demo web y de reservas para Haircut Style, desarrollada por Jaume AI Solutions.

## Requisitos

- Node.js 22 o superior
- pnpm 11

## Desarrollo local

```bash
pnpm install
pnpm dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

## Conexión con Supabase

El proyecto usa el cliente oficial `@supabase/supabase-js` y solo necesita la
URL del proyecto y su clave publicable. No uses una `secret key` ni una clave
`service_role` en esta aplicación.

1. Copia `.env.example` como `.env.local`.
2. Sustituye los dos marcadores por `Project URL` y `Publishable key` desde el
   panel **Connect** de tu proyecto de Supabase.
3. Reinicia `pnpm dev` después de cambiar las variables.

`.env.local` está ignorado por Git. Las variables de Supabase llevan el prefijo
`NEXT_PUBLIC_` porque la clave publicable está diseñada para código cliente; la
protección de los datos debe aplicarse con Row Level Security (RLS) en Supabase.
El email de confirmación necesita además `RESEND_API_KEY` y
`RESEND_FROM_EMAIL`. Son variables exclusivas del servidor y nunca deben llevar
el prefijo `NEXT_PUBLIC_`. El remitente debe pertenecer a un dominio verificado
en Resend.

Hay clientes preparados para componentes de navegador y servidor en
`src/lib/supabase/`. La ruta `GET /api/supabase/health` realiza una lectura
limitada de `public.services`, no devuelve datos ni credenciales y permite
comprobar la conexión. Para responder correctamente, esa tabla debe existir y
permitir `SELECT` al rol correspondiente mediante RLS.

La ruta
`GET /api/availability?professionalId=1&serviceId=1&date=2026-09-07` calcula
los periodos disponibles de un profesional activo y genera los inicios
reservables con la duración real del servicio. Aplica, en este orden, el horario
semanal, los horarios excepcionales y los bloqueos activos. Si se omite
`serviceId`, devuelve solo los periodos disponibles. Todavía no lee ni crea
reservas.

La sección pública `#reservar` consulta
`GET /api/booking-calendar?professionalId=1&serviceId=1&month=2026-09` para
mostrar un mes de disponibilidad real. `professionalId=any` combina los huecos
de los profesionales activos que realizan el servicio: una hora aparece cuando
al menos uno puede atenderla. El calendario bloquea fechas pasadas, domingos,
días sin huecos y fechas posteriores a `max_booking_days_ahead` de
`public.business_settings`. Seleccionar una hora muestra el resumen y el
formulario obligatorio de nombre, teléfono y email.

La creación real usa `POST /api/reservations`. El navegador envía únicamente la
selección y los datos del cliente; el endpoint invoca
`public.create_public_reservation_with_management`, que delega la creación atómica en
`public.create_public_reservation`. Supabase vuelve a comprobar el servicio, el
profesional, el horario, los bloqueos, las excepciones y las reservas
solapadas. La función obtiene de nuevo el nombre, precio y duración del servicio
para guardar el snapshot y genera el `management_token` con 32 bytes aleatorios.
Si se eligió `Cualquiera`, asigna entre los profesionales libres al que tenga
menor carga para ese día.

Después de que Supabase confirme la reserva, la ruta envía desde el servidor el
email de confirmación mediante Resend usando los datos guardados. Cada intento
crea un registro `pending` en `public.email_logs`: pasa a `sent` con el
identificador de Resend y la fecha de envío, o a `error` con un mensaje
sanitizado. El mismo estado se refleja en `public.reservations.email_status`. Un
fallo del email no cancela ni borra la reserva y la respuesta al cliente sigue
siendo de reserva confirmada.

La migración
`supabase/migrations/2026091201_reservation_confirmation_emails.sql` mantiene RLS,
revoca el acceso directo a `public.email_logs` y expone únicamente dos RPC
limitadas. La primera crea la reserva y su log pendiente; la segunda solo puede
registrar el resultado si recibe el token aleatorio de un único envío. En la
base se conserva únicamente el hash de ese token y nunca se expone el
`management_token` de la reserva.

La migración
`supabase/migrations/2026091202_public_calendar_and_client_cancellation.sql`
añade la consulta pública limitada por `management_token`, la cancelación atómica
en servidor, el evento y la notificación correspondientes, y el registro del
email de cancelación. Las tablas siguen sin permitir escritura directa a
`anon` ni `authenticated`. El archivo `.ics` se genera bajo demanda a partir de
la reserva guardada y no accede al calendario personal del cliente.

La migración
`supabase/migrations/20260912_atomic_public_reservations.sql` mantiene RLS,
revoca el acceso directo de `anon` a `public.reservations` y expone solo dos RPC
limitadas: una creación atómica validada y una lectura de intervalos ocupados
sin datos personales. La restricción de exclusión
`reservations_no_professional_overlap` impide en la propia base de datos que dos
reservas activas se solapen para el mismo profesional, incluso si las peticiones
llegan simultáneamente.

La política mínima de lectura para la configuración pública está documentada
en `supabase/policies/public-business-settings.sql`. Mantiene RLS activo y solo
expone las columnas necesarias para dibujar el calendario.

## Comprobaciones

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Base actual

- Next.js con App Router y carpeta `src/`
- TypeScript en modo estricto
- ESLint con las reglas recomendadas de Next.js
- Cliente de Supabase preparado para la futura lógica de reservas
