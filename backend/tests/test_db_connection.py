import sys
import os
from sqlalchemy import create_engine, text

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
from database import check_db_connection, CONNECTION_LOGS

def test_current_config():
    print("\n--- Probando Configuración Actual ---")
    db_url = config.DATABASE_URL
    masked_url = db_url.split("@")[-1]
    user = db_url.split("//")[-1].split(":")[0]
    
    print(f"URL de base de datos detectada: mysql+pymysql://{user}:****@{masked_url}")
    print(f"Archivo de configuración cargado: backend/.env.{os.getenv('APP_ENV', 'development')}")
    
    success, message = check_db_connection()
    if success:
        print(f"[OK] Conexión exitosa.")
    else:
        print(f"[ERROR] Fallo en la conexión: {message}")
    return success

def test_manual_tcp():
    print("\n--- Probando Conexión TCP Manual ---")
    db_user = os.getenv("MYSQL_USER", "root")
    db_pass = os.getenv("MYSQL_PASSWORD", "")
    db_host = os.getenv("MYSQL_HOST", "localhost")
    db_port = os.getenv("MYSQL_PORT", "3306")
    db_name = os.getenv("MYSQL_DATABASE", "soop_mail_admin")
    
    url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    print(f"Intentando conectar a: {db_host}:{db_port}...")
    
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[OK] Conexión TCP exitosa.")
        return True
    except Exception as e:
        print(f"[ERROR] Fallo en TCP: {e}")
        return False

def test_manual_socket():
    print("\n--- Probando Conexión por Socket Manual ---")
    db_socket = os.getenv("MYSQL_UNIX_SOCKET", "/var/run/mysqld/mysqld.sock")
    db_user = os.getenv("MYSQL_USER", "root")
    db_pass = os.getenv("MYSQL_PASSWORD", "")
    db_name = os.getenv("MYSQL_DATABASE", "soop_mail_admin")
    
    if not os.path.exists(db_socket):
        print(f"[SALTADO] El archivo de socket no existe en: {db_socket}")
        return True
        
    url = f"mysql+pymysql://{db_user}:{db_pass}@/{db_name}?unix_socket={db_socket}"
    print(f"Intentando conectar vía socket: {db_socket}...")
    
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("[OK] Conexión por Socket exitosa.")
        return True
    except Exception as e:
        print(f"[ERROR] Fallo en Socket: {e}")
        return False

def print_summary():
    print("\n" + "="*50)
    print("DETALLES DE LA CONFIGURACIÓN A PROBAR:")
    print(f"  Entorno:      {os.getenv('APP_ENV', 'development')}")
    print(f"  Usuario:      {os.getenv('MYSQL_USER', 'root')}")
    print(f"  Host:         {os.getenv('MYSQL_HOST', 'localhost')}")
    print(f"  Puerto:       {os.getenv('MYSQL_PORT', '3306')}")
    print(f"  Base de Datos: {os.getenv('MYSQL_DATABASE', 'soop_mail_admin')}")
    print(f"  Socket:       {os.getenv('MYSQL_UNIX_SOCKET', 'No configurado')}")
    print(f"  URL Directa:  {config.DATABASE_URL.split('@')[-1]} (password oculta)")
    print("="*50 + "\n")

if __name__ == "__main__":
    print("=== Suite de Pruebas de Conexión MySQL ===")
    print_summary()
    
    results = []
    results.append(test_current_config())
    results.append(test_manual_tcp())
    results.append(test_manual_socket())
    
    print("\n" + "="*40)
    if all(results):
        print("RESUMEN: Todas las pruebas de conexión pasaron exitosamente.")
        sys.exit(0)
    else:
        print("RESUMEN: Se detectaron fallos en algunas pruebas de conexión.")
        sys.exit(1)
