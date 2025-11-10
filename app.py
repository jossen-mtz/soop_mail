#!/usr/bin/env python3
"""
Aplicación web para gestión de usuarios de soop MAIL con autenticación
"""
import os
import re
import subprocess
import shutil
import sys
import getpass
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_bcrypt import Bcrypt
from werkzeug.security import generate_password_hash
from functools import wraps
from dotenv import load_dotenv
import json
import crypt

# Cargar variables de entorno desde .env
load_dotenv()

# Importar configuración y modelos
from config import config
from models import db, User, UserSession, AuditLog

# Inicializar extensiones
login_manager = LoginManager()
bcrypt = Bcrypt()

app = Flask(__name__)

# Cargar configuración
config_name = os.getenv('FLASK_ENV', 'default')
app.config.from_object(config[config_name])

# Inicializar extensiones
db.init_app(app)
login_manager.init_app(app)
bcrypt.init_app(app)

# Configuración de Flask-Login
login_manager.login_view = 'login'
login_manager.login_message = 'Por favor, inicia sesión para acceder a esta página.'
login_manager.login_message_category = 'info'
login_manager.session_protection = "strong"

# Configuración de soop MAIL
IS_DEVELOPMENT = app.config.get('DEVELOPMENT', False)


def _resolve_path(description, expect_dir, candidates):
    """Selecciona la ruta existente más adecuada según los candidatos proporcionados."""
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        expanded = os.path.expanduser(candidate)
        if not os.path.isabs(expanded):
            expanded = os.path.abspath(os.path.join(app.root_path, expanded))
        normalized = os.path.normpath(expanded)
        if normalized in seen:
            continue
        seen.add(normalized)
        
        try:
            if expect_dir and os.path.isdir(normalized):
                app.logger.info(f"[SOOP_CONFIG] Usando {description}: {normalized}")
                return normalized
            if not expect_dir and os.path.isfile(normalized):
                app.logger.info(f"[SOOP_CONFIG] Usando {description}: {normalized}")
                return normalized
        except Exception as e:
            app.logger.debug(f"[SOOP_CONFIG] No se pudo validar {normalized}: {e}")
            continue
    
    fallback = next((c for c in candidates if c), None)
    if fallback:
        expanded_fallback = os.path.expanduser(fallback)
        if not os.path.isabs(expanded_fallback):
            expanded_fallback = os.path.abspath(os.path.join(app.root_path, expanded_fallback))
        app.logger.warning(
            f"[SOOP_CONFIG] No se encontró un {description} existente. "
            f"Usando valor por defecto: {expanded_fallback}"
        )
        return os.path.normpath(expanded_fallback)
    
    app.logger.error(f"[SOOP_CONFIG] No se pudo determinar un {description} válido.")
    return None


_users_candidates = [
    os.getenv('SOOP_MAIL_USERS_FILE'),
    app.config.get('SOOP_MAIL_USERS_FILE'),
    '/etc/soop_mail/users',
    '/etc/dovecot/users',
    '/var/lib/dovecot/users',
    '/var/mail/soop_mail/users',
    '/srv/vmail/users'
]

if IS_DEVELOPMENT:
    _users_candidates.insert(0, os.getenv('USERS_FILE'))
    _users_candidates.append('./soop_mail/users')

USERS_FILE = _resolve_path('archivo de usuarios soop MAIL', expect_dir=False, candidates=_users_candidates)

_mail_base_candidates = [
    os.getenv('SOOP_MAIL_BASE'),
    app.config.get('SOOP_MAIL_BASE'),
    '/var/mail/soop_mail',
    '/var/mail/vmail',
    '/var/vmail',
    '/srv/vmail'
]

if IS_DEVELOPMENT:
    _mail_base_candidates.insert(0, os.getenv('MAIL_BASE'))
    _mail_base_candidates.append('./soop_mail/mail')

MAIL_BASE = _resolve_path('directorio base de correo soop MAIL', expect_dir=True, candidates=_mail_base_candidates)

VMAIL_UID = app.config.get('SOOP_MAIL_VMAIL_UID', 5000)
VMAIL_GID = app.config.get('SOOP_MAIL_VMAIL_GID', 5000)


