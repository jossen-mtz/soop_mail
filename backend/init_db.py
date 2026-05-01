from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models, auth
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=True)

def init_db():
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if we have any users
    user_count = db.query(models.User).count()
    if user_count == 0:
        print("No users found. Creating initial admin user...")
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_email = os.getenv("ADMIN_EMAIL", "admin@soopmail.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        
        hashed_password = auth.get_password_hash(admin_password)
        admin_user = models.User(
            username=admin_username,
            email=admin_email,
            password_hash=hashed_password,
            full_name="Administrator",
            is_active=True,
            is_admin=True
        )
        db.add(admin_user)
        db.commit()
        print(f"Admin user created: {admin_username} / {admin_password}")
    else:
        print("Database already initialized.")
    
    db.close()

if __name__ == "__main__":
    init_db()
