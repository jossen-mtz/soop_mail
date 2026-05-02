# Guía General del Sistema Soop Mail

Este documento centraliza la arquitectura, lógica de rutas y gestión de infraestructura del sistema Soop Mail.

---

## 1. Arquitectura y Flujo de Datos
El sistema actúa como un puente administrativo entre la interfaz web y el servidor de correo Linux (Postfix/Dovecot).

```mermaid
graph TD
    A[Frontend React] -->|REST API| B[Backend FastAPI]
    B -->|SQL| C[Base de Datos MySQL]
    B -->|File I/O| D[/etc/dovecot/users]
    B -->|File I/O| E[/etc/postfix/vmailbox]
    B -->|OS Walk| F[/var/mail/soop_mail/]
    B -->|Systemctl| G[Servicios Dovecot/Postfix]
```

---

## 2. Gestión de Usuarios y Buzones

### Creación de Usuarios (Workflow Estricto)
Cuando se registra un nuevo buzón, el sistema ejecuta los siguientes pasos para garantizar compatibilidad con Postfix/Dovecot:

1.  **Seguridad**: Genera un hash `SHA512-CRYPT` compatible con Dovecot.
2.  **Dovecot (`/etc/dovecot/users`)**: Registra la línea: `usuario@dominio:{HASH}:5000:5000::home_dir:`.
3.  **Postfix (`/etc/postfix/vmailbox`)**: Registra el mapeo: `usuario@dominio    dominio/usuario/Maildir/`.
4.  **Sistema de Archivos**:
    *   Crea la estructura `Maildir/{new,cur,tmp}`.
    *   Ejecuta `chown -R vmail:vmail` (UID/GID 5000).
    *   Ejecuta `chmod -R 700` para asegurar la privacidad.
5.  **Servicios**: Ejecuta `postmap` y recarga Postfix y Dovecot automáticamente.

---

## 3. Lógica de Rutas y Estadísticas

### Resolución de Directorios (Algoritmo de Descubrimiento)
El backend implementa un sistema de "descubrimiento inteligente" para localizar el Maildir, probando varias rutas en orden de prioridad:

1.  **Ruta Directa**: La que devuelve el archivo de usuarios de Dovecot (ej: `/var/mail/soop_mail/dominio/usuario`).
2.  **Ruta Base Relativa**: `MAIL_BASE` + Carpeta del Dominio + Carpeta del Usuario.
3.  **Rutas de Sistema Estándar**:
    *   `/var/mail/soop_mail/dominio/usuario`
    *   `/var/mail/vhosts/dominio/usuario`
4.  **Fallback por Dominio**: Si no hay dominio en la ruta, usa el `DEFAULT_DOMAIN` del archivo `.env`.

### Conteo y Cálculo de Peso (get_mailbox_stats)
El sistema realiza un escaneo real en disco mediante la función `get_mailbox_stats`. A diferencia de otros sistemas, esto garantiza precisión instantánea.

**Reglas de Conteo:**
*   **Total de Mensajes**: Suma todos los archivos encontrados en la ruta y sus subcarpetas.
*   **Nuevos Mensajes**: Identifica específicamente los archivos dentro de cualquier subdirectorio llamado `new/` (estándar Maildir).
*   **Archivos Excluidos**: Para evitar falsos positivos, el sistema ignora:
    *   `dovecot*` (archivos de índice y control).
    *   `maildirfolder` / `maildirsize`.
    *   `subscriptions`.

**Código de Implementación:**
```python
def get_mailbox_stats(mail_dir: str):
    # (Resolución de ruta omitida por brevedad)
    
    total, new, size_bytes = 0, 0, 0
    exclude = ['dovecot', 'subscriptions', 'maildirfolder', 'maildirsize']
    
    for root, dirs, files in os.walk(actual_path):
        is_new_dir = os.path.basename(root) == 'new'
        for file in files:
            # Filtro de metadatos
            if any(file.startswith(ex) for ex in exclude):
                continue
                
            total += 1
            if is_new_dir: new += 1
            
            # Suma de tamaño para el "Peso"
            fp = os.path.join(root, file)
            if not os.path.islink(fp):
                size_bytes += os.path.getsize(fp)
                
    return total, new, format_size(size_bytes), actual_path
```

---

## 4. Solución de Problemas Comunes

### ¿Por qué mi buzón muestra 0 correos?
Si el dashboard indica **0 total** pero existen archivos en el servidor, se debe casi siempre a un tema de **permisos**:
1.  **Acceso de Usuario**: El backend suele correr como `root` o el usuario del servidor web. Debe tener permisos para "entrar" (X) y "leer" (R) en las carpetas de `/var/mail/`.
2.  **Verificación**: Revisa con `ls -ld /var/mail/soop_mail/dominio/usuario`. Si la carpeta tiene permisos `700` y pertenece a `vmail`, asegúrate de que el backend tenga los privilegios necesarios.
3.  **Ruta Incorrecta**: Verifica en el modal de detalles la "Ruta de Almacenamiento". Si no coincide con la realidad, el conteo fallará.

### Variables de Configuración (`.env`)
*   `SOOP_MAIL_BASE`: `/var/mail/soop_mail`
*   `SOOP_MAIL_USERS_FILE`: `/etc/dovecot/users`
*   `DEFAULT_DOMAIN`: Dominio principal para resolución automática.