def ensure_mail_base_permissions():
    """Verifica que el directorio base de correo exista y sea escribible."""
    if not MAIL_BASE:
        raise Exception("El directorio base de correo no está configurado correctamente.")
    
    try:
        if not os.path.exists(MAIL_BASE):
            parent_dir = os.path.dirname(MAIL_BASE) or '/'
            if not os.access(parent_dir, os.W_OK | os.X_OK):
                raise PermissionError(
                    f"No hay permisos para crear {MAIL_BASE}. "
                    f"Ajusta permisos del directorio padre {parent_dir}."
                )
            os.makedirs(MAIL_BASE, exist_ok=True)
            app.logger.info(f"[SOOP_MAIL] Directorio base creado: {MAIL_BASE}")
        
        if not os.path.isdir(MAIL_BASE):
            raise Exception(f"{MAIL_BASE} existe pero no es un directorio.")
        
        if not (os.access(MAIL_BASE, os.W_OK) and os.access(MAIL_BASE, os.X_OK)):
            current_user = getpass.getuser()
            raise PermissionError(
                f"El proceso no tiene permisos de escritura/ejecución en {MAIL_BASE}. "
                f"Asegúrate de que el usuario '{current_user}' o el usuario del servicio tenga acceso."
            )
    except PermissionError as e:
        app.logger.error(f"[SOOP_MAIL] Permisos insuficientes en {MAIL_BASE}: {e}")
        raise
    except Exception as e:
        app.logger.error(f"[SOOP_MAIL] Error al verificar {MAIL_BASE}: {e}")
        raise


def ensure_users_file_permissions():
    """Valida que el archivo de usuarios (o su directorio) sea accesible para escritura."""
    if not USERS_FILE:
        raise Exception("El archivo de usuarios soop MAIL no está configurado correctamente.")
    
    try:
        users_dir = os.path.dirname(USERS_FILE) or '.'
        users_dir = os.path.abspath(users_dir)
        
        if not os.path.exists(users_dir):
            raise PermissionError(
                f"El directorio {users_dir} no existe. Crea el directorio o actualiza SOOP_MAIL_USERS_FILE."
            )
        
        if not os.path.isdir(users_dir):
            raise Exception(f"{users_dir} existe pero no es un directorio válido.")
        
        if not (os.access(users_dir, os.W_OK) and os.access(users_dir, os.X_OK)):
            current_user = getpass.getuser()
            raise PermissionError(
                f"El proceso no tiene permisos de escritura en {users_dir}. "
                f"Asegúrate de que el usuario '{current_user}' o el usuario del servicio tenga acceso."
            )
        
        if os.path.exists(USERS_FILE) and not os.access(USERS_FILE, os.W_OK):
            current_user = getpass.getuser()
            raise PermissionError(
                f"El archivo {USERS_FILE} no es escribible. Ajusta permisos para '{current_user}'."
            )
        
        bak_path = f"{USERS_FILE}.bak"
    except PermissionError as e:
        app.logger.error(f"[SOOP_MAIL] Permisos insuficientes para archivo de usuarios: {e}")
        raise
    except Exception as e:
        app.logger.error(f"[SOOP_MAIL] Error al validar archivo de usuarios: {e}")
        raise


def get_backup_path():
    """Determina la ruta donde se guardará el backup del archivo de usuarios."""
    backup_dir = os.getenv('SOOP_MAIL_USERS_BACKUP_DIR')
    
    if backup_dir:
        backup_dir = os.path.expanduser(backup_dir)
        if not os.path.isabs(backup_dir):
            backup_dir = os.path.abspath(os.path.join(app.root_path, backup_dir))
        try:
            os.makedirs(backup_dir, exist_ok=True)
            if not (os.access(backup_dir, os.W_OK) and os.access(backup_dir, os.X_OK)):
                current_user = getpass.getuser()
                raise PermissionError(
                    f"El directorio de backups {backup_dir} no es escribible "
                    f"por el usuario '{current_user}'."
                )
            return os.path.join(backup_dir, 'users.bak')
        except Exception as e:
            app.logger.warning(f"[SOOP_MAIL] No se pudo utilizar SOOP_MAIL_USERS_BACKUP_DIR ({backup_dir}): {e}")
    
    users_dir = os.path.dirname(USERS_FILE) or '.'
    return os.path.join(users_dir, 'users.bak')


