#!/usr/bin/env python3
"""
Script para inicializar la base de datos
"""
import os
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

from app import app, db, User
from config import config

def init_database():
    """Inicializa las tablas de la aplicación y crea el usuario administrador por defecto."""
    with app.app_context():
        # Crear todas las tablas
        print("\nCreando tablas de base de datos...")
        try:
            db.create_all()
            print("[OK] Tablas creadas")
        except Exception as e:
            print(f"[ERROR] No se pudieron crear las tablas: {e}")
            print("Asegúrate de ejecutar el script SQL 'database_setup.sql' y de que la base de datos exista.")
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

