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
| `apps/frontend/src/lib/livekit.ts` | commiteado | versión anterior (reconnectPolicy `as any`) | pendiente de deploy a Vercel |

---

## Entradas

## 2026-08-01 — LiveKit: reconnectPolicy tipada correctamente

- **Archivo(s):** `apps/frontend/src/lib/livekit.ts`
- **Qué:** `reconnectPolicy` pasa de objeto plano forzado con `as any` (`{ maxRetries, minReconnectWait, maxReconnectWait }`, shape no soportado por el SDK) a `new DefaultReconnectPolicy([1000, 2000, 3000, 4000, 5000])`, clase real exportada por `livekit-client` que implementa `ReconnectPolicy`. 5 reintentos con backoff creciente en ms.
- **Por qué:** el objeto anterior no era el shape real esperado por el SDK — probablemente ignorado o roto en runtime, enmascarado por `as any`. Con `DefaultReconnectPolicy` la reconexión usa la política real soportada, sin type-cast falso.
- **Despliegue:** pendiente (Vercel)

## 2026-08-01 — Metodología de trabajo: log.md + rename documentación

- **Archivo(s):** `documentacion.md` (renombrado desde `DOCUMENTACIÓN.md`), `log.md` (nuevo), `objetivos.md`
- **Qué:** Renombrado `DOCUMENTACIÓN.md` → `documentacion.md` (referencias internas actualizadas). Creado `log.md` como registro cronológico + tabla de archivos desincronizados.
- **Por qué:** Adopción de metodología de 3 documentos vivos (log/objetivos/documentacion) para persistencia de contexto entre sesiones, acordada con el usuario.
- **Despliegue:** pendiente (solo documentación, no afecta build)