@login_manager.user_loader
def load_user(user_id):
    """Carga el usuario desde la base de datos"""
    return User.query.get(int(user_id))


def admin_required(f):
    """Decorador para requerir permisos de administrador"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Se requieren permisos de administrador'}), 403
            flash('Se requieren permisos de administrador', 'error')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function


def log_audit(action, resource_type=None, resource_id=None, details=None):
    """Registra una acción en el log de auditoría"""
    try:
        log = AuditLog(
            user_id=current_user.id if current_user.is_authenticated else None,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent'),
            details=details
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al registrar auditoría: {str(e)}")


def get_client_ip():
    """Obtiene la IP real del cliente"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


def create_user_session(user, remember=False):
    """Crea una sesión de usuario en la base de datos"""
    try:
        # Limpiar sesiones expiradas
        expired_sessions = UserSession.query.filter(
            UserSession.user_id == user.id,
            UserSession.expires_at < datetime.utcnow()
        ).all()
        for sess in expired_sessions:
            sess.is_active = False
            db.session.delete(sess)
        
        # Crear nueva sesión
        session_token = UserSession.generate_token()
        expires_at = datetime.utcnow() + app.config.get('SESSION_TIMEOUT', timedelta(hours=8))
        
        user_session = UserSession(
            user_id=user.id,
            session_token=session_token,
            ip_address=get_client_ip(),
            user_agent=request.headers.get('User-Agent'),
            expires_at=expires_at
        )
        
        db.session.add(user_session)
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        return session_token
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al crear sesión: {str(e)}")
        return None


