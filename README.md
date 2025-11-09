# Plataforma Web de Gestión de Usuarios soop MAIL

Aplicación web moderna para gestionar usuarios de correo electrónico en servidores soop MAIL con sistema de autenticación completo.

## Características

- ✅ **Sistema de Autenticación**: Login/Logout con sesiones seguras en MySQL
- ✅ **Gestión de Usuarios Administradores**: Registro y gestión de administradores del sistema
- ✅ **Crear usuarios**: Crear nuevos usuarios de correo con validación de email y contraseña
- ✅ **Editar usuarios**: Cambiar contraseñas de usuarios existentes
- ✅ **Eliminar usuarios**: Eliminar usuarios con opción de eliminar directorio de correo
- ✅ **Listar usuarios**: Ver todos los usuarios configurados
- ✅ **Reiniciar soop MAIL**: Reiniciar el servicio soop MAIL desde la interfaz
- ✅ **Auditoría**: Registro de todas las acciones realizadas
- ✅ **Pool de Conexiones MySQL**: Gestión eficiente de conexiones a base de datos
- ✅ **Interfaz moderna**: Diseño responsive y fácil de usar

## Requisitos

- Python 3.7 o superior
- MySQL 5.7+ o MariaDB 10.2+
- Servicio soop MAIL instalado y configurado
- Permisos de root o sudo para modificar `/etc/soop_mail/users`
- Herramientas de soop MAIL disponibles en el PATH (`soop-mailtools`)

## Instalación

1. **Clonar o descargar el proyecto**

2. **Instalar dependencias**:
```bash
pip install -r requirements.txt
```

3. **Configurar MySQL**:
```bash
# Crear base de datos
mysql -u root -p
CREATE DATABASE soop_mail_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'soop_mail_admin'@'localhost' IDENTIFIED BY 'tu_contraseña_segura';
GRANT ALL PRIVILEGES ON soop_mail_admin.* TO 'soop_mail_admin'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

4. **Configurar variables de entorno**:
```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tus credenciales
nano .env
```

5. **Inicializar base de datos**:
```bash
python init_db.py
```

6. **Configurar permisos** (en Linux):
```bash
# Asegúrate de que el archivo de usuarios existe
sudo mkdir -p /etc/soop_mail
sudo touch /etc/soop_mail/users
sudo chmod 644 /etc/soop_mail/users
sudo chown root:soopmail /etc/soop_mail/users
```

## Uso

### Modo Producción

1. **Configurar variables de entorno**:
```bash
export FLASK_ENV=production
export SECRET_KEY=tu-clave-secreta-muy-segura-aqui
export MYSQL_HOST=localhost
export MYSQL_USER=soop_mail_admin
export MYSQL_PASSWORD=tu_contraseña
export MYSQL_DATABASE=soop_mail_admin
```

2. **Ejecutar la aplicación** (requiere permisos de root):
```bash
sudo python3 app.py
```

La aplicación estará disponible en `http://localhost:5000`

**Credenciales por defecto:**
- Usuario: `admin`
- Contraseña: `admin123`

⚠️ **IMPORTANTE**: Cambia la contraseña después del primer login!

### Modo Desarrollo

Para desarrollo sin permisos de root:

```bash
export FLASK_ENV=development
export DEVELOPMENT=1
export USERS_FILE=./soop_mail/users
export MAIL_BASE=./soop_mail/mail
export MYSQL_HOST=localhost
export MYSQL_USER=root
export MYSQL_PASSWORD=tu_password
export MYSQL_DATABASE=soop_mail_admin
python3 app.py
```

## Configuración

### Variables de Entorno

Puedes configurar la aplicación mediante variables de entorno o editando `config.py`:

**Base de Datos MySQL:**
- `MYSQL_HOST`: Host de MySQL (default: `localhost`)
- `MYSQL_PORT`: Puerto de MySQL (default: `3306`)
- `MYSQL_USER`: Usuario de MySQL
- `MYSQL_PASSWORD`: Contraseña de MySQL
- `MYSQL_DATABASE`: Nombre de la base de datos (default: `soop_mail_admin`)

