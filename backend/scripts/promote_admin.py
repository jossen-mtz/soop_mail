import os
import sys
from sqlalchemy import create_all
from sqlalchemy.orm import Session

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models
from database import SessionLocal, engine

def promote_user(username):
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            user.is_admin = True
            db.commit()
            print(f"SUCCESS: User '{username}' is now an admin.")
        else:
            print(f"ERROR: User '{username}' not found.")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python promote_admin.py <username>")
    else:
        promote_user(sys.argv[1])