def validate_email(email):
    """Valida el formato de email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def generate_password_hash_soop_mail(password):
    """Genera hash de contraseña usando soop-mailtools"""
    try:
        result = subprocess.run(
            ['soop-mailtool', 'pw', '-s', 'SHA512-CRYPT', '-p', password],
            capture_output=True,
            text=True,
            check=True
        )
        raw_hash = result.stdout.strip()
    except subprocess.CalledProcessError as e:
        raise Exception(f"Error al generar hash: {e.stderr}")
    except FileNotFoundError:
        app.logger.warning("[SOOP_MAIL] soop-mailtool no encontrado; usando fallback interno SHA512-CRYPT.")
        salt = crypt.mksalt(crypt.METHOD_SHA512)
        raw_hash = crypt.crypt(password, salt)
    
    if not raw_hash.startswith('{SHA512-CRYPT}'):
        raw_hash = f"{{SHA512-CRYPT}}{raw_hash}"
    return raw_hash


def read_users_file():
    """Lee el archivo de usuarios y retorna lista de usuarios"""
    users = []
    if not os.path.exists(USERS_FILE):
        app.logger.warning(f"[SOOP_USERS] Archivo de usuarios no encontrado: {USERS_FILE}")
        return users
    
    try:
        app.logger.info(f"[SOOP_USERS] Leyendo archivo de usuarios: {USERS_FILE}")
        with open(USERS_FILE, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                parts = line.split(':')
                if len(parts) >= 2:
                    email = parts[0]
                    hash_pw = parts[1]
                    uid = parts[2] if len(parts) > 2 else str(VMAIL_UID)
                    gid = parts[3] if len(parts) > 3 else str(VMAIL_GID)
                    gecos = parts[4] if len(parts) > 4 else ''
                    home = parts[5] if len(parts) > 5 else ''
                    shell = parts[6] if len(parts) > 6 else ''
                    
                    users.append({
                        'email': email,
                        'hash': hash_pw,
                        'uid': uid,
                        'gid': gid,
                        'gecos': gecos,
                        'home': home,
                        'shell': shell
                    })
        app.logger.info(f"[SOOP_USERS] Total de usuarios cargados: {len(users)}")
    except Exception as e:
        app.logger.error(f"[SOOP_USERS] Error al leer archivo {USERS_FILE}: {e}")
        raise Exception(f"Error al leer archivo de usuarios: {str(e)}")
    
    return users


def write_users_file(users):
    """Escribe la lista de usuarios al archivo"""
    try:
        ensure_users_file_permissions()
        backup_path = get_backup_path()
        
        # Crear backup
        if os.path.exists(USERS_FILE):
            try:
                shutil.copy2(USERS_FILE, backup_path)
                app.logger.info(f"[SOOP_USERS] Backup del archivo de usuarios guardado en {backup_path}")
            except PermissionError as e:
                app.logger.warning(
                    f"[SOOP_USERS] No se pudo guardar backup en {backup_path}: {e}. "
                    "Continuando sin backup."
                )
            except Exception as e:
                app.logger.warning(
                    f"[SOOP_USERS] Error inesperado al crear backup ({backup_path}): {e}. "
                    "Continuando sin backup."
                )
        
        # Escribir archivo
        with open(USERS_FILE, 'w') as f:
            for user in users:
                line = f"{user['email']}:{user['hash']}:{user['uid']}:{user['gid']}:{user['gecos']}:{user['home']}:{user['shell']}\n"
                f.write(line)
        
        # Ajustar permisos (solo en Linux)
        if os.name != 'nt':
            os.chmod(USERS_FILE, 0o644)
            try:
                import pwd, grp
                root_uid = pwd.getpwnam('root').pw_uid
                soop_gid = grp.getgrnam('soopmail').gr_gid
                os.chown(USERS_FILE, root_uid, soop_gid)
            except:
                pass  # Ignorar errores de permisos en desarrollo
        
        return True
    except Exception as e:
        raise Exception(
            "Error al escribir archivo de usuarios: "
            f"{e}. Verifica permisos sobre '{USERS_FILE}' o ajusta SOOP_MAIL_USERS_FILE."
        )


def create_mail_directory(email):
    """Crea el directorio de correo para el usuario"""
    try:
        ensure_mail_base_permissions()
        
        domain = email.split('@')[1]
        username = email.split('@')[0]
        mail_dir = os.path.join(MAIL_BASE, domain, username)
        
        os.makedirs(mail_dir, exist_ok=True)
        
        # Ajustar permisos (solo en Linux)
        if os.name != 'nt':
            os.chmod(mail_dir, 0o770)
            try:
                import pwd, grp
                vmail_uid = pwd.getpwnam('vmail').pw_uid
                vmail_gid = grp.getgrnam('vmail').gr_gid
                os.chown(mail_dir, vmail_uid, vmail_gid)
            except:
                pass  # Ignorar errores de permisos en desarrollo
        
        return mail_dir
    except Exception as e:
        raise Exception(
            "Error al crear directorio de correo: "
            f"{e}. Revisa permisos de '{MAIL_BASE}' o configura SOOP_MAIL_BASE."
        )


def restart_soop_mail():
    """Reinicia el servicio soop MAIL"""
    try:
        subprocess.run(['systemctl', 'restart', 'soop-mail'], check=True)
        return True
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError:
        return False  # systemctl no disponible


# ==================== RUTAS DE AUTENTICACIÓN ====================

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Página de login"""
    allow_registration = User.query.count() == 0
    
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        username = data.get('username', '').strip()
        password = data.get('password', '')
        remember = data.get('remember', False)
        
        if not username or not password:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Usuario y contraseña son requeridos'}), 400
            flash('Usuario y contraseña son requeridos', 'error')
            return render_template('login.html', allow_registration=allow_registration)
        
        # Buscar usuario por username o email
        user = User.query.filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if user and user.is_active:
            if bcrypt.check_password_hash(user.password_hash, password):
                # Crear sesión en BD
                create_user_session(user, remember)
                
                # Login con Flask-Login
                login_user(user, remember=remember)
                
                log_audit('LOGIN', details=f'Usuario {user.username} inició sesión')
                
                if request.is_json:
                    return jsonify({
                        'success': True,
                        'message': 'Login exitoso',
                        'user': user.to_dict()
                    })
                
                next_page = request.args.get('next')
                return redirect(next_page) if next_page else redirect(url_for('index'))
            else:
                log_audit('LOGIN_FAILED', details=f'Intento de login fallido para {username}')
                if request.is_json:
                    return jsonify({'success': False, 'error': 'Usuario o contraseña incorrectos'}), 401
                flash('Usuario o contraseña incorrectos', 'error')
        else:
            log_audit('LOGIN_FAILED', details=f'Intento de login para usuario inexistente: {username}')
            if request.is_json:
                return jsonify({'success': False, 'error': 'Usuario o contraseña incorrectos'}), 401
            flash('Usuario o contraseña incorrectos', 'error')
    
    return render_template('login.html', allow_registration=allow_registration)


