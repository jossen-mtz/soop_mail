#!/usr/bin/env python3
"""
Script para inicializar la base de datos
"""
from dotenv import load_dotenv
import os
import pymysql

# Cargar variables de entorno desde .env
load_dotenv()

from app import app, db, User, bcrypt
from config import config

def create_database_if_not_exists():
    """Crea la base de datos si no existe"""
    # Obtener credenciales de configuración
    mysql_host = os.getenv('MYSQL_HOST', 'localhost')
    mysql_port = int(os.getenv('MYSQL_PORT', 3306))
    mysql_user = os.getenv('MYSQL_USER', 'root')
    mysql_password = os.getenv('MYSQL_PASSWORD', '')
    mysql_database = os.getenv('MYSQL_DATABASE', 'soop_mail_admin')
    
    try:
        # Conectar a MySQL sin especificar base de datos
        print(f"Conectando a MySQL en {mysql_host}:{mysql_port}...")
        connection = pymysql.connect(
            host=mysql_host,
            port=mysql_port,
            user=mysql_user,
            password=mysql_password,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # Verificar si la base de datos existe
            cursor.execute("SHOW DATABASES LIKE %s", (mysql_database,))
            result = cursor.fetchone()
            
            if not result:
                print(f"Creando base de datos '{mysql_database}'...")
                cursor.execute(f"CREATE DATABASE {mysql_database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                print(f"[OK] Base de datos '{mysql_database}' creada")
            else:
                print(f"[OK] Base de datos '{mysql_database}' ya existe")
        
        connection.close()
        return True
    except Exception as e:
        print(f"[ERROR] Error al crear la base de datos: {str(e)}")
        return False

def init_database():
    """Inicializa la base de datos y crea usuario administrador"""
    # Primero crear la base de datos si no existe
    if not create_database_if_not_exists():
        print("\nNo se pudo crear la base de datos. Verifica las credenciales en .env")
        return
    
    with app.app_context():
        # Crear todas las tablas
        print("\nCreando tablas de base de datos...")
        try:
            db.create_all()
            print("[OK] Tablas creadas")
        except Exception as e:
            print(f"[ERROR] Error al crear tablas: {str(e)}")
            return
        
        # Verificar si ya existe un usuario
        if User.query.count() > 0:
            print("La base de datos ya tiene usuarios.")
            return
        
        # Crear usuario administrador por defecto
        print("\nCreando usuario administrador por defecto...")
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
        
        print("[OK] Usuario administrador creado:")
        print("  Usuario: admin")
        print("  Hash de contraseña configurado")
        print("\n[IMPORTANTE] Cambia la contraseña después del primer login!")

if __name__ == '__main__':
    # Cargar configuración
    config_name = os.getenv('FLASK_ENV', 'default')
    app.config.from_object(config[config_name])
    
    init_database()

