import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import config

def create_resilient_engine():
    """Tries to create an engine, falling back between Socket and TCP if necessary."""
    db_url = config.DATABASE_URL
    
    # If the default URL fails, we can try to force a different strategy here
    # But usually config.py has already chosen the 'best' one based on file existence
    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        # Test connection
        with engine.connect() as conn:
            pass
        return engine
    except Exception as e:
        print(f"Failed to connect with {db_url}: {e}")
        # If it was a socket attempt, try TCP as fallback
        if "unix_socket" in db_url:
            db_user = os.getenv("MYSQL_USER", "root")
            db_pass = os.getenv("MYSQL_PASSWORD", "")
            db_host = os.getenv("MYSQL_HOST", "localhost")
            db_port = os.getenv("MYSQL_PORT", "3306")
            db_name = os.getenv("MYSQL_DATABASE", "soop_mail_admin")
            fallback_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
            print(f"Attempting fallback to TCP: {fallback_url}")
            return create_engine(fallback_url, pool_pre_ping=True)
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
        # Try to connect and execute a simple query
        with engine.connect() as connection:
            from sqlalchemy import text
            connection.execute(text("SELECT 1"))
        return True, "Conexión exitosa"
    except Exception as e:
        return False, str(e)