@app.route('/register', methods=['GET', 'POST'])
def register():
    """Registro inicial de administrador (solo cuando no existen usuarios)"""
    allow_registration = User.query.count() == 0
    
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if not allow_registration:
        flash('El registro está deshabilitado. Inicia sesión con una cuenta existente.', 'error')
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        full_name = data.get('full_name', '').strip()
        password = data.get('password', '')
        password_confirm = data.get('password_confirm', '')
        
        def error_response(message, status=400):
            if request.is_json:
                return jsonify({'success': False, 'error': message}), status
            flash(message, 'error')
            return render_template('register.html', allow_registration=allow_registration), status
        
        if not username or not email or not password or not password_confirm:
            return error_response('Todos los campos son requeridos')
        
        if not validate_email(email):
            return error_response('Formato de email inválido')
        
        if password != password_confirm:
            return error_response('Las contraseñas no coinciden')
        
        if len(password) < 8:
            return error_response('La contraseña debe tener al menos 8 caracteres')
        
        if User.query.filter_by(username=username).first():
            return error_response('El nombre de usuario ya existe')
        
        if User.query.filter_by(email=email).first():
            return error_response('El email ya está registrado')
        
        try:
            password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
            user = User(
                username=username,
                email=email,
                password_hash=password_hash,
                full_name=full_name or username,
                is_active=True,
                is_admin=True
            )
            db.session.add(user)
            db.session.commit()
            
            create_user_session(user, remember=True)
            login_user(user, remember=True)
            log_audit('REGISTER_ADMIN_USER', 'User', str(user.id), f'Usuario administrador {username} registrado desde formulario público')
            
            if request.is_json:
                return jsonify({
                    'success': True,
                    'message': 'Usuario administrador creado exitosamente',
                    'user': user.to_dict()
                })
            
            flash('Cuenta creada exitosamente. Bienvenido.', 'success')
            return redirect(url_for('index'))
        except Exception as e:
            db.session.rollback()
            return error_response(f'Error al registrar usuario: {str(e)}', status=500)
    
    return render_template('register.html', allow_registration=allow_registration)


@app.route('/logout')
@login_required
def logout():
    """Cerrar sesión"""
    username = current_user.username
    log_audit('LOGOUT', details=f'Usuario {username} cerró sesión')
    
    # Desactivar sesiones activas
    UserSession.query.filter_by(user_id=current_user.id, is_active=True).update({'is_active': False})
    db.session.commit()
    
    logout_user()
    flash('Sesión cerrada exitosamente', 'success')
    return redirect(url_for('login'))


# ==================== RUTAS PROTEGIDAS ====================

@app.route('/')
@login_required
def index():
    """Página principal"""
    return render_template('index.html', user=current_user)


