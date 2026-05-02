import os
from dotenv import load_dotenv

def load_environment():
    # Detect environment from APP_ENV variable, default to 'development'
    app_env = os.getenv("APP_ENV", "development").lower()
    
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
SECRET_KEY = os.getenv("SECRET_KEY")