**soop MAIL:**
- `SOOP_MAIL_USERS_FILE`: Ruta al archivo de usuarios de soop MAIL (default: `/etc/soop_mail/users`)
- `SOOP_MAIL_BASE`: Directorio base para correos (default: `/var/mail/soop_mail`)
- `SOOP_MAIL_VMAIL_UID`: UID del usuario soop MAIL (default: `5000`)
- `SOOP_MAIL_VMAIL_GID`: GID del grupo soop MAIL (default: `5000`)

**Seguridad:**
- `SECRET_KEY`: Clave secreta para sesiones (¡cambiar en producción!)
- `SESSION_COOKIE_SECURE`: Usar cookies seguras (HTTPS) (default: `False` en desarrollo)
- `FLASK_ENV`: Entorno de Flask (`development`, `production`, `testing`)

### Pool de Conexiones MySQL

El sistema está configurado con un pool de conexiones optimizado:
- **pool_size**: 10 conexiones base
- **max_overflow**: 20 conexiones adicionales
- **pool_recycle**: Recicla conexiones cada 3600 segundos
- **pool_pre_ping**: Verifica conexiones antes de usarlas

## Estructura del Proyecto

```
.
├── app.py                 # Aplicación Flask principal
├── models.py              # Modelos de base de datos (SQLAlchemy)
├── config.py              # Configuración de la aplicación
├── init_db.py             # Script para inicializar base de datos
├── requirements.txt       # Dependencias Python
├── database_setup.sql     # Script SQL para crear BD y usuario
├── .env.example           # Ejemplo de variables de entorno
├── .gitignore             # Archivos ignorados por Git
├── templates/
│   ├── index.html         # Interfaz principal
│   ├── login.html         # Página de login
│   └── register.html      # Página de registro
├── static/
│   ├── css/
│   │   └── style.css      # Estilos
│   └── js/
│       └── app.js         # JavaScript
└── README.md              # Este archivo
```

## API Endpoints

### Autenticación
- `GET /login` - Página de login
- `POST /login` - Iniciar sesión
- `GET /register` - Página de registro
- `POST /register` - Registrar nuevo administrador
- `GET /logout` - Cerrar sesión

### Gestión de Usuarios soop MAIL (requiere autenticación)
- `GET /api/users` - Obtener lista de usuarios
- `POST /api/users` - Crear nuevo usuario
- `PUT /api/users/<email>` - Actualizar contraseña de usuario
- `DELETE /api/users/<email>` - Eliminar usuario
- `POST /api/restart` - Reiniciar servicio soop MAIL

## Seguridad

⚠️ **Importante**: Esta aplicación requiere permisos de root para funcionar correctamente. Asegúrate de:

- **Cambiar la contraseña por defecto** después del primer login
- **Usar HTTPS en producción** (configurar `SESSION_COOKIE_SECURE=True`)
- **Configurar una SECRET_KEY segura** en producción
- **Restringir acceso** a la red local o usar firewall
- **Usar contraseñas fuertes** para MySQL y usuarios administradores
- **Revisar logs de auditoría** regularmente
- **Mantener actualizado** el sistema y dependencias

### Características de Seguridad Implementadas

- ✅ Autenticación con Flask-Login
- ✅ Hash de contraseñas con Bcrypt
- ✅ Sesiones seguras con tokens únicos
- ✅ Protección CSRF (Flask por defecto)
- ✅ Logs de auditoría de todas las acciones
- ✅ Pool de conexiones MySQL seguro
- ✅ Validación de entrada en todos los formularios
- ✅ Protección de rutas con decoradores

## Estructura de Base de Datos

El sistema utiliza las siguientes tablas:

- **users**: Usuarios administradores del sistema
- **user_sessions**: Sesiones activas de usuarios
- **audit_logs**: Registro de auditoría de todas las acciones

## Notas

- La aplicación crea backups automáticos del archivo de usuarios antes de modificarlo
- Los directorios de correo se crean automáticamente al crear un usuario
- El reinicio de soop MAIL es opcional y se puede configurar en cada operación
- Las sesiones expiran automáticamente después de 8 horas de inactividad
- El primer usuario registrado se convierte automáticamente en administrador
- Todos los usuarios pueden gestionar usuarios de soop MAIL (no solo admins)

## Licencia

Este proyecto es de código abierto y está disponible para uso libre.

