import os
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import config

CONNECTION_LOGS = []

def log_connection_attempt(url, success, error=None):
    """Adds a log entry for a connection attempt."""
    entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "strategy": "Socket" if "unix_socket" in url else "TCP",
        "url": url.split("@")[-1], # Mask credentials
        "success": success,
        "error": error
    }
    CONNECTION_LOGS.append(entry)
    # Keep only the last 10 logs
    if len(CONNECTION_LOGS) > 10:
        CONNECTION_LOGS.pop(0)

def create_resilient_engine():
    """Tries to create an engine, falling back between Socket and TCP if necessary."""
    db_url = config.DATABASE_URL
    
    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            log_connection_attempt(db_url, True)
            pass
        return engine
    except Exception as e:
        error_msg = str(e)
        log_connection_attempt(db_url, False, error_msg)
        print(f"Failed to connect with {db_url}: {error_msg}")
        
        if "unix_socket" in db_url:
            from urllib.parse import quote_plus
            db_user = os.getenv("MYSQL_USER", "root")
            db_pass = os.getenv("MYSQL_PASSWORD", "")
            db_host = os.getenv("MYSQL_HOST", "localhost")
            db_port = os.getenv("MYSQL_PORT", "3306")
            db_name = os.getenv("MYSQL_DATABASE", "soop_mail_admin")
            
            encoded_pass = quote_plus(db_pass)
            fallback_url = f"mysql+pymysql://{db_user}:{encoded_pass}@{db_host}:{db_port}/{db_name}"
            
            try:
                print(f"Socket falló. Intentando fallback a TCP...")
                engine = create_engine(fallback_url, pool_pre_ping=True)
                with engine.connect() as conn:
                    log_connection_attempt(fallback_url, True)
                    pass
                print(f"Fallback to TCP successful")
                return engine
            except Exception as e2:
                log_connection_attempt(fallback_url, False, str(e2))
                raise e2
        raise e

engine = create_resilient_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_db_connection():
    """Validates the MySQL connection and returns status/error."""
    try:
        with engine.connect() as connection:
            from sqlalchemy import text
            connection.execute(text("SELECT 1"))
        return True, "Conexión exitosa"
    except Exception as e:
        return False, str(e)
