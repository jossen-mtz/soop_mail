# Fix: Correos Recibidos No Se Cuentan

## 🐛 Problema Identificado

El sistema **SÍ está recibiendo correos** (49 correos detectados con `relay=mail.mmbtransporte.com[private/dovecot-lmtp]`), pero la función de parsing en `backend/main.py` no los detecta correctamente.

### Causa Raíz
La función `sync_email_traffic()` (línea 2270) buscaba:
- `relay=local` ❌
- `relay=virtual` ❌
- `relay=lmtp` ⚠️ (parcial)
- `relay=dovecot` ❌

Pero el relay real es: **`relay=mail.mmbtransporte.com[private/dovecot-lmtp]`**

El código solo buscaba `relay=lmtp`, pero no coincidía con la cadena completa.

---

## ✅ Solución Aplicada

### Cambio en `backend/main.py` (línea 2270)

**ANTES:**
```python
elif any(r in line for r in ["relay=local", "relay=virtual", "relay=lmtp", "relay=dovecot"]):
    daily_counts[line_date]["received"] += 1
```

**DESPUÉS:**
```python
# Detectar correos recibidos por relay local/dovecot-lmtp o direcciones IP locales
elif any(r in line for r in ["relay=local", "relay=virtual", "relay=lmtp", "relay=dovecot", "private/dovecot-lmtp", "relay=127.0.0.1", "relay=[::1]"]):
    daily_counts[line_date]["received"] += 1
```

### Mejora en Logging (línea 2273)

**ANTES:**
```python
print(f"DEBUG SYNC: Parsed {len(lines)} lines. Counts grouped by date: {daily_counts}")
```

**DESPUÉS:**
```python
print(f"DEBUG SYNC: Parsed {len(lines)} lines from {target_log}")
print(f"DEBUG SYNC: Outgoing QIDs detected: {len(outgoing_qids)}")
print(f"DEBUG SYNC: Total unique QIDs processed: {len(qids_seen)}")
print(f"DEBUG SYNC: Counts grouped by date: {daily_counts}")
```

---

## 🚀 Cómo Aplicar el Fix

### Paso 1: Verificar el Cambio
```bash
# Ver las líneas modificadas
grep -n "private/dovecot-lmtp" /var/www/soop_mail/backend/main.py
```

Debería mostrar la línea 2270 con el nuevo código.

### Paso 2: Reiniciar la Aplicación
```bash
# Reiniciar el servicio
sudo systemctl restart soop_mail

# Verificar que inició correctamente
sudo systemctl status soop_mail

# Ver logs en tiempo real
sudo journalctl -u soop_mail -f
```

### Paso 3: Forzar Sincronización Manual
```bash
# Opción 1: Llamar al endpoint (necesitas estar autenticado)
curl -X GET "http://localhost:8000/api/mail/traffic" \
  -H "Authorization: Bearer TU_TOKEN_JWT"

# Opción 2: Esperar a que se sincronice automáticamente
# La función se ejecuta cada vez que se llama al endpoint /api/mail/traffic
```

### Paso 4: Verificar en la Base de Datos
```bash
mysql -u soop_mail -p soop_mail_db

# Dentro de MySQL:
SELECT date, sent_count, received_count 
FROM email_traffic 
ORDER BY date DESC 
LIMIT 10;

# Deberías ver:
# - sent_count: ~39 (correos a Gmail, Hotmail, etc.)
# - received_count: ~49 (correos a private/dovecot-lmtp)
```

### Paso 5: Probar el Script de Diagnóstico
```bash
# Dar permisos de ejecución
chmod +x test_mail_parsing.sh

# Ejecutar
sudo bash test_mail_parsing.sh
```

Deberías ver algo como:
```
Enviados detectados: 39
Recibidos detectados: 49
```

---

## 🔍 Verificación Detallada

### Ver Logs de Parsing
```bash
# Ver logs del último parsing
sudo journalctl -u soop_mail -n 100 | grep "DEBUG SYNC"
```

Salida esperada:
```
DEBUG SYNC: Parsed 10000 lines from /var/log/mail.log
DEBUG SYNC: Outgoing QIDs detected: 39
DEBUG SYNC: Total unique QIDs processed: 88
DEBUG SYNC: Counts grouped by date: {'2026-05-09': {'sent': 39, 'received': 49}}
```

### Verificar Tipos de Relay
```bash
# Ver todos los tipos de relay
sudo grep "status=sent" /var/log/mail.log | grep -oP 'relay=\S+' | sort | uniq -c

# Deberías ver:
#   49 relay=mail.mmbtransporte.com[private/dovecot-lmtp],
#   39 relay=gmail-smtp-in.l.google.com[...]:25,
#   (etc.)
```

### Comprobar que Coinciden
```bash
# Correos recibidos en el log
sudo grep "status=sent" /var/log/mail.log | grep "private/dovecot-lmtp" | wc -l
# Resultado esperado: 49

# Correos enviados en el log (a externos)
sudo grep "status=sent" /var/log/mail.log | grep -E "(gmail|hotmail|aspmx)" | wc -l
# Resultado esperado: 39
```

---

## 📊 Resultados Esperados

### Antes del Fix:
```sql
SELECT date, sent_count, received_count FROM email_traffic ORDER BY date DESC LIMIT 1;

+------------+------------+----------------+
| date       | sent_count | received_count |
+------------+------------+----------------+
| 2026-05-09 |     39     |       0        |  ← ❌ 0 recibidos
+------------+------------+----------------+
```

