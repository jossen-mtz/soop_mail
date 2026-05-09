# Documentación del Sistema de Permisos y Email - Soop Mail

## Índice
1. [Arquitectura General](#arquitectura-general)
2. [Sistema de Autenticación y Permisos](#sistema-de-autenticación-y-permisos)
3. [Sistema de Archivos y Permisos](#sistema-de-archivos-y-permisos)
4. [Sistema de Correo Electrónico](#sistema-de-correo-electrónico)
5. [Base de Datos y Modelos](#base-de-datos-y-modelos)
6. [Sistema de Auditoría](#sistema-de-auditoría)
7. [API Endpoints](#api-endpoints)
8. [Configuración](#configuración)
9. [Seguridad](#seguridad)
10. [Flujos de Trabajo Comunes](#flujos-de-trabajo-comunes)
11. [Troubleshooting](#troubleshooting)

---

## 1. Arquitectura General

### Stack Tecnológico
- **Backend**: FastAPI (Python)
- **Base de Datos**: MySQL/MariaDB con SQLAlchemy ORM
- **Servidor de Correo**: Postfix (MTA) + Dovecot (IMAP/POP3)
- **Autenticación**: JWT (JSON Web Tokens) + OAuth2
- **Frontend**: Vue.js/React (servido como SPA)

### Componentes Principales
```
soop_mail/
├── backend/
│   ├── main.py           # Aplicación principal FastAPI
│   ├── models.py         # Modelos de base de datos
│   ├── schemas.py        # Esquemas Pydantic (validación)
│   ├── auth.py           # Sistema de autenticación
│   ├── config.py         # Configuración y variables de entorno
│   ├── database.py       # Conexión a base de datos
│   └── scripts/          # Scripts auxiliares
├── frontend/            # Aplicación frontend
├── users                # Base de datos de usuarios de correo
├── virtual              # Aliases y forwards de Postfix
├── vmailbox             # Buzones virtuales de Postfix
├── sender_bcc           # Reglas BCC de remitentes
├── recipient_bcc        # Reglas BCC de destinatarios
└── aliases_meta.json    # Metadata de aliases y forwards
```

---

## 2. Sistema de Autenticación y Permisos

### 2.1 Autenticación de Usuarios del Sistema

#### Gestión de Contraseñas
- **Algoritmo**: bcrypt (para usuarios de administración del sistema)
- **Configuración**: `CryptContext(schemes=["bcrypt"], deprecated="auto")`
- **Archivo**: `backend/auth.py`

```python
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)
```

#### Tokens JWT
- **Algoritmo**: HS256
- **Tiempo de expiración**: 480 minutos (8 horas)
- **Secret Key**: Configurado en `backend/config.py` (variable `SECRET_KEY`)

```python
SECRET_KEY = config.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480
```

#### Niveles de Acceso
Actualmente, todos los usuarios autenticados son considerados administradores:

```python
async def get_current_admin_user(current_user: models.User = Depends(get_current_active_user)):
    return current_user
```

### 2.2 Autenticación de Usuarios de Correo

Los usuarios de correo utilizan un sistema de autenticación separado:

- **Algoritmo**: SHA512-CRYPT
- **Formato**: `{SHA512-CRYPT}$6$...hash...`
- **Herramienta**: `soop-mailtool` (con fallback a `passlib.hash.sha512_crypt`)

```python
def generate_soop_mail_hash(password: str):
    try:
        result = subprocess.run(
            ['soop-mailtool', 'pw', '-s', 'SHA512-CRYPT', '-p', password],
            capture_output=True, text=True, check=True
        )
        raw_hash = result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        raw_hash = sha512_crypt.hash(password)
    
    if not raw_hash.startswith('{SHA512-CRYPT}'):
        raw_hash = f"{{SHA512-CRYPT}}{raw_hash}"
    return raw_hash
```

---

## 3. Sistema de Archivos y Permisos

### 3.1 Archivos Críticos del Sistema

#### Ubicaciones Configurables

**Variables de Entorno** (definidas en `backend/config.py`):
- `SOOP_MAIL_USERS_FILE` / `USERS_FILE`: Base de datos de usuarios
- `SOOP_MAIL_BASE` / `MAIL_BASE`: Directorio base de buzones
- `POSTFIX_VIRTUAL`: Tabla de aliases/forwards
- `POSTFIX_VMAILBOX`: Tabla de buzones virtuales
- `SENDER_BCC_FILE`: Reglas BCC de remitentes
- `RECIPIENT_BCC_FILE`: Reglas BCC de destinatarios
- `ALIAS_META_FILE`: Metadata de aliases (JSON)

#### Ubicaciones Estándar con Auto-Discovery

**Archivo de Usuarios** (prioridad descendente):
1. `/etc/dovecot/users`
2. `/etc/postfix/users`
3. `PROJECT_ROOT/users`
4. `backend/users`

**Directorio Base de Correos** (prioridad descendente):
1. `/var/mail/vhosts`
2. `/var/mail/soop_mail`
3. `/var/vmail`
4. `PROJECT_ROOT/mail`
5. `PROJECT_ROOT/vhosts`

**Archivos de Postfix**:
- Virtual: `/etc/postfix/virtual`
- VMMailbox: `/etc/postfix/vmailbox`
- Sender BCC: `/etc/postfix/sender_bcc`
- Recipient BCC: `/etc/postfix/recipient_bcc`

### 3.2 Sistema de Resolución de Paths

La aplicación utiliza una función inteligente de resolución de paths:

```python
def resolve_path(path, default_filename=None):
    """
    Resolución inteligente de paths:
    1. Si path es absoluto y existe, usarlo.
    2. Si path es relativo, intentar relativo a PROJECT_ROOT.
    3. Si path es absoluto pero no existe y es solo nombre de archivo,
       intentar en PROJECT_ROOT.
    """
```

### 3.3 Permisos de Archivos

#### Usuario y Grupo del Sistema de Correo
```python
VMAIL_UID = int(os.getenv("SOOP_MAIL_VMAIL_UID", 5000))
VMAIL_GID = int(os.getenv("SOOP_MAIL_VMAIL_GID", 5000))
```

#### Permisos Necesarios

| Archivo/Directorio | Owner | Permissions | Descripción |
|-------------------|-------|-------------|-------------|
| `/etc/postfix/*` | root:root o root:user | 644 | Archivos de configuración Postfix |
| `/var/mail/vhosts` | vmail:vmail | 755 | Directorio base de correos |
| Buzones individuales | vmail:vmail | 700 | Directorios Maildir |
| `users` file | dovecot:dovecot | 640 | Base de datos de usuarios |

### 3.4 Escritura Privilegiada de Archivos

El sistema implementa un mecanismo de fallback para escribir archivos que requieren privilegios:

```python
def _write_privileged(path: str, content: str) -> tuple:
    """Escribe contenido a un archivo, usando sudo tee si falla escritura directa."""
    try:
        with open(path, 'w') as f:
            f.write(content)
        print(f"OK: Direct write to {path}")
        return True, ""
    except PermissionError:
        try:
            proc = subprocess.run(
                ['sudo', '-n', 'tee', path],
                input=content,
                capture_output=True,
                text=True,
                check=True
            )
            print(f"OK (sudo tee): Wrote to {path}")
            return True, ""
        except subprocess.CalledProcessError as e:
            msg = f"ERROR: Could not write {path} even with sudo tee: {e.stderr.strip()}"
            return False, msg
```

### 3.5 Ejecución de Comandos Privilegiados

```python
def _run_privileged(cmd: list, description: str = "") -> tuple:
    """Ejecuta un comando, primero directamente, luego con sudo si falla."""
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        try:
            result = subprocess.run(['sudo', '-n'] + cmd, check=True, 
                                   capture_output=True, text=True)
            return True, result.stdout
        except subprocess.CalledProcessError as e2:
            return False, f"Direct: {e.stderr.strip()} | Sudo: {e2.stderr.strip()}"
```

### 3.6 Configuración de sudoers

Para permitir operaciones sin contraseña, se debe configurar `/etc/sudoers.d/soop_mail`:

```bash
# Usuario de Gunicorn/www-data
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postmap, /usr/sbin/postfix, \
    /usr/bin/systemctl reload postfix, /usr/bin/systemctl restart postfix, \
    /usr/bin/systemctl reload dovecot, /usr/bin/systemctl restart dovecot, \
    /bin/tee /etc/postfix/*, /usr/local/bin/soop_create_mailbox
```

**Permisos del archivo sudoers**:
```bash
sudo chmod 440 /etc/sudoers.d/soop_mail
```

### 3.7 Script Helper para Creación de Mailboxes

**Ubicación**: `/usr/local/bin/soop_create_mailbox`

Este script debe ejecutarse con privilegios root para crear directorios Maildir con ownership correcto (vmail:vmail):

```bash
#!/bin/bash
# Creates a Maildir with vmail:vmail ownership
MAILDIR_PATH=$1
mkdir -p "$MAILDIR_PATH/Maildir/"{new,cur,tmp}
chown -R vmail:vmail "$MAILDIR_PATH"
chmod 700 "$MAILDIR_PATH"
```

**Instalación**:
```bash
sudo cp scripts/soop_create_mailbox /usr/local/bin/
sudo chmod +x /usr/local/bin/soop_create_mailbox
```

---

## 4. Sistema de Correo Electrónico

### 4.1 Gestión de Usuarios de Correo

#### Formato del Archivo `users`

Formato compatible con Dovecot (estilo /etc/passwd):
```
usuario@dominio:{HASH}:uid:gid:gecos:home_dir:shell:extra_fields
```

**Ejemplo**:
```
juan@example.com:{SHA512-CRYPT}$6$...hash...:5000:5000::/var/mail/vhosts/example.com/juan::status=active,dept=Ventas
```

#### Estados de Usuario
- `active`: Usuario activo (puede autenticarse)
- `suspended`: Usuario suspendido (hash prefijado con `{disable}`)

#### Funciones Principales

**Lectura del archivo de usuarios**:
```python
def read_users_file():
    users = []
    with open(USERS_FILE, 'r') as f:
        for line in f:
            parts = line.strip().split(':')
            if len(parts) >= 2:
                user_hash = parts[1]
                status = "active"
                if user_hash.startswith("{disable}"):
                    status = "suspended"
                    user_hash = user_hash.replace("{disable}", "")
                users.append({
                    'email': parts[0],
                    'hash': user_hash,
                    'uid': parts[2],
                    'gid': parts[3],
                    'gecos': parts[4],
                    'home': parts[5],
                    'shell': parts[6] if len(parts) > 6 else '',
                    'status': status,
                    'department': ''
                })
    return users
```

**Escritura del archivo de usuarios**:
```python
def write_users_file(users: List[dict]):
    """
    Escribe el archivo de usuarios y sincroniza:
    1. Archivo users
    2. Postfix vmailbox
    3. Recarga Dovecot
    """
```

### 4.2 Estructura de Buzones (Maildir)

#### Formato Maildir
```
/var/mail/vhosts/dominio.com/usuario/Maildir/
├── new/        # Correos nuevos no leídos
├── cur/        # Correos leídos
└── tmp/        # Temporal para escritura atómica
```

#### Subdirectorios IMAP (Dovecot)
```
Maildir/
├── .Drafts/    # Borradores
├── .Sent/      # Enviados
├── .Trash/     # Papelera
└── .Spam/      # Spam
```

### 4.3 Aliases y Reenvíos (Virtual Maps)

El sistema utiliza el archivo `virtual` de Postfix para:
1. **Aliases**: Múltiples direcciones apuntan a un mismo buzón
2. **Forwards**: Reenvío a direcciones externas
3. **Listas de correo dinámicas**: Expansión a todos los usuarios activos

#### Metadata de Aliases (`aliases_meta.json`)

Este archivo JSON almacena metadata adicional no soportada nativamente por Postfix:

```json
{
  "todos@dominio.com": {
    "is_dynamic": true,
    "is_forward": false,
    "keep_local": false,
    "description": "Lista dinámica de todos los usuarios"
  },
  "ventas@dominio.com": {
    "is_dynamic": false,
    "is_forward": true,
    "keep_local": true,
    "description": "Reenvío a CRM con copia local"
  }
}
```

#### Aliases Dinámicos

Los aliases dinámicos se expanden automáticamente a todos los usuarios activos:

```python
if any(e.get('is_dynamic') for e in entries):
    users = read_users_file()
    all_active_users = [u['email'] for u in users if u['status'] == 'active']

for e in entries:
    dests = e['destinations']
    if e.get('is_dynamic'):
        dests = list(set(dests + all_active_users))
```

### 4.4 Reglas de Copia Oculta (BCC)

#### Tipos de Reglas BCC

1. **Sender BCC** (`sender_bcc`): Copia de todos los correos enviados desde una dirección
2. **Recipient BCC** (`recipient_bcc`): Copia de todos los correos recibidos por una dirección

#### Formato del Archivo BCC
```
# Sender BCC Rules
ventas@dominio.com    auditoria@dominio.com
soporte@dominio.com   backup@dominio.com

# Recipient BCC Rules
admin@dominio.com     log@dominio.com
```

#### Configuración en Postfix (main.cf)
```
sender_bcc_maps = hash:/etc/postfix/sender_bcc
recipient_bcc_maps = hash:/etc/postfix/recipient_bcc
```

Después de modificar estos archivos, se debe ejecutar:
```bash
sudo postmap /etc/postfix/sender_bcc
sudo postmap /etc/postfix/recipient_bcc
sudo postfix reload
```

### 4.5 Auto-Respuestas (Auto-Responders)

Gestión de respuestas automáticas en la base de datos:

```python
class AutoResponder(Base):
    __tablename__ = 'auto_responders'
    
    id = Column(Integer, primary_key=True)
    email = Column(String(120), unique=True, nullable=False)
    active = Column(Boolean, default=False)
    subject = Column(String(200))
    body = Column(Text)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
```

**Nota**: La implementación actual almacena la configuración en DB, pero falta generar los scripts `.sieve` de Dovecot.

### 4.6 Estadísticas de Tráfico de Correo

El sistema analiza los logs de Postfix para generar estadísticas:

```python
def sync_email_traffic(db: Session):
    """Parsea logs de correo para actualizar estadísticas de tráfico."""
    # Lee /var/log/mail.log
    # Identifica correos enviados vs recibidos por QID
    # Actualiza tabla EmailTraffic en la DB
```

**Heurística de detección**:
- **Enviados**: Líneas con `sasl_username=` o `client=localhost`
- **Recibidos**: Líneas con `relay=local` o `relay=virtual` o `relay=dovecot`

---

## 5. Base de Datos y Modelos

### 5.1 Modelo `User` (Usuarios del Sistema)

**Tabla**: `users`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Integer | Primary Key |
| username | String(80) | Usuario único |
| email | String(120) | Email único |
| password_hash | String(255) | Hash bcrypt |
| full_name | String(200) | Nombre completo |
| is_active | Boolean | Usuario activo |
| last_login | DateTime | Último login |
| created_at | DateTime | Fecha de creación |
| updated_at | DateTime | Última actualización |

**Relaciones**:
- `sessions`: Relación one-to-many con `UserSession`
- `audit_logs`: Relación one-to-many con `AuditLog`

### 5.2 Modelo `UserSession`

**Tabla**: `user_sessions`

Gestión de sesiones activas:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Integer | Primary Key |
| user_id | Integer | Foreign Key a users |
| session_token | String(255) | Token de sesión único |
| ip_address | String(45) | IP del cliente |
| user_agent | Text | User-Agent del navegador |
| is_active | Boolean | Sesión activa |
| created_at | DateTime | Creación de sesión |
| expires_at | DateTime | Expiración |
| last_activity | DateTime | Última actividad |

### 5.3 Modelo `AuditLog`

**Tabla**: `audit_logs`

Registro completo de todas las acciones:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Integer | Primary Key |
| user_id | Integer | Foreign Key a users |
| action | String(100) | Tipo de acción |
| resource_type | String(50) | Tipo de recurso |
| resource_id | String(100) | ID del recurso |
| ip_address | String(45) | IP del cliente |
| user_agent | Text | User-Agent |
| details | Text | Detalles adicionales |
| created_at | DateTime | Timestamp de la acción |

### 5.4 Modelo `AutoResponder`

**Tabla**: `auto_responders`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Integer | Primary Key |
| email | String(120) | Email del usuario |
| active | Boolean | Auto-respuesta activa |
| subject | String(200) | Asunto de la respuesta |
| body | Text | Cuerpo de la respuesta |
| start_date | DateTime | Inicio de vigencia |
| end_date | DateTime | Fin de vigencia |

### 5.5 Modelo `EmailTraffic`

**Tabla**: `email_traffic`

Estadísticas diarias de correo:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | Integer | Primary Key |
| date | DateTime | Fecha (única) |
| sent_count | Integer | Correos enviados |
| received_count | Integer | Correos recibidos |
| created_at | DateTime | Creación del registro |
| updated_at | DateTime | Última actualización |

---

## 6. Sistema de Auditoría

### 6.1 Función de Logging

```python
def log_audit(db: Session, user_id: Optional[int], action: str, 
              resource_type: str = None, resource_id: str = None, 
              details: str = None, request: Request = None):
    ip = request.client.host if request and request.client else None
    ua = request.headers.get("user-agent") if request else None
    db_item = models.AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip,
        user_agent=ua,
        details=details
    )
    db.add(db_item)
    db.commit()
```

### 6.2 Acciones Auditadas

| Acción | Descripción |
|--------|-------------|
| LOGIN | Inicio de sesión exitoso |
| LOGOUT | Cierre de sesión |
| CREATE_MAIL_USER | Creación de usuario de correo |
| UPDATE_MAIL_USER | Actualización de usuario de correo |
| DELETE_MAIL_USER | Eliminación de usuario de correo |
| UPDATE_MAIL_USER_PASSWORD | Cambio de contraseña de correo |
| PURGE_MAILBOX | Vaciado de buzón |
| EXPORT_MAILBOX | Exportación de buzón |
| CREATE_ALIAS | Creación de alias |
| DELETE_ALIAS | Eliminación de alias |
| CREATE_FORWARD | Creación de reenvío |
| DELETE_FORWARD | Eliminación de reenvío |
| CREATE_SENDER_BCC | Creación de regla BCC de remitente |
| CREATE_RECIPIENT_BCC | Creación de regla BCC de destinatario |
| DELETE_SENDER_BCC | Eliminación de regla BCC de remitente |
| DELETE_RECIPIENT_BCC | Eliminación de regla BCC de destinatario |

---

## 7. API Endpoints

### 7.1 Autenticación

#### POST `/api/auth/login`
**Descripción**: Autenticación de usuario del sistema
**Entrada**: Form data (`username`, `password`)
**Salida**: Token JWT

#### GET `/api/auth/me`
**Descripción**: Información del usuario actual
**Autenticación**: Requerida
**Salida**: Objeto `UserOut`

#### PUT `/api/auth/me`
**Descripción**: Actualizar perfil del usuario actual
**Autenticación**: Requerida
**Entrada**: `UserUpdate`

#### POST `/api/auth/change-password`
**Descripción**: Cambiar contraseña del usuario del sistema
**Autenticación**: Requerida
**Entrada**: `UserPasswordChange`

### 7.2 Usuarios de Correo

#### GET `/api/mail/users`
**Descripción**: Lista todos los usuarios de correo con estadísticas
**Autenticación**: Requerida
**Salida**: Lista de `SoopMailUserBase`

#### POST `/api/mail/users`
**Descripción**: Crear nuevo usuario de correo
**Autenticación**: Requerida
**Entrada**: `SoopMailUserCreate`
**Proceso**:
1. Valida email y contraseña
2. Genera hash SHA512-CRYPT
3. Crea directorio Maildir con `soop_create_mailbox`
4. Actualiza archivo `users`
5. Sincroniza Postfix vmailbox
6. Recarga Dovecot

#### PUT `/api/mail/users/{email}`
**Descripción**: Actualizar usuario de correo
**Autenticación**: Requerida
**Entrada**: `SoopMailUserUpdate`

#### DELETE `/api/mail/users/{email}`
**Descripción**: Eliminar usuario de correo
**Autenticación**: Requerida
**Nota**: No elimina el directorio Maildir físicamente

#### PUT `/api/mail/users/{email}/password`
**Descripción**: Cambiar contraseña de usuario de correo
**Autenticación**: Requerida
**Entrada**: `SoopMailUserUpdate`

#### POST `/api/mail/users/{email}/purge`
**Descripción**: Vaciar buzón de correo
**Autenticación**: Requerida
**Proceso**: Elimina todos los archivos en `cur/`, `new/`, y `tmp/`

### 7.3 Exportación de Buzones

#### GET `/api/mail/users/{email}/export`
**Descripción**: Exportar Maildir completo como ZIP
**Autenticación**: Requerida
**Salida**: Archivo ZIP

#### GET `/api/mail/users/{email}/export/data`
**Descripción**: Exportar metadata del usuario (JSON)
**Autenticación**: Requerida
**Contenido**: Usuario, aliases, forwards, auto-responder, reglas BCC

#### GET `/api/mail/users/{email}/export/pdf`
**Descripción**: Generar reporte imprimible (HTML)
**Autenticación**: Requerida
**Salida**: Archivo HTML con estadísticas del buzón

#### GET `/api/mail/export-all`
**Descripción**: Exportar todos los buzones
**Autenticación**: Requerida
**Salida**: Archivo ZIP con todos los Maildirs

### 7.4 Aliases y Reenvíos

#### GET `/api/mail/aliases`
**Descripción**: Lista todos los aliases y forwards
**Autenticación**: Requerida
**Salida**: Lista de entradas del archivo virtual

#### POST `/api/mail/aliases`
**Descripción**: Crear alias
**Autenticación**: Requerida
**Entrada**: `SoopMailAliasCreate`

#### DELETE `/api/mail/aliases/{email}`
**Descripción**: Eliminar alias
**Autenticación**: Requerida

#### GET `/api/mail/forwards`
**Descripción**: Lista solo los forwards
**Autenticación**: Requerida
**Salida**: Lista filtrada de forwards

#### POST `/api/mail/forwards`
**Descripción**: Crear forward
**Autenticación**: Requerida
**Entrada**: `SoopMailForward`
**Opciones**: `keep_local` (mantener copia local)

#### DELETE `/api/mail/forwards/{email}`
**Descripción**: Eliminar forward
**Autenticación**: Requerida

### 7.5 Reglas BCC

#### GET `/api/mail/bcc`
**Descripción**: Obtener todas las reglas BCC
**Autenticación**: Requerida
**Salida**: `{"sender": [...], "recipient": [...]}`

#### POST `/api/mail/bcc/sender`
**Descripción**: Crear regla BCC de remitente
**Autenticación**: Requerida
**Entrada**: `ForwardingRule`

#### POST `/api/mail/bcc/recipient`
**Descripción**: Crear regla BCC de destinatario
**Autenticación**: Requerida
**Entrada**: `ForwardingRule`

#### DELETE `/api/mail/bcc/{mode}/{email}`
**Descripción**: Eliminar regla BCC
**Parámetros**: `mode` = "sender" | "recipient"
**Autenticación**: Requerida

### 7.6 Auto-Respuestas

#### GET `/api/mail/users/{email}/auto-responder`
**Descripción**: Obtener configuración de auto-respuesta
**Autenticación**: Requerida
**Salida**: `AutoResponderOut`

#### PUT `/api/mail/users/{email}/auto-responder`
**Descripción**: Actualizar auto-respuesta
**Autenticación**: Requerida
**Entrada**: `AutoResponderUpdate`

### 7.7 Sistema y Diagnóstico

#### GET `/api/system/status`
**Descripción**: Estado general del sistema
**Autenticación**: Requerida
**Salida**: `SystemStatus`
**Información incluida**:
- Estado de servicios (Postfix, Dovecot, DB)
- Estadísticas de almacenamiento
- Información SSL/TLS
- Configuración de Postfix
- Diagnóstico de archivos

#### GET `/api/system/diagnostics`
**Descripción**: Diagnóstico de permisos de archivos
**Autenticación**: Requerida (admin)
**Salida**: Lista de problemas con comandos de solución

#### GET `/api/system/vmailbox-diagnostics`
**Descripción**: Diagnóstico profundo del archivo vmailbox
**Autenticación**: Requerida (admin)
**Información incluida**:
- Usuario ejecutando el proceso
- Estado del archivo vmailbox
- Acceso sudo
- Comandos de solución

#### GET `/api/system/debug/storage`
**Descripción**: Diagnóstico profundo de almacenamiento
**Autenticación**: Requerida (admin)
**Información incluida**:
- Contenido de MAIL_BASE
- Paths verificados para primeros 5 usuarios

#### GET `/api/system/logs/mail`
**Descripción**: Últimas líneas del log de correo
**Parámetros**: `lines` (default: 100)
**Autenticación**: Requerida (admin)

#### GET `/api/system/logs/mail/auth`
**Descripción**: Eventos de autenticación del log de correo
**Parámetros**: `lines`, `email` (opcional)
**Autenticación**: Requerida (admin)

#### GET `/api/system/logs/auth/stream`
**Descripción**: Stream en tiempo real de eventos de autenticación
**Parámetros**: `email` (opcional)
**Autenticación**: Requerida (admin)
**Tipo**: Server-Sent Events (SSE)

### 7.8 Tráfico de Correo

#### GET `/api/mail/traffic`
**Descripción**: Estadísticas de tráfico de correo
**Parámetros**: `days` (default: 30)
**Autenticación**: Requerida
**Salida**: `TrafficStatsResponse`

#### POST `/api/mail/traffic/track`
**Descripción**: Registrar evento de correo
**Entrada**: `{"direction": "sent|received", "count": 1}`
**Uso**: Webhook/integración externa

#### POST `/api/system/traffic/populate-mock`
**Descripción**: Generar datos de prueba
**Parámetros**: `days` (default: 30)
**Autenticación**: Requerida (admin)

### 7.9 Auditoría

#### GET `/api/system/audit-logs`
**Descripción**: Obtener logs de auditoría
**Parámetros**: `limit` (default: 100)
**Autenticación**: Requerida (admin)
**Salida**: Lista de `AuditLogOut`

### 7.10 Utilidades

#### GET `/api/system/utils/generate-password`
**Descripción**: Generar contraseña segura
**Parámetros**: `length` (default: 12)
**Autenticación**: Requerida
**Salida**: `{"password": "..."}`

---

## 8. Configuración

### 8.1 Variables de Entorno

**Archivo**: `.env`, `.env.development`, o `.env.production`

#### Base de Datos
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=soop_mail
MYSQL_PASSWORD=secure_password
MYSQL_DATABASE=soop_mail_db
DATABASE_URL=mysql+pymysql://user:pass@host:port/database
```

#### Autenticación
```bash
SECRET_KEY=your-secret-key-here-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

#### Sistema de Correo
```bash
# Directorio base de buzones
SOOP_MAIL_BASE=/var/mail/vhosts
MAIL_BASE=/var/mail/vhosts

# Archivo de usuarios
SOOP_MAIL_USERS_FILE=/etc/dovecot/users
USERS_FILE=/etc/dovecot/users

# Archivos de Postfix
POSTFIX_VIRTUAL=/etc/postfix/virtual
POSTFIX_VMAILBOX=/etc/postfix/vmailbox
SENDER_BCC_FILE=/etc/postfix/sender_bcc
RECIPIENT_BCC_FILE=/etc/postfix/recipient_bcc

# Usuario y grupo de correo
SOOP_MAIL_VMAIL_UID=5000
SOOP_MAIL_VMAIL_GID=5000

# Dominio por defecto
DEFAULT_DOMAIN=example.com
```

#### Usuario Administrador por Defecto
```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
ADMIN_EMAIL=admin@soopmail.com
```

#### Entorno
```bash
APP_ENV=development  # development o production
DEBUG=True
```

### 8.2 Configuración de Postfix

**Archivo**: `/etc/postfix/main.cf`

#### Virtual Mailboxes
```
virtual_mailbox_domains = mmbtransporte.com, other-domain.com
virtual_mailbox_base = /var/mail/vhosts
virtual_mailbox_maps = hash:/etc/postfix/vmailbox
virtual_minimum_uid = 5000
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000
```

#### Virtual Aliases
```
virtual_alias_maps = hash:/etc/postfix/virtual
```

#### BCC Rules
```
sender_bcc_maps = hash:/etc/postfix/sender_bcc
recipient_bcc_maps = hash:/etc/postfix/recipient_bcc
```

#### Dovecot Integration
```
virtual_transport = lmtp:unix:private/dovecot-lmtp
```

### 8.3 Configuración de Dovecot

**Archivo**: `/etc/dovecot/conf.d/auth-passwdfile.conf.ext`

```
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT username_format=%u /etc/dovecot/users
}

userdb {
  driver = passwd-file
  args = username_format=%u /etc/dovecot/users
  default_fields = uid=vmail gid=vmail home=/var/mail/vhosts/%d/%n
}
```

**Archivo**: `/etc/dovecot/conf.d/10-mail.conf`

```
mail_location = maildir:~/Maildir
mail_privileged_group = vmail
```

### 8.4 Configuración del Servicio systemd

**Archivo**: `/etc/systemd/system/soop_mail.service`

```ini
[Unit]
Description=Soop Mail API Service
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/path/to/soop_mail/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app -b 0.0.0.0:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 9. Seguridad

### 9.1 Validación de Entrada

#### Validación de Email
```python
def validate_email_format(email: str):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None
```

#### Validación de Contraseña
```python
def validate_password_format(password: str):
    return len(password) >= 8
```

**Pydantic Validators** (en `schemas.py`):
```python
@field_validator("password")
@classmethod
def validate_password(cls, v: str) -> str:
    if len(v) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres")
    return v
```

### 9.2 Protección CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominio frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 9.3 Rate Limiting y Protección

**Recomendaciones**:
- Implementar rate limiting en producción (ej: `slowapi`)
- Usar HTTPS obligatorio
- Configurar firewall (UFW/iptables)
- Implementar fail2ban para proteger Dovecot/Postfix

### 9.4 Manejo de Secretos

- Nunca hardcodear credenciales
- Usar variables de entorno
- Archivos `.env` con permisos 600
- Secretos en producción: usar gestor de secretos (AWS Secrets Manager, Vault, etc.)

### 9.5 Auditoría y Logging

- Todas las acciones críticas se registran en `audit_logs`
- Logs de sistema en `/var/log/mail.log`
- Retención recomendada: 90 días

---

## 10. Flujos de Trabajo Comunes

### 10.1 Crear Usuario de Correo

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant FileSystem
    participant Postfix
    participant Dovecot
    
    Admin->>API: POST /api/mail/users
    API->>API: Validar email y password
    API->>API: Generar hash SHA512-CRYPT
    API->>FileSystem: Ejecutar soop_create_mailbox
    FileSystem->>FileSystem: Crear Maildir/new/cur/tmp
    FileSystem->>FileSystem: chown vmail:vmail
    API->>FileSystem: Actualizar archivo users
    API->>Postfix: Actualizar vmailbox
    API->>Postfix: postmap vmailbox
    API->>Postfix: postfix reload
    API->>Dovecot: doveadm reload
    API->>Admin: Respuesta exitosa
```

### 10.2 Crear Alias Dinámico

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant FileSystem
    participant Postfix
    
    Admin->>API: POST /api/mail/aliases
    API->>API: Leer archivo users
    API->>API: Filtrar usuarios activos
    API->>API: Expandir destinos dinámicos
    API->>FileSystem: Actualizar aliases_meta.json
    API->>FileSystem: Actualizar virtual file
    API->>Postfix: postmap virtual
    API->>Postfix: postfix reload
    API->>Admin: Respuesta exitosa
```

### 10.3 Cambiar Contraseña de Correo

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant FileSystem
    participant Dovecot
    
    Admin->>API: PUT /api/mail/users/{email}/password
    API->>API: Generar nuevo hash SHA512-CRYPT
    API->>FileSystem: Leer archivo users
    API->>FileSystem: Actualizar hash del usuario
    API->>FileSystem: Escribir archivo users
    API->>Dovecot: doveadm reload
    API->>Admin: Respuesta exitosa
```

### 10.4 Diagnóstico de Permisos

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant FileSystem
    participant System
    
    Admin->>API: GET /api/system/diagnostics
    API->>FileSystem: Verificar existencia de archivos
    API->>FileSystem: Verificar permisos de lectura
    API->>FileSystem: Verificar permisos de escritura
    API->>System: Obtener usuario actual (getpass.getuser())
    API->>API: Generar comandos de solución
    API->>Admin: Lista de problemas y soluciones
```

---

## 11. Troubleshooting

### 11.1 Problema: No se pueden crear usuarios

**Síntomas**:
- Error: "Error creating mail directory"
- Error: "Could not write users file"

**Diagnóstico**:
```bash
# Verificar permisos del directorio base
ls -la /var/mail/vhosts

# Verificar permisos del archivo users
ls -la /etc/dovecot/users

# Verificar usuario actual
whoami
```

**Solución**:
```bash
# Opción 1: Dar permisos al usuario www-data
sudo chown -R www-data:www-data /var/mail/vhosts
sudo chown www-data:dovecot /etc/dovecot/users
sudo chmod 664 /etc/dovecot/users

# Opción 2: Instalar script helper y configurar sudoers
sudo bash scripts/setup_sudoers.sh
```

### 11.2 Problema: Postfix no reconoce nuevos usuarios

**Síntomas**:
- Correos rebotan con "User unknown"
- Postfix logs: "Recipient address rejected: User unknown in virtual mailbox table"

**Diagnóstico**:
```bash
# Verificar archivo vmailbox
cat /etc/postfix/vmailbox

# Verificar que existe el .db
ls -la /etc/postfix/vmailbox.db

# Probar lookup
postmap -q usuario@dominio.com /etc/postfix/vmailbox
```

**Solución**:
```bash
# Regenerar vmailbox.db
sudo postmap /etc/postfix/vmailbox
sudo postfix reload

# Si persiste, verificar main.cf
sudo postconf virtual_mailbox_maps
# Debe mostrar: hash:/etc/postfix/vmailbox
```

### 11.3 Problema: Dovecot no autentica usuarios

**Síntomas**:
- Error en logs: "auth-worker: Error: passwd-file: Unknown scheme"
- Autenticación falla en cliente de correo

**Diagnóstico**:
```bash
# Verificar formato del hash en users file
head -1 /etc/dovecot/users
# Debe mostrar: {SHA512-CRYPT}$6$...

# Probar autenticación
doveadm pw -s SHA512-CRYPT -p test_password
```

**Solución**:
```bash
# Regenerar hash del usuario
# Desde la API: PUT /api/mail/users/{email}/password

# Verificar configuración de passdb
grep -A5 "passdb {" /etc/dovecot/conf.d/auth-passwdfile.conf.ext
```

### 11.4 Problema: Aliases/Forwards no funcionan

**Síntomas**:
- Correos no se reenvían
- Alias no expande a múltiples destinatarios

**Diagnóstico**:
```bash
# Verificar archivo virtual
cat /etc/postfix/virtual

# Verificar que existe .db
ls -la /etc/postfix/virtual.db

# Probar lookup
postmap -q alias@dominio.com /etc/postfix/virtual
```

**Solución**:
```bash
# Regenerar virtual.db
sudo postmap /etc/postfix/virtual
sudo postfix reload

# Verificar metadata
cat aliases_meta.json
```

### 11.5 Problema: Permisos de buzón incorrectos

**Síntomas**:
- Dovecot logs: "Permission denied"
- No se pueden leer/escribir correos

**Diagnóstico**:
```bash
# Verificar ownership de Maildir
ls -la /var/mail/vhosts/dominio.com/usuario/

# Debe ser: drwx------ vmail vmail
```

**Solución**:
```bash
# Corregir ownership recursivamente
sudo chown -R vmail:vmail /var/mail/vhosts

# Corregir permisos
sudo find /var/mail/vhosts -type d -exec chmod 700 {} \;
sudo find /var/mail/vhosts -type f -exec chmod 600 {} \;
```

### 11.6 Problema: Base de datos no conecta

**Síntomas**:
- Error: "Database connection failed"
- API no inicia

**Diagnóstico**:
```bash
# Verificar variables de entorno
cat backend/.env | grep MYSQL

# Probar conexión MySQL
mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE
```

**Solución**:
```bash
# Verificar servicio MySQL
sudo systemctl status mysql

# Verificar grants del usuario
mysql -u root -p
SHOW GRANTS FOR 'soop_mail'@'%';
```

### 11.7 Problema: Estadísticas de tráfico vacías

**Síntomas**:
- Dashboard muestra 0 correos
- GET /api/mail/traffic devuelve historia vacía

**Diagnóstico**:
```bash
# Verificar que existen logs
ls -la /var/log/mail.log

# Verificar formato del log
tail /var/log/mail.log | grep "status=sent"
```

**Solución**:
```bash
# Forzar sincronización de tráfico
# Llamar a: GET /api/mail/traffic

# Poblar datos de prueba (solo desarrollo)
# POST /api/system/traffic/populate-mock
```

### 11.8 Comandos de Diagnóstico Rápido

```bash
# Estado general del sistema
systemctl status soop_mail postfix dovecot mysql

# Logs en tiempo real
tail -f /var/log/mail.log
tail -f /var/log/soop_mail/gunicorn.log

# Verificar puertos
netstat -tlnp | grep -E "(25|587|993|8000)"

# Verificar conectividad SMTP
telnet localhost 25

# Verificar autenticación Dovecot
doveadm auth test usuario@dominio.com password

# Verificar queue de Postfix
mailq
```

---

## 12. Apéndices

### 12.1 Estructura de Directorios Completa

```
/var/mail/vhosts/
└── dominio.com/
    └── usuario/
        └── Maildir/
            ├── cur/
            ├── new/
            ├── tmp/
            ├── .Drafts/
            │   ├── cur/
            │   ├── new/
            │   └── tmp/
            ├── .Sent/
            ├── .Trash/
            └── .Spam/

/etc/postfix/
├── main.cf
├── virtual
├── virtual.db
├── vmailbox
├── vmailbox.db
├── sender_bcc
├── sender_bcc.db
├── recipient_bcc
└── recipient_bcc.db

/etc/dovecot/
├── dovecot.conf
├── users
└── conf.d/
    ├── 10-auth.conf
    ├── 10-mail.conf
    └── auth-passwdfile.conf.ext
```

### 12.2 Referencias

- [Postfix Virtual Mailbox Documentation](http://www.postfix.org/VIRTUAL_README.html)
- [Dovecot Password Databases](https://doc.dovecot.org/configuration_manual/authentication/password_databases/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)

---

**Versión del Documento**: 1.0  
**Fecha**: 2025-01-XX  
**Autor**: Sistema Soop Mail  
**Última Actualización**: Generado automáticamente desde el código fuente
