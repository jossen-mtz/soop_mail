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
        
    print(f"DEBUG: Loading environment from {env_path}")
    load_dotenv(env_path, override=True)
    
    # Critical Diagnostic
    print(f"DEBUG: APP_ENV = {app_env}")
    print(f"DEBUG: MYSQL_DATABASE = {os.getenv('MYSQL_DATABASE')}")
    print(f"DEBUG: DATABASE_URL from system = {os.getenv('DATABASE_URL')}")
    
    return app_env

# Execute loading immediately when imported
APP_ENV = load_environment()

# Export commonly used variables
# Prioritize individual variables if they exist in our .env
db_user = os.getenv("MYSQL_USER")
db_pass = os.getenv("MYSQL_PASSWORD")
db_host = os.getenv("MYSQL_HOST")
db_port = os.getenv("MYSQL_PORT")
db_name = os.getenv("MYSQL_DATABASE")

if all([db_user, db_host, db_name]):
    from urllib.parse import quote_plus
    encoded_pass = quote_plus(db_pass or "")
    DATABASE_URL = f"mysql+pymysql://{db_user}:{encoded_pass}@{db_host}:{db_port or '3306'}/{db_name}"
    print(f"DEBUG: Constructed DATABASE_URL from individual variables: {db_user}:***@{db_host}/{db_name}")
else:
    DATABASE_URL = os.getenv("DATABASE_URL")
    print(f"DEBUG: Using DATABASE_URL from environment: {DATABASE_URL}")

SECRET_KEY = os.getenv("SECRET_KEY", "soop_mail_secret_key_2026_change_me")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
