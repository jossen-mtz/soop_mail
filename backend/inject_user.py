from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models, auth
import os
from dotenv import load_dotenv

# Path to .env relative to this script
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path, override=True)

def inject_admin():
    db = SessionLocal()
    
    username = "admin"
    email = "admin@soopmail.com"
    password = "123jossenM"
    
    # Check if user exists
    user = db.query(models.User).filter(models.User.username == username).first()
    
    hashed_password = auth.get_password_hash(password)
    
    if user:
        print(f"Updating existing user: {username}")
        user.password_hash = hashed_password
        user.is_admin = True
        user.is_active = True
    else:
        print(f"Creating new admin user: {username}")
        user = models.User(
            username=username,
            email=email,
            password_hash=hashed_password,
            full_name="Administrator",
            is_active=True,
            is_admin=True
        )
        db.add(user)
    
    db.commit()
    print(f"Admin user injected successfully: {username} / {password}")
    db.close()

if __name__ == "__main__":
    inject_admin()
