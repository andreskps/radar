# Fixtures de Instagram

Respuestas reales de la web de Instagram (22-11-2026, perfil público @attoperfumes), recortadas para las pruebas:
- `profile.json`: `PolarisProfilePageContentQuery` (`data.user`)
- `timeline.json`: `PolarisProfilePostsTabContentQuery_connection` (4 nodos: reel fijado y viejo, reel, carrusel, reel con likes ocultos)
- `reels.json`: `PolarisProfileReelsTabContentQuery_connection` (3 reels con `play_count`, sin `taken_at`)

Limpieza: sin datos de la cuenta que hizo la lectura (`viewer`, `friendship_status`, `has_liked` en false), sin listas de otros usuarios, URLs firmadas reemplazadas por `https://example.invalid/img.jpg`, teléfonos reemplazados por números falsos, cursores ficticios. Solo se dejaron los campos que usa el lector y algunos de contexto.
