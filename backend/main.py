import os
import re
import subprocess
import shutil
from passlib.hash import sha512_crypt
from datetime import datetime, timedelta
from typing import List, Optional
import platform
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from tempfile import NamedTemporaryFile

import config
import models, schemas, auth, database
from database import engine, get_db, check_db_connection

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="soop MAIL API")

@app.on_event("startup")
def startup_db_check():
    success, message = check_db_connection()
    if not success:
        print(f"CRITICAL: Database connection failed: {message}")
    else:
        print(f"SUCCESS: {message}")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from environment
USERS_FILE = os.getenv("SOOP_MAIL_USERS_FILE", "/etc/dovecot/users")
MAIL_BASE = os.getenv("SOOP_MAIL_BASE", "/var/mail/vhosts")
POSTFIX_VMAILBOX = os.getenv("POSTFIX_VMAILBOX", "/etc/postfix/vmailbox")
VMAIL_UID = int(os.getenv("SOOP_MAIL_VMAIL_UID", 5000))
VMAIL_GID = int(os.getenv("SOOP_MAIL_VMAIL_GID", 5000))

# Path to static files
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Helper Functions
def log_audit(db: Session, user_id: Optional[int], action: str, resource_type: str = None, resource_id: str = None, details: str = None, request: Request = None):
    ip = request.client.host if request else None
    ua = request.headers.get("user-agent") if request else None
    db_item = models.AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip,
        user_agent=ua,
        details=details
    )
    db.add(db_item)
    db.commit()

def validate_email_format(email: str):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def count_emails(mail_dir: str):
    if not mail_dir or not os.path.exists(mail_dir):
        return 0
    count = 0
    
    # Try direct subdirs and nested Maildir subdir
    possible_paths = [mail_dir]
    if os.path.exists(os.path.join(mail_dir, 'Maildir')):
        possible_paths.append(os.path.join(mail_dir, 'Maildir'))
        
    for base in possible_paths:
        # Standard Maildir structure: cur, new, tmp
        for subdir in ['cur', 'new']:
            path = os.path.join(base, subdir)
            if os.path.exists(path) and os.path.isdir(path):
                try:
                    count += len([f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))])
                except Exception:
                    pass
    return count

def get_dir_size(path):
    total_size = 0
    if not os.path.exists(path):
        return 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    except:
        pass
    return total_size

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} PB"

def generate_soop_mail_hash(password: str):
    # This logic matches the original app.py
    try:
        result = subprocess.run(
            ['soop-mailtool', 'pw', '-s', 'SHA512-CRYPT', '-p', password],
            capture_output=True,
            text=True,
            check=True
        )
        raw_hash = result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        raw_hash = sha512_crypt.hash(password)
    
    if not raw_hash.startswith('{SHA512-CRYPT}'):
        raw_hash = f"{{SHA512-CRYPT}}{raw_hash}"
    return raw_hash

