"""
Configuración de la aplicación
"""
import os
from datetime import timedelta

class Config:
    """Configuración base"""
    # Flask
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production-12345'
    
    # Base de datos MySQL con pool de conexiones
    MYSQL_HOST = os.environ.get('MYSQL_HOST') or 'localhost'
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT') or 3306)
    MYSQL_USER = os.environ.get('MYSQL_USER') or 'root'
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD') or ''
    MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE') or 'soop_mail_admin'
    
    # SQLAlchemy con pool de conexiones optimizado
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}"
        f"?charset=utf8mb4"
    )
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Configuración del pool de conexiones MySQL
    # Los parámetros del pool van directamente en SQLALCHEMY_ENGINE_OPTIONS
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'max_overflow': 20,
        'pool_recycle': 3600,
        'pool_pre_ping': True
    }
    # Parámetros específicos de PyMySQL van en connect_args
    # Pero Flask-SQLAlchemy los maneja automáticamente desde la URL
    
    # Flask-Login
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Configuración de sesiones
    PERMANENT_SESSION_LIFETIME = timedelta(hours=8)
    SESSION_TIMEOUT = timedelta(hours=8)
    
    # soop MAIL
    SOOP_MAIL_USERS_FILE = os.environ.get('SOOP_MAIL_USERS_FILE') or '/etc/soop_mail/users'
    SOOP_MAIL_BASE = os.environ.get('SOOP_MAIL_BASE') or '/var/mail/soop_mail'
    SOOP_MAIL_VMAIL_UID = int(os.environ.get('SOOP_MAIL_VMAIL_UID') or 5000)
    SOOP_MAIL_VMAIL_GID = int(os.environ.get('SOOP_MAIL_VMAIL_GID') or 5000)
    
    # Desarrollo
    DEVELOPMENT = os.environ.get('DEVELOPMENT', 'False').lower() == 'true'
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'


class DevelopmentConfig(Config):
    """Configuración de desarrollo"""
    DEBUG = True
    DEVELOPMENT = True
    
    # Base de datos SQLite para desarrollo (opcional)
    if os.environ.get('USE_SQLITE'):
        SQLALCHEMY_DATABASE_URI = 'sqlite:///soop_mail_admin.db'
        SQLALCHEMY_ENGINE_OPTIONS = {}


class ProductionConfig(Config):
    """Configuración de producción"""
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SECRET_KEY = os.environ.get('SECRET_KEY')  # Debe estar definida


class TestingConfig(Config):
    """Configuración de testing"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


# Mapeo de configuraciones
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