@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Obtiene la lista de usuarios"""
    try:
        users = read_users_file()
        app.logger.info(f"[SOOP_USERS] Enviando listado de usuarios. Total: {len(users)}. Archivo: {USERS_FILE}")
        # No exponer el hash completo por seguridad
        users_list = []
        for user in users:
            users_list.append({
                'email': user['email'],
                'uid': user['uid'],
                'gid': user['gid'],
                'home': user['home']
            })
        
        log_audit('LIST_SOOP_MAIL_USERS', 'SoopMailUser', details='Listado de usuarios de soop MAIL')
        
        return jsonify({'success': True, 'users': users_list})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Crea un nuevo usuario"""
    try:
        data = request.json
        email = data.get('email', '').strip()
        password = data.get('password', '')
        password_confirm = data.get('password_confirm', '')
        
        # Validaciones
        if not email:
            return jsonify({'success': False, 'error': 'El email es requerido'}), 400
        
        if not validate_email(email):
            return jsonify({'success': False, 'error': 'Formato de email inválido'}), 400
        
        if not password:
            return jsonify({'success': False, 'error': 'La contraseña es requerida'}), 400
        
        if password != password_confirm:
            return jsonify({'success': False, 'error': 'Las contraseñas no coinciden'}), 400
        
        # Verificar si el usuario ya existe
        users = read_users_file()
        if any(u['email'] == email for u in users):
            return jsonify({'success': False, 'error': 'El usuario ya existe'}), 400
        
        # Generar hash de contraseña
        hash_pw = generate_password_hash_soop_mail(password)
        
        # Crear directorio de correo
        mail_dir = create_mail_directory(email)
        
        # Agregar usuario
        new_user = {
            'email': email,
            'hash': hash_pw,
            'uid': str(VMAIL_UID),
            'gid': str(VMAIL_GID),
            'gecos': '',
            'home': mail_dir,
            'shell': ''
        }
        users.append(new_user)
        
        # Escribir archivo
        write_users_file(users)
        
        log_audit('CREATE_SOOP_MAIL_USER', 'SoopMailUser', email, f'Usuario soop MAIL {email} creado')
        
        # Reiniciar soop MAIL si se solicita
        restart = data.get('restart_soop_mail', False)
        if restart:
            restart_soop_mail()
        
        return jsonify({
            'success': True,
            'message': f'Usuario {email} creado exitosamente',
            'user': {
                'email': email,
                'uid': str(VMAIL_UID),
                'gid': str(VMAIL_GID),
                'home': mail_dir
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/users/<email>', methods=['PUT'])
@login_required
def update_user(email):
    """Actualiza la contraseña de un usuario"""
    try:
        data = request.json
        password = data.get('password', '')
        password_confirm = data.get('password_confirm', '')
        
        # Validaciones
        if not password:
            return jsonify({'success': False, 'error': 'La contraseña es requerida'}), 400
        
        if password != password_confirm:
            return jsonify({'success': False, 'error': 'Las contraseñas no coinciden'}), 400
        
        # Leer usuarios
        users = read_users_file()
        
        # Buscar usuario
        user_found = False
        for user in users:
            if user['email'] == email:
                user_found = True
                # Generar nuevo hash
                user['hash'] = generate_password_hash_soop_mail(password)
                break
        
        if not user_found:
            return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
        
        # Escribir archivo
        write_users_file(users)
        
        log_audit('UPDATE_SOOP_MAIL_USER', 'SoopMailUser', email, f'Contraseña actualizada para {email}')
        
        # Reiniciar soop MAIL si se solicita
        restart = data.get('restart_soop_mail', False)
        if restart:
            restart_soop_mail()
        
        return jsonify({
            'success': True,
            'message': f'Contraseña actualizada para {email}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/users/<email>', methods=['DELETE'])
@login_required
def delete_user(email):
    """Elimina un usuario"""
    try:
        data = request.json or {}
        delete_mail_dir = data.get('delete_mail_dir', False)
        
        # Leer usuarios
        users = read_users_file()
        
        # Buscar y eliminar usuario
        user_found = False
        user_home = None
        for user in users:
            if user['email'] == email:
                user_found = True
                user_home = user['home']
                users.remove(user)
                break
        
        if not user_found:
            return jsonify({'success': False, 'error': 'Usuario no encontrado'}), 404
        
        # Escribir archivo
        write_users_file(users)
        
        log_audit('DELETE_SOOP_MAIL_USER', 'SoopMailUser', email, f'Usuario soop MAIL {email} eliminado')
        
        # Eliminar directorio de correo si se solicita
        if delete_mail_dir and user_home and os.path.exists(user_home):
            try:
                shutil.rmtree(user_home)
            except Exception as e:
                return jsonify({
                    'success': True,
                    'message': f'Usuario eliminado, pero error al eliminar directorio: {str(e)}'
                })
        
        # Reiniciar soop MAIL si se solicita
        restart = data.get('restart_soop_mail', False)
        if restart:
            restart_soop_mail()
        
        return jsonify({
            'success': True,
            'message': f'Usuario {email} eliminado exitosamente'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/restart', methods=['POST'])
@login_required
def restart_service():
    """Reinicia el servicio soop MAIL"""
    try:
        success = restart_soop_mail()
        if success:
            log_audit('RESTART_SOOP_MAIL', details='Servicio soop MAIL reiniciado')
            return jsonify({'success': True, 'message': 'soop MAIL reiniciado exitosamente'})
        else:
            return jsonify({'success': False, 'error': 'No se pudo reiniciar soop MAIL'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== RUTAS DE ADMINISTRACIÓN (SOLO ADMIN) ====================

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_admin_users():
    """Obtiene la lista de usuarios administradores"""
    try:
        users = User.query.all()
        users_list = []
        for user in users:
            users_list.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'full_name': user.full_name,
                'is_active': user.is_active,
                'is_admin': user.is_admin,
                'last_login': user.last_login.isoformat() if user.last_login else None,
                'created_at': user.created_at.isoformat()
            })
        
        log_audit('LIST_ADMIN_USERS', 'User', details='Listado de usuarios administradores')
        
        return jsonify({'success': True, 'users': users_list})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/users', methods=['POST'])
@admin_required
def create_admin_user():
    """Crea un nuevo usuario administrador"""
    try:
        data = request.json
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        password_confirm = data.get('password_confirm', '')
        full_name = data.get('full_name', '').strip()
        is_admin = data.get('is_admin', False)
        is_active = data.get('is_active', True)
        
        # Validaciones
        if not username or not email or not password:
            return jsonify({'success': False, 'error': 'Usuario, email y contraseña son requeridos'}), 400
        
        if not validate_email(email):
            return jsonify({'success': False, 'error': 'Formato de email inválido'}), 400
        
        if password != password_confirm:
            return jsonify({'success': False, 'error': 'Las contraseñas no coinciden'}), 400
        
        if len(password) < 8:
            return jsonify({'success': False, 'error': 'La contraseña debe tener al menos 8 caracteres'}), 400
        
        # Verificar si el usuario ya existe
        if User.query.filter((User.username == username) | (User.email == email)).first():
            return jsonify({'success': False, 'error': 'El usuario o email ya existe'}), 400
        
        # Crear usuario
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            is_active=is_active,
            is_admin=is_admin
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        log_audit('CREATE_ADMIN_USER', 'User', str(new_user.id), f'Usuario administrador {username} creado por {current_user.username}')
        
        return jsonify({
            'success': True,
            'message': f'Usuario {username} creado exitosamente',
            'user': new_user.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_admin_user(user_id):
    """Actualiza un usuario administrador"""
    try:
        user = User.query.get_or_404(user_id)
        data = request.json
        
        # No permitir modificar el último admin
        if user.is_admin and User.query.filter_by(is_admin=True).count() == 1:
            if not data.get('is_admin', True):
                return jsonify({'success': False, 'error': 'No se puede eliminar el último administrador'}), 400
        
        # Actualizar campos
        if 'username' in data:
            new_username = data['username'].strip()
            if new_username != user.username:
                if User.query.filter(User.username == new_username, User.id != user_id).first():
                    return jsonify({'success': False, 'error': 'El usuario ya existe'}), 400
                user.username = new_username
        
        if 'email' in data:
            new_email = data['email'].strip()
            if not validate_email(new_email):
                return jsonify({'success': False, 'error': 'Formato de email inválido'}), 400
            if new_email != user.email:
                if User.query.filter(User.email == new_email, User.id != user_id).first():
                    return jsonify({'success': False, 'error': 'El email ya existe'}), 400
                user.email = new_email
        
        if 'full_name' in data:
            user.full_name = data['full_name'].strip()
        
        if 'password' in data and data['password']:
            password = data['password']
            password_confirm = data.get('password_confirm', '')
            
            if password != password_confirm:
                return jsonify({'success': False, 'error': 'Las contraseñas no coinciden'}), 400
            
            if len(password) < 8:
                return jsonify({'success': False, 'error': 'La contraseña debe tener al menos 8 caracteres'}), 400
            
            user.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        
        if 'is_admin' in data:
            user.is_admin = bool(data['is_admin'])
        
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])
        
        db.session.commit()
        
        log_audit('UPDATE_ADMIN_USER', 'User', str(user_id), f'Usuario {user.username} actualizado por {current_user.username}')
        
        return jsonify({
            'success': True,
            'message': f'Usuario {user.username} actualizado exitosamente',
            'user': user.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_admin_user(user_id):
    """Elimina un usuario administrador"""
    try:
        user = User.query.get_or_404(user_id)
        
        # No permitir eliminar a sí mismo
        if user.id == current_user.id:
            return jsonify({'success': False, 'error': 'No puedes eliminar tu propio usuario'}), 400
        
        # No permitir eliminar el último admin
        if user.is_admin and User.query.filter_by(is_admin=True).count() == 1:
            return jsonify({'success': False, 'error': 'No se puede eliminar el último administrador'}), 400
        
        username = user.username
        
        # Eliminar sesiones del usuario
        UserSession.query.filter_by(user_id=user_id).delete()
        
        # Eliminar usuario
        db.session.delete(user)
        db.session.commit()
        
        log_audit('DELETE_ADMIN_USER', 'User', str(user_id), f'Usuario {username} eliminado por {current_user.username}')
        
        return jsonify({
            'success': True,
            'message': f'Usuario {username} eliminado exitosamente'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== INICIALIZACIÓN ====================

def init_db():
    """Inicializa la base de datos"""
    with app.app_context():
        db.create_all()
        
        # Crear usuario administrador por defecto si no existe
        if User.query.count() == 0:
            # Hash específico proporcionado
            password_hash = '$2b$12$fenERlbUaSGBKSMZWKXS7udwuFiFfOAFVIuqrJBNqgkbKOIkAPucu'
            
            admin = User(
                username='admin',
                email='admin@localhost',
                password_hash=password_hash,
                full_name='Administrador',
                is_active=True,
                is_admin=True
            )
            db.session.add(admin)
            db.session.commit()
            print("Usuario administrador creado: admin")
            print("Hash de contraseña configurado")
            print("¡IMPORTANTE: Cambia la contraseña después del primer login!")


def compile_scss():
    """Compila los archivos SCSS a CSS antes de iniciar el servidor"""
    try:
        # Importar el compilador SCSS
        compile_scss_path = Path(__file__).parent / 'compile_scss.py'
        
        if compile_scss_path.exists():
            print("[SCSS] Compilando SCSS a CSS...")
            result = subprocess.run(
                [sys.executable, str(compile_scss_path)],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent,
                encoding='utf-8',
                errors='replace'
            )
            
            if result.returncode == 0:
                print("[SCSS] CSS compilado exitosamente")
                if result.stdout:
                    # Mostrar solo las líneas importantes
                    for line in result.stdout.split('\n'):
                        if 'OK:' in line or 'ERROR' in line or 'Compilacion' in line:
                            print(f"[SCSS] {line}")
            else:
                print("[SCSS] ADVERTENCIA: Error al compilar SCSS")
                if result.stderr:
                    print(f"[SCSS] {result.stderr}")
        else:
            print("[SCSS] ADVERTENCIA: No se encontro compile_scss.py")
    except Exception as e:
        print(f"[SCSS] ADVERTENCIA: No se pudo compilar SCSS: {e}")
        print("[SCSS] El servidor continuara sin compilar SCSS")


if __name__ == '__main__':
    # Compilar SCSS a CSS antes de iniciar
    compile_scss()
    
    # Crear archivo de usuarios si no existe
    if not os.path.exists(USERS_FILE):
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        with open(USERS_FILE, 'w') as f:
            pass
    
    # Inicializar base de datos
    init_db()
    
    # Ejecutar aplicación
    app.run(host='0.0.0.0', port=5050, debug=app.config.get('DEBUG', False))