### Después del Fix:
```sql
SELECT date, sent_count, received_count FROM email_traffic ORDER BY date DESC LIMIT 1;

+------------+------------+----------------+
| date       | sent_count | received_count |
+------------+------------+----------------+
| 2026-05-09 |     39     |      49        |  ← ✅ 49 recibidos
+------------+------------+----------------+
```

---

## 🐛 Troubleshooting

### Problema: Aún muestra 0 recibidos después del fix

**Causa 1**: La aplicación no se reinició correctamente
```bash
sudo systemctl status soop_mail
# Si está en estado "failed" o "inactive":
sudo systemctl restart soop_mail
```

**Causa 2**: No se llamó al endpoint de sincronización
```bash
# Forzar sincronización
curl -X GET "http://localhost:8000/api/mail/traffic"
```

**Causa 3**: El cambio no se aplicó correctamente
```bash
# Verificar que la línea contiene "private/dovecot-lmtp"
grep -A2 -B2 "private/dovecot-lmtp" /var/www/soop_mail/backend/main.py

# Debería mostrar:
# elif any(r in line for r in ["relay=local", "relay=virtual", "relay=lmtp", 
#     "relay=dovecot", "private/dovecot-lmtp", "relay=127.0.0.1", "relay=[::1]"]):
#     daily_counts[line_date]["received"] += 1
```

### Problema: Los números no coinciden exactamente

**Causa**: La función usa QIDs únicos para evitar duplicados
```bash
# Ver QIDs únicos (no líneas totales)
sudo grep "status=sent" /var/log/mail.log | \
  grep "private/dovecot-lmtp" | \
  grep -oP '[A-F0-9]{10,15}:' | \
  sort -u | \
  wc -l
```

Esto es correcto: un correo puede tener múltiples líneas `status=sent`, pero solo se cuenta una vez por QID.

### Problema: Logs muy antiguos

**Causa**: La función solo lee las últimas 10,000 líneas
```bash
# Ver cuántas líneas tiene el log
wc -l /var/log/mail.log

# Si tiene más de 10,000 líneas, solo se procesan las últimas 10,000
```

**Solución**: Aumentar el límite en `backend/main.py` línea 2225:
```python
# CAMBIAR:
result = subprocess.run(['tail', '-n', '10000', target_log], ...)

# POR:
result = subprocess.run(['tail', '-n', '50000', target_log], ...)
```

---

## 📝 Notas Adicionales

### Tipos de Relay Detectados

El código ahora detecta correctamente:

| Tipo de Relay | Clasificación | Ejemplo |
|---------------|---------------|---------|
| `private/dovecot-lmtp` | ✅ Recibido | Entrega local a buzón |
| `relay=lmtp` | ✅ Recibido | Entrega LMTP |
| `relay=local` | ✅ Recibido | Entrega local |
| `relay=virtual` | ✅ Recibido | Buzón virtual |
| `relay=dovecot` | ✅ Recibido | Dovecot directo |
| `relay=127.0.0.1` | ✅ Recibido | Loopback IPv4 |
| `relay=[::1]` | ✅ Recibido | Loopback IPv6 |
| `relay=gmail-smtp-in.l.google.com` | ✅ Enviado | A servidor externo |
| `relay=aspmx.l.google.com` | ✅ Enviado | A servidor externo |

### Lógica de Clasificación

```python
# 1. Detectar correos ENVIADOS (tienen autenticación o vienen de localhost)
if "sasl_username=" in line or "client=localhost" in line or "client=127.0.0.1" in line:
    outgoing_qids.add(qid)

# 2. Al procesar status=sent:
if qid in outgoing_qids:
    # Es un correo ENVIADO
    sent_count += 1
else:
    # Si el relay es local/dovecot-lmtp, es RECIBIDO
    if "private/dovecot-lmtp" in line:
        received_count += 1
```

### Diferencia: Líneas vs QIDs Únicos

```bash
# Líneas totales con status=sent
sudo grep "status=sent" /var/log/mail.log | wc -l
# Puede ser: 150

# QIDs únicos (lo que cuenta la aplicación)
sudo grep "status=sent" /var/log/mail.log | grep -oP '[A-F0-9]{10,15}:' | sort -u | wc -l
# Será menor: 88

# Esto es correcto: un QID puede tener múltiples líneas status=sent
# (para múltiples destinatarios o reintentos)
```

---

## ✅ Checklist de Verificación

- [ ] Cambio aplicado en `backend/main.py` línea 2270
- [ ] Logging mejorado en línea 2273-2276
- [ ] Aplicación reiniciada (`sudo systemctl restart soop_mail`)
- [ ] Servicio en estado `active (running)`
- [ ] Endpoint `/api/mail/traffic` llamado
- [ ] Base de datos muestra `received_count > 0`
- [ ] Logs muestran `DEBUG SYNC` con números correctos
- [ ] Script de diagnóstico confirma detección

---

## 📞 Soporte

Si después de aplicar estos pasos los correos recibidos aún no se cuentan:

1. Captura los logs completos:
```bash
sudo journalctl -u soop_mail -n 200 > logs_soop_mail.txt
sudo grep "status=sent" /var/log/mail.log | tail -50 > logs_postfix.txt
```

2. Verifica la configuración de Postfix:
```bash
sudo postconf virtual_transport mailbox_transport
```

3. Revisa la documentación principal: `DOCUMENTACION_SISTEMA_PERMISOS_EMAIL.md`

---

**Fecha**: 2026-05-09  
**Versión**: 1.0  
**Sistema**: Soop Mail - Fix de Conteo de Correos Recibidos
