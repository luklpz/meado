# Log — Meado

Registro cronológico de cambios. Cada entrada nueva va arriba. Formato:

```
## YYYY-MM-DD — Título breve

- **Archivo(s):** ruta(s) tocada(s)
- **Qué:** qué cambió
- **Por qué:** motivo
- **Despliegue:** pendiente | subido
```

---

## Archivos desincronizados (local vs producción)

Tabla viva — actualizar cada vez que se despliega o se detecta drift.

| Archivo | Estado local | Estado producción | Notas |
|---|---|---|---|
| `apps/frontend/src/lib/livekit.ts` | modificado, sin commit | versión anterior (reconnectPolicy `as any`) | cambio a `DefaultReconnectPolicy` de livekit-client, pendiente de commit y deploy |

---

## Entradas

## 2026-08-01 — Metodología de trabajo: log.md + rename documentación

- **Archivo(s):** `documentacion.md` (renombrado desde `DOCUMENTACIÓN.md`), `log.md` (nuevo), `objetivos.md`
- **Qué:** Renombrado `DOCUMENTACIÓN.md` → `documentacion.md` (referencias internas actualizadas). Creado `log.md` como registro cronológico + tabla de archivos desincronizados.
- **Por qué:** Adopción de metodología de 3 documentos vivos (log/objetivos/documentacion) para persistencia de contexto entre sesiones, acordada con el usuario.
- **Despliegue:** pendiente (solo documentación, no afecta build)