def read_users_file():
    users = []
    if not os.path.exists(USERS_FILE):
        return users
    try:
        with open(USERS_FILE, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split(':')
                if len(parts) >= 2:
                    users.append({
                        'email': parts[0],
                        'hash': parts[1],
                        'uid': parts[2] if len(parts) > 2 else str(VMAIL_UID),
                        'gid': parts[3] if len(parts) > 3 else str(VMAIL_GID),
                        'gecos': parts[4] if len(parts) > 4 else '',
                        'home': parts[5] if len(parts) > 5 else '',
                        'shell': parts[6] if len(parts) > 6 else ''
                    })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading users file: {str(e)}")
    return users

def update_postfix_vmailbox(users: List[dict]):
    try:
        postfix_dir = os.path.dirname(POSTFIX_VMAILBOX) or '.'
        with NamedTemporaryFile('w', dir=postfix_dir, delete=False) as tmp:
            temp_path = tmp.name
            for user in users:
                # Format: user@domain.com  domain.com/user/
                email = user['email']
                domain = email.split('@')[1]
                username = email.split('@')[0]
                # Note: Postfix usually expects the relative path from virtual_mailbox_base
                line = f"{email} {domain}/{username}/\n"
                tmp.write(line)
        
        if os.name != 'nt':
            os.chmod(temp_path, 0o644)
        shutil.move(temp_path, POSTFIX_VMAILBOX)
        
        # Run postmap
        try:
            subprocess.run(['postmap', POSTFIX_VMAILBOX], check=True)
        except Exception as e:
            print(f"Warning: Could not run postmap: {str(e)}")
            
        return True
    except Exception as e:
        print(f"Error updating Postfix vmailbox: {str(e)}")
        return False

def write_users_file(users: List[dict]):
    try:
        users_dir = os.path.dirname(USERS_FILE) or '.'
        with NamedTemporaryFile('w', dir=users_dir, delete=False) as tmp:
            temp_path = tmp.name
            for user in users:
                line = f"{user['email']}:{user['hash']}:{user['uid']}:{user['gid']}:{user['gecos']}:{user['home']}:{user['shell']}\n"
                tmp.write(line)
        
        if os.name != 'nt':
            os.chmod(temp_path, 0o644)
        shutil.move(temp_path, USERS_FILE)
        
        # Also update Postfix vmailbox to keep them in sync
        update_postfix_vmailbox(users)
        
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error writing users file: {str(e)}")

# Auth Routes
@app.post("/api/auth/login", response_model=schemas.Token)
async def login(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    username = form_data.get("username")
    password = form_data.get("password")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not auth.verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    user.last_login = datetime.utcnow()
    db.commit()
    
    log_audit(db, user.id, "LOGIN", details=f"User {user.username} logged in", request=request)
    
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/register", response_model=schemas.UserOut)
async def register_user(
    user_data: schemas.UserRegister,
    request: Request,
    db: Session = Depends(get_db)
):
    # Check if username or email already exists
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado")
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado")
    
    # First user registered is always admin
    is_first_user = db.query(models.User).count() == 0
    
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        is_admin=is_first_user or user_data.is_admin,
        is_active=True,
        password_hash=auth.get_password_hash(user_data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_audit(db, new_user.id, "REGISTER", "User", str(new_user.id), f"Usuario registrado: {new_user.username}", request=request)
    
    return new_user

@app.get("/api/auth/me", response_model=schemas.UserOut)
async def read_users_me(current_user: models.User = Depends(auth.get_current_active_user)):
    return current_user

@app.post("/api/auth/change-password")
async def change_password(
    data: schemas.UserPasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if not auth.verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
        
    current_user.password_hash = auth.get_password_hash(data.new_password)
    db.commit()
    
    log_audit(db, current_user.id, "CHANGE_PASSWORD", "User", str(current_user.id), "User changed their own password")
    
    return {"message": "Password changed successfully"}

@app.get("/api/system/logs", response_model=List[schemas.AuditLogOut])
async def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(limit).all()
    return logs

# System User Management
@app.get("/api/system/users", response_model=List[schemas.UserOut])
async def get_system_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    return db.query(models.User).all()

@app.post("/api/system/users", response_model=schemas.UserOut)
async def create_system_user(
    user_data: schemas.UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    # Check if username or email already exists
    if db.query(models.User).filter(models.User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        is_admin=user_data.is_admin,
        is_active=user_data.is_active,
        password_hash=auth.get_password_hash(user_data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_audit(db, current_user.id, "CREATE_SYSTEM_USER", "User", str(new_user.id), f"Created system user {new_user.username}", request=request)
    
    return new_user

@app.delete("/api/system/users/{user_id}")
async def delete_system_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    username = user.username
    db.delete(user)
    db.commit()
    
    log_audit(db, current_user.id, "DELETE_SYSTEM_USER", "User", str(user_id), f"Deleted system user {username}", request=request)
    
    return {"message": "User deleted successfully"}

# User Management (Mail Users)
@app.get("/api/mail/users", response_model=List[schemas.SoopMailUserBase])
async def get_mail_users(current_user: models.User = Depends(auth.get_current_active_user)):
    users = read_users_file()
    return [
        {
            "email": u['email'],
            "uid": u['uid'],
            "gid": u['gid'],
            "home": u['home'],
            "email_count": count_emails(u['home'])
        } for u in users
    ]

@app.post("/api/mail/users", status_code=status.HTTP_201_CREATED)
async def create_mail_user(
    user_data: schemas.SoopMailUserCreate, 
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if user_data.password != user_data.password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    if not validate_email_format(user_data.email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    users = read_users_file()
    if any(u['email'] == user_data.email for u in users):
        raise HTTPException(status_code=400, detail="User already exists")
    
    pw_hash = generate_soop_mail_hash(user_data.password)
    
    domain = user_data.email.split('@')[1]
    username = user_data.email.split('@')[0]
    mail_dir = os.path.join(MAIL_BASE, domain, username)
    
    # Create directory logic
    try:
        os.makedirs(mail_dir, exist_ok=True)
        if os.name != 'nt':
            os.chmod(mail_dir, 0o770)
            # In a real system, you'd chown here if running as root
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating mail directory: {str(e)}")
    
    new_user = {
        'email': user_data.email,
        'hash': pw_hash,
        'uid': str(VMAIL_UID),
        'gid': str(VMAIL_GID),
        'gecos': '',
        'home': mail_dir,
        'shell': ''
    }
    users.append(new_user)
    write_users_file(users)
    
    log_audit(db, current_user.id, "CREATE_MAIL_USER", "MailUser", user_data.email, f"Created mail user {user_data.email}", request=request)
    
    if user_data.restart_soop_mail:
        try:
            subprocess.run(['systemctl', 'restart', 'soop-mail'], check=True)
        except:
            pass # Ignore if not available
            
    return {"message": "User created successfully", "email": user_data.email}

@app.put("/api/mail/users/{email}")
async def update_mail_user(
    email: str,
    user_data: schemas.SoopMailUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if user_data.password != user_data.password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    users = read_users_file()
    user_found = False
    for u in users:
        if u['email'] == email:
            u['hash'] = generate_soop_mail_hash(user_data.password)
            user_found = True
            break
            
    if not user_found:
        raise HTTPException(status_code=404, detail="User not found")
        
    write_users_file(users)
    log_audit(db, current_user.id, "UPDATE_MAIL_USER", "MailUser", email, f"Updated password for {email}", request=request)
    
    if user_data.restart_soop_mail:
        try:
            subprocess.run(['systemctl', 'restart', 'soop-mail'], check=True)
        except:
            pass
            
    return {"message": "Password updated successfully"}

@app.delete("/api/mail/users/{email}")
async def delete_mail_user(
    email: str, 
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    users = read_users_file()
    new_users = [u for u in users if u['email'] != email]
    
    if len(new_users) == len(users):
        raise HTTPException(status_code=404, detail="User not found")
    
    write_users_file(new_users)
    log_audit(db, current_user.id, "DELETE_MAIL_USER", "MailUser", email, f"Deleted mail user {email}", request=request)
    
    return {"message": "User deleted successfully"}

# System Status
@app.get("/api/system/status", response_model=schemas.SystemStatus)
async def get_system_status(current_user: models.User = Depends(auth.get_current_active_user)):
    service_active = False
    postfix_active = False
    dovecot_active = False
    postfix_config_ok = True
    postfix_config_error = ""
    dovecot_config_ok = True
    dovecot_config_error = ""
    
    try:
        if os.name != 'nt':
            # Main soop-mail service
            result = subprocess.run(['systemctl', 'is-active', 'soop-mail'], capture_output=True, text=True)
            service_active = result.stdout.strip() == 'active'
            
            # Postfix service
            result = subprocess.run(['systemctl', 'is-active', 'postfix'], capture_output=True, text=True)
            postfix_active = result.stdout.strip() == 'active'
            
            # Dovecot service
            result = subprocess.run(['systemctl', 'is-active', 'dovecot'], capture_output=True, text=True)
            dovecot_active = result.stdout.strip() == 'active'
            
            # Verify Postfix configuration
            pf_check = subprocess.run(['postfix', 'check'], capture_output=True, text=True)
            if pf_check.returncode != 0:
                postfix_config_ok = False
                postfix_config_error = pf_check.stderr.strip()
                
            # Verify Dovecot configuration
            dv_check = subprocess.run(['doveadm', 'config'], capture_output=True, text=True)
            if dv_check.returncode != 0:
                dovecot_config_ok = False
                dovecot_config_error = dv_check.stderr.strip()
        else:
            # Mock for Windows dev
            service_active = True
            postfix_active = True
            dovecot_active = True
            postfix_config_ok = True
            dovecot_config_error = "No errors detected (Mock)"
            dovecot_config_ok = True
            dovecot_config_error = "No errors detected (Mock)"
    except Exception as e:
        service_active = False
        postfix_config_error = str(e)
        
    success_db, message_db = check_db_connection()
    users = read_users_file()
    total_emails = sum(count_emails(u['home']) for u in users)
    mail_base_size = get_dir_size(MAIL_BASE)
        
    details = {
        "os": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "mail_base": MAIL_BASE,
        "users_file": USERS_FILE,
        "current_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_emails": total_emails,
        "mail_base_size": format_size(mail_base_size),
        "postfix_active": postfix_active,
        "dovecot_active": dovecot_active,
        "postfix_config_ok": postfix_config_ok,
        "postfix_config_error": postfix_config_error,
        "dovecot_config_ok": dovecot_config_ok,
        "dovecot_config_error": dovecot_config_error,
        "db_connected": success_db,
        "db_message": message_db,
        "database_logs": database.CONNECTION_LOGS
    }
    
    if os.name != 'nt':
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_seconds = float(f.readline().split()[0])
                details["uptime"] = str(timedelta(seconds=int(uptime_seconds)))
        except:
            pass
        
        try:
            usage = shutil.disk_usage(MAIL_BASE)
            details["disk_total"] = f"{usage.total / (1024**3):.2f} GB"
            details["disk_used"] = f"{usage.used / (1024**3):.2f} GB"
            details["disk_free"] = f"{usage.free / (1024**3):.2f} GB"
        except:
            pass

    return {
        "status": "online",
        "service_active": service_active,
        "details": details
    }

@app.get("/api/system/db-status")
def get_db_status(current_user: models.User = Depends(auth.get_current_admin_user)):
    success, message = check_db_connection()
    return {
        "connected": success,
        "message": message,
        "timestamp": datetime.now()
    }

# Serve Frontend
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # If it's an API route, let it pass (though FastAPI handles this by order)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        
        # Check if the file exists in static
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Otherwise serve index.html for SPA routing
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Static files not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
