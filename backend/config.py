import os
from dotenv import load_dotenv

def load_environment():
    # Load root .env first to get APP_ENV if present
    root_env = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(root_env):
        load_dotenv(root_env)
        
    # Detect environment from APP_ENV variable, default to 'development'
    app_env = os.getenv("APP_ENV", "dev").lower()
    
    # Map 'dev' and 'prod' to full names if needed
    if app_env == "dev":
        app_env = "development"
    elif app_env == "prod":
        app_env = "production"
        
    env_file = f".env.{app_env}"
    env_path = os.path.join(os.path.dirname(__file__), env_file)
    
    # Fallback to .env if specific file doesn't exist
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        
    print(f"Loading environment from: {env_path}")
    load_dotenv(env_path, override=True)
    return app_env

# Execute loading immediately when imported
APP_ENV = load_environment()

# Export commonly used variables
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Try to construct from individual MySQL variables
    from urllib.parse import quote_plus
    db_user = os.getenv("MYSQL_USER", "root")
    db_pass = os.getenv("MYSQL_PASSWORD", "")
    db_host = os.getenv("MYSQL_HOST", "localhost")
    db_port = os.getenv("MYSQL_PORT", "3306")
    db_name = os.getenv("MYSQL_DATABASE", "soop_mail_admin")
    db_socket = os.getenv("MYSQL_UNIX_SOCKET")
    
    # Encode password to handle special characters like @
    encoded_pass = quote_plus(db_pass)
    
    if db_socket and os.path.exists(db_socket):
        DATABASE_URL = f"mysql+pymysql://{db_user}:{encoded_pass}@/{db_name}?unix_socket={db_socket}"
    else:
        DATABASE_URL = f"mysql+pymysql://{db_user}:{encoded_pass}@{db_host}:{db_port}/{db_name}"
    
    # Overwrite if explicitly provided in .env (though individual variables are safer)
    explicit_url = os.getenv("DATABASE_URL")
    if explicit_url:
        DATABASE_URL = explicit_url

SECRET_KEY = os.getenv("SECRET_KEY", "soop_mail_secret_key_2026_change_me")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
