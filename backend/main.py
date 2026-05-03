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
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from tempfile import NamedTemporaryFile
import asyncio
import json

import config
import models, schemas, auth, database
from database import engine, get_db, check_db_connection

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="sarsoop labs API")

@app.on_event("startup")
def startup_tasks():
    success, message = check_db_connection()
    if not success:
        print(f"CRITICAL: Database connection failed: {message}")
        return
    
    print(f"SUCCESS: {message}")
    
    # Mail System Diagnostics
    print("--- MAIL SYSTEM DIAGNOSTICS ---")
    files_to_check = {
        "USERS_FILE": USERS_FILE,
        "POSTFIX_VIRTUAL": VIRTUAL_MAP,
        "POSTFIX_VMAILBOX": VMAILBOX_MAP,
        "ALIAS_META_FILE": ALIAS_META_FILE,
        "SENDER_BCC_FILE": SENDER_BCC_FILE,
        "RECIPIENT_BCC_FILE": RECIPIENT_BCC_FILE,
        "MAIL_BASE": MAIL_BASE
    }
    
    # Ensure Postfix main.cf has BCC and Virtual maps configured
    if os.name != 'nt':
        _ensure_postfix_config()
        
        # Verify Postfix maps are correct
        print("--- POSTFIX MAP VERIFICATION ---")
        postfix_maps = {
            "recipient_bcc_maps": f"hash:{RECIPIENT_BCC_FILE}",
            "sender_bcc_maps": f"hash:{SENDER_BCC_FILE}",
            "virtual_alias_maps": f"hash:{VIRTUAL_MAP}",
            "virtual_mailbox_maps": f"hash:{VMAILBOX_MAP}"
        }
        for param, expected in postfix_maps.items():
            try:
                current = subprocess.run(['postconf', '-h', param], capture_output=True, text=True).stdout.strip()
                if expected in current:
                    print(f"OK: {param} is correctly configured")
                else:
                    print(f"WARNING: {param} is NOT pointing to {expected} (Current: {current})")
            except Exception as e:
                print(f"ERROR: Could not verify {param}: {str(e)}")
    
    # Initialize ALIAS_META_FILE if missing
    if not os.path.exists(ALIAS_META_FILE):
        try:
            os.makedirs(os.path.dirname(ALIAS_META_FILE), exist_ok=True)
            with open(ALIAS_META_FILE, 'w') as f:
                json.dump({}, f)
            print(f"INFO: Created missing metadata file: {ALIAS_META_FILE}")
        except Exception as e:
            print(f"ERROR: Could not initialize {ALIAS_META_FILE}: {str(e)}")

    for name, path in files_to_check.items():
        exists = os.path.exists(path)
        parent_dir = os.path.dirname(path)
        parent_exists = os.path.exists(parent_dir)
        writable = os.access(parent_dir, os.W_OK) if parent_exists else False
        status = "OK" if exists else "NOT FOUND"
        write_status = "WRITABLE" if writable else "NOT WRITABLE"
        print(f"DIAG: {name}: {path} [{status}] [{write_status}]")
    print("-------------------------------")
    
    # Create default admin if database is empty
    db = next(get_db())
    try:
        admin_user = db.query(models.User).first()
        if not admin_user:
            admin_username = os.getenv("ADMIN_USERNAME", "admin")
            admin_password = os.getenv("ADMIN_PASSWORD", "admin")
            admin_email = os.getenv("ADMIN_EMAIL", "admin@soopmail.com")
            
            print(f"INFO: No admin users found. Creating default admin: {admin_username}")
            
            new_admin = models.User(
                username=admin_username,
                email=admin_email,
                full_name="Administrator",
                is_active=True,
                password_hash=auth.get_password_hash(admin_password)
            )
            db.add(new_admin)
            db.commit()
            print("INFO: Default admin created successfully.")
    except Exception as e:
        print(f"ERROR: Could not create default admin: {str(e)}")
    finally:
        db.close()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Move metadata file to local directory instead of /etc/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Configuration from environment
USERS_FILE = os.environ.get('SOOP_MAIL_USERS_FILE', os.environ.get('USERS_FILE', os.path.join(BASE_DIR, 'users')))
print(f"DEBUG: USERS_FILE path: {USERS_FILE} (exists: {os.path.exists(USERS_FILE)})")
ALIAS_META_FILE = os.environ.get('ALIAS_META_FILE', os.path.join(BASE_DIR, 'aliases_meta.json'))

SENDER_BCC_FILE = os.environ.get('SENDER_BCC_FILE', os.path.join(BASE_DIR, 'sender_bcc'))
RECIPIENT_BCC_FILE = os.environ.get('RECIPIENT_BCC_FILE', os.path.join(BASE_DIR, 'recipient_bcc'))
VIRTUAL_MAP = os.environ.get('POSTFIX_VIRTUAL', os.path.join(BASE_DIR, 'virtual'))
VMAILBOX_MAP = os.environ.get('POSTFIX_VMAILBOX', os.path.join(BASE_DIR, 'vmailbox'))

# Backward compatibility aliases
POSTFIX_VIRTUAL = VIRTUAL_MAP
POSTFIX_VMAILBOX = VMAILBOX_MAP

POSTFIX_SENDER_RESTRICTIONS = os.environ.get('POSTFIX_SENDER_RESTRICTIONS', os.path.join(BASE_DIR, 'sender_restrictions'))
MAIL_BASE = os.environ.get('SOOP_MAIL_BASE', os.environ.get('MAIL_BASE', os.path.join(BASE_DIR, 'vhosts')))
print(f"DEBUG: MAIL_BASE path: {MAIL_BASE} (exists: {os.path.exists(MAIL_BASE)})")
VMAIL_UID = int(os.getenv("SOOP_MAIL_VMAIL_UID", 5000))
VMAIL_GID = int(os.getenv("SOOP_MAIL_VMAIL_GID", 5000))
DEFAULT_DOMAIN = os.getenv("DEFAULT_DOMAIN", "mmbtransporte.com")

# Path to static files
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Helper Functions
def log_audit(db: Session, user_id: Optional[int], action: str, resource_type: str = None, resource_id: str = None, details: str = None, request: Request = None):
    ip = request.client.host if request and request.client else None
    ua = request.headers.get("user-agent") if request and hasattr(request, 'headers') else None
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

def validate_password_format(password: str):
    return len(password) >= 8

def get_password_hash(password: str):
    return sha512_crypt.hash(password, rounds=5000)

def verify_password(plain_password: str, hashed_password: str):
    return sha512_crypt.verify(plain_password, hashed_password)

def validate_email_format(email: str):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def _ensure_postfix_config():
    """Checks and adds critical maps to main.cf if missing."""
    if os.name == 'nt':
        return

    try:
        changed = False
        
        # List of maps to ensure (Parameter, expected_value)
        maps_to_ensure = [
            ("recipient_bcc_maps", f"hash:{RECIPIENT_BCC_FILE}"),
            ("sender_bcc_maps", f"hash:{SENDER_BCC_FILE}"),
            ("virtual_alias_maps", f"hash:{VIRTUAL_MAP}"),
            ("virtual_mailbox_maps", f"hash:{VMAILBOX_MAP}")
        ]
        
        for param, expected in maps_to_ensure:
            try:
                # Check current value
                current = subprocess.run(['postconf', '-h', param], capture_output=True, text=True).stdout.strip()
                
                # If the expected value is not in current, we append it or set it
                if not current:
                    print(f"INFO: Setting {param} to {expected}")
                    subprocess.run(['postconf', '-e', f"{param} = {expected}"], check=True)
                    changed = True
                elif expected not in current:
                    # Append it if it's not there (comma separated)
                    new_value = f"{current}, {expected}"
                    print(f"INFO: Updating {param} to {new_value}")
                    subprocess.run(['postconf', '-e', f"{param} = {new_value}"], check=True)
                    changed = True
            except Exception as e:
                print(f"WARNING: Could not check/set {param}: {str(e)}")

        # Ensure files exist and are indexed
        for fpath in [RECIPIENT_BCC_FILE, SENDER_BCC_FILE, VIRTUAL_MAP, VMAILBOX_MAP]:
            if not os.path.exists(fpath):
                print(f"INFO: Creating missing Postfix map file: {fpath}")
                try:
                    os.makedirs(os.path.dirname(fpath), exist_ok=True)
                    with open(fpath, 'w') as f:
                        f.write(f"# Postfix map file: {os.path.basename(fpath)}\n")
                    subprocess.run(['postmap', fpath], check=True)
                    changed = True
                except Exception as e:
                    print(f"ERROR: Could not create/index {fpath}: {str(e)}")

        if changed:
            print("INFO: Reloading Postfix to apply changes")
            try:
                subprocess.run(['postfix', 'reload'], check=True)
            except:
                subprocess.run(['systemctl', 'reload', 'postfix'], check=True)

    except Exception as e:
        print(f"ERROR: General failure in _ensure_postfix_config: {str(e)}")

def get_mailbox_stats(mail_dir: str):
    if not mail_dir:
        return 0, 0, 0, ""
        
    # Extraer dominio y usuario de la ruta original para buscar en bases alternativas
    parts = mail_dir.strip('/').split('/')
    domain = parts[-2] if len(parts) >= 2 else DEFAULT_DOMAIN
    username = parts[-1] if len(parts) >= 1 else ""
    
    # Bases donde buscaremos para sumar todo
    MAILBOX_BASES = ["/var/mail/vhosts", "/var/mail/soop_mail"]
    
    total = 0
    new = 0
    size_bytes = 0
    resolved_paths = []

    for base in MAILBOX_BASES:
        mailbox_path = os.path.join(base, domain, username)
        if not os.path.exists(mailbox_path):
            continue
            
        resolved_paths.append(mailbox_path)
        try:
            for root, dirs, files in os.walk(mailbox_path):
                folder_name = os.path.basename(root)
                # Solo contar en carpetas cur y new (estándar Maildir)
                if folder_name in ("cur", "new"):
                    is_new_dir = folder_name == "new"
                    for file in files:
                        # Ignorar archivos de índice/control de dovecot
                        if file.startswith("dovecot"):
                            continue
                            
                        total += 1
                        if is_new_dir:
                            new += 1
                            
                        try:
                            fp = os.path.join(root, file)
                            if not os.path.islink(fp):
                                size_bytes += os.path.getsize(fp)
                        except:
                            pass
        except Exception as e:
            print(f"DEBUG: Error al leer {mailbox_path}: {str(e)}")
            
    # Si no se encontró en ninguna base estándar, usamos la ruta original del archivo
    if not resolved_paths and os.path.exists(mail_dir):
        resolved_paths.append(mail_dir)
        try:
            for root, dirs, files in os.walk(mail_dir):
                folder_name = os.path.basename(root)
                if folder_name in ("cur", "new"):
                    is_new_dir = folder_name == "new"
                    for file in files:
                        if file.startswith("dovecot"):
                            continue
                        total += 1
                        if is_new_dir: new += 1
                        try:
                            fp = os.path.join(root, file)
                            if not os.path.islink(fp):
                                size_bytes += os.path.getsize(fp)
                        except: pass
        except: pass

    # Mostrar de dónde vienen los datos en el log
    if resolved_paths:
        print(f"DEBUG: User {username}@{domain} -> {total} emails found in {resolved_paths}")
    
    return total, new, size_bytes, resolved_paths[0] if resolved_paths else mail_dir

def get_dir_size(path):
    total_size = 0
    if not os.path.exists(path):
        return 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
            except Exception as e:
                # print(f"DEBUG: Error getting size for {fp}: {str(e)}")
                pass
    return total_size

def format_size(size):
    try:
        size = float(size)
    except (TypeError, ValueError):
        return "0.00 B"
        
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

def generate_secure_password(length: int = 12):
    import secrets
    import string
    # Usar un set de caracteres más seguro y compatible para clientes de correo
    # Se eliminan caracteres como @, !, ^, * que pueden dar problemas en algunas configuraciones
    alphabet = string.ascii_letters + string.digits + "._-$#"
    return ''.join(secrets.choice(alphabet) for i in range(length))

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
                    user_hash = parts[1]
                    status = "active"
                    if user_hash.startswith("{disable}"):
                        status = "suspended"
                        user_hash = user_hash.replace("{disable}", "")
                    
                    # Check for extra fields in the shell part or after
                    extra = parts[7] if len(parts) > 7 else ""
                    if "status=" in extra:
                        status = extra.split("status=")[1].split(",")[0]

                    users.append({
                        'email': parts[0],
                        'hash': user_hash,
                        'uid': parts[2] if len(parts) > 2 else str(VMAIL_UID),
                        'gid': parts[3] if len(parts) > 3 else str(VMAIL_GID),
                        'gecos': parts[4] if len(parts) > 4 else '',
                        'home': parts[5] if len(parts) > 5 else '',
                        'shell': parts[6] if len(parts) > 6 else '',
                        'status': status,
                        'department': '' # Removed as requested
                    })
    except Exception as e:
        print(f"ERROR: Failed to read users file {USERS_FILE}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading users file: {str(e)}")
    
    # print(f"DEBUG: Successfully read {len(users)} users from {USERS_FILE}")
    return users

def update_postfix_vmailbox(users: List[dict]):
    try:
        postfix_dir = os.path.dirname(POSTFIX_VMAILBOX) or '.'
        # Ensure directory exists
        try:
            if postfix_dir and not os.path.exists(postfix_dir):
                os.makedirs(postfix_dir, exist_ok=True)
        except: pass

        with NamedTemporaryFile('w', dir=postfix_dir if os.path.exists(postfix_dir) else None, delete=False) as tmp:
            temp_path = tmp.name
            for user in users:
                # Format: user@domain.com  domain/user/Maildir/
                email = user['email']
                domain = email.split('@')[1]
                username = email.split('@')[0]
                # Mimic the user script format
                line = f"{email}    {domain}/{username}/Maildir/\n"
                tmp.write(line)
        
        if os.name != 'nt':
            try:
                os.chmod(temp_path, 0o644)
            except: pass
            
        try:
            shutil.move(temp_path, POSTFIX_VMAILBOX)
        except Exception as e:
            print(f"ERROR moving file to {POSTFIX_VMAILBOX}: {str(e)}")
            # Fallback: attempt direct write
            with open(POSTFIX_VMAILBOX, 'w') as f:
                with open(temp_path, 'r') as tf:
                    f.write(tf.read())
            os.unlink(temp_path)
        
        # Run postmap and reload postfix
        if os.name != 'nt':
            try:
                subprocess.run(['postmap', POSTFIX_VMAILBOX], check=True)
                subprocess.run(['postfix', 'reload'], check=True)
            except Exception as e:
                print(f"Warning: Could not update postfix: {str(e)}")
            
        return True
    except Exception as e:
        print(f"Error updating Postfix vmailbox: {str(e)}")
        return False

def write_users_file(users: List[dict]):
    try:
        users_dir = os.path.dirname(USERS_FILE) or '.'
        # Ensure directory exists
        try:
            if users_dir and not os.path.exists(users_dir):
                os.makedirs(users_dir, exist_ok=True)
        except: pass

        with NamedTemporaryFile('w', dir=users_dir if os.path.exists(users_dir) else None, delete=False) as tmp:
            temp_path = tmp.name
            for user in users:
                # Format: usuario@dominio:{HASH}:uid:gid:gecos:home_dir:shell:extra_fields
                user_hash = user['hash']
                if user.get('status') == 'suspended':
                    if not user_hash.startswith("{disable}"):
                        user_hash = f"{{disable}}{user_hash}"
                
                status = user.get('status', 'active')
                dept = user.get('department', '')
                extra = f"status={status},dept={dept}"
                
                line = f"{user['email']}:{user_hash}:{user['uid']}:{user['gid']}:{user['gecos']}:{user['home']}:{user.get('shell', '')}:{extra}\n"
                tmp.write(line)
        
        if os.name != 'nt':
            try:
                os.chmod(temp_path, 0o644)
            except: pass
            
        try:
            shutil.move(temp_path, USERS_FILE)
        except Exception as e:
            print(f"ERROR moving file to {USERS_FILE}: {str(e)}")
            # Fallback: attempt direct write
            with open(USERS_FILE, 'w') as f:
                with open(temp_path, 'r') as tf:
                    f.write(tf.read())
            os.unlink(temp_path)

        print(f"DEBUG: Successfully updated {USERS_FILE} with {len(users)} users")
        
        # Sync with Postfix vmailbox
        update_postfix_vmailbox(users)
        
        # Reload Dovecot
        try:
            if os.name != 'nt':
                subprocess.run(['systemctl', 'reload', 'dovecot'], check=True)
        except:
            pass
            
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error writing users file: {str(e)}")

def read_virtual_file():
    """Reads both aliases and forwards from the virtual file."""
    entries = []
    meta = {}
    if os.path.exists(ALIAS_META_FILE):
        try:
            with open(ALIAS_META_FILE, 'r') as f:
                meta = json.load(f)
        except: pass

    if not os.path.exists(VIRTUAL_MAP):
        return entries
        
    try:
        with open(VIRTUAL_MAP, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = re.split(r'\s+', line, maxsplit=1)
                if len(parts) == 2:
                    email = parts[0]
                    destinations = [d.strip() for d in parts[1].split(',')]
                    
                    entry_meta = meta.get(email, {})
                    entries.append({
                        "email": email,
                        "destinations": destinations,
                        "is_dynamic": entry_meta.get('is_dynamic', False),
                        "is_forward": entry_meta.get('is_forward', False),
                        "keep_local": entry_meta.get('keep_local', False),
                        "description": entry_meta.get('description', '')
                    })
    except Exception as e:
        print(f"ERROR reading virtual file {VIRTUAL_MAP}: {str(e)}")
    
    return entries

def write_virtual_file(entries):
    """Writes both aliases and forwards to the virtual file and metadata."""
    try:
        # Save meta first
        meta = {}
        for e in entries:
            meta[e['email']] = {
                "is_dynamic": e.get('is_dynamic', False),
                "is_forward": e.get('is_forward', False),
                "keep_local": e.get('keep_local', False),
                "description": e.get('description', '')
            }
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(ALIAS_META_FILE), exist_ok=True)
        with open(ALIAS_META_FILE, 'w') as f:
            json.dump(meta, f, indent=4)
            print(f"DEBUG: Updated ALIAS_META_FILE with {len(meta)} entries")

        # Expand dynamic aliases
        all_active_users = []
        if any(e.get('is_dynamic') for e in entries):
            users = read_users_file()
            all_active_users = [u['email'] for u in users if u['status'] == 'active']

        virtual_dir = os.path.dirname(VIRTUAL_MAP) or '.'
        # Try to create directory if it doesn't exist (might fail due to permissions in /etc)
        try:
            if virtual_dir and not os.path.exists(virtual_dir):
                os.makedirs(virtual_dir, exist_ok=True)
        except: pass

        with NamedTemporaryFile('w', dir=virtual_dir if os.path.exists(virtual_dir) else None, delete=False) as tmp:
            temp_path = tmp.name
            tmp.write("# Postfix Virtual Aliases & Forwards - Generated by Soop Mail\n")
            tmp.write(f"# Updated: {datetime.now()}\n\n")
            for e in entries:
                dests = e['destinations']
                if e.get('is_dynamic'):
                    dests = list(set(dests + all_active_users))
                
                # If it's a forward and keep_local is True, ensure the source is in dests
                if e.get('is_forward') and e.get('keep_local'):
                    if e['email'] not in dests:
                        dests.append(e['email'])
                
                # Remove self if it's an alias (not a forward) or if keep_local is False
                if not e.get('is_forward') or not e.get('keep_local'):
                    dests = [d for d in dests if d != e['email']]
                
                if not dests: continue
                dest_str = ",".join(dests)
                tmp.write(f"{e['email']}    {dest_str}\n")
            print(f"DEBUG: Generated temporary virtual file at {temp_path}")
        
        if os.name != 'nt':
            try:
                os.chmod(temp_path, 0o644)
            except: pass
        
        try:
            shutil.move(temp_path, VIRTUAL_MAP)
        except Exception as e:
            print(f"ERROR moving file to {VIRTUAL_MAP}: {str(e)}")
            # Fallback for permission issues: attempt direct write if move fails
            with open(VIRTUAL_MAP, 'w') as f:
                with open(temp_path, 'r') as tf:
                    f.write(tf.read())
            os.unlink(temp_path)

        print(f"DEBUG: Successfully updated {VIRTUAL_MAP}")
        
        # postmap & reload
        if os.name != 'nt':
            try:
                subprocess.run(['postmap', VIRTUAL_MAP], check=True, capture_output=True, text=True)
                subprocess.run(['postfix', 'reload'], check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as e:
                print(f"Error executing postfix commands: {str(e)}")
        return True
    except Exception as e:
        print(f"Error writing virtual file: {str(e)}")
        return False

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

@app.get("/api/auth/me", response_model=schemas.UserOut)
async def read_users_me(current_user: models.User = Depends(auth.get_current_active_user)):
    return current_user

@app.put("/api/auth/me", response_model=schemas.UserOut)
async def update_user_me(
    user_data: schemas.UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if user_data.email and user_data.email != current_user.email:
        if db.query(models.User).filter(models.User.email == user_data.email).first():
            raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado")
        current_user.email = user_data.email
        
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
        
    if user_data.password:
        current_user.password_hash = auth.get_password_hash(user_data.password)
        
    db.commit()
    db.refresh(current_user)
    
    log_audit(db, current_user.id, "UPDATE_PROFILE", "User", str(current_user.id), "Usuario actualizó su perfil", request=request)
    
    return current_user

@app.post("/api/auth/change-password")
async def change_password(
    data: schemas.UserPasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if not auth.verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
        
    current_user.password_hash = auth.get_password_hash(data.new_password)
    db.commit()
    
    log_audit(db, current_user.id, "CHANGE_PASSWORD", "User", str(current_user.id), "User changed their own password", request=request)
    
    return {"message": "Password changed successfully"}

@app.get("/api/system/logs", response_model=List[schemas.AuditLogOut])
async def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(limit).all()
    return logs

# User Management (Mail Users)
@app.get("/api/mail/users", response_model=List[schemas.SoopMailUserBase])
async def get_mail_users(current_user: models.User = Depends(auth.get_current_active_user)):
    users = read_users_file()
    print(f"DEBUG: Found {len(users)} users in file. Starting stats calculation...")
    result = []
    for u in users:
        total, new, size_bytes, actual_path = get_mailbox_stats(u['home'])
        print(f"DEBUG: User {u['email']} -> {total} emails found at {actual_path}")
        result.append({
            "email": u['email'],
            "uid": u['uid'],
            "gid": u['gid'],
            "home": actual_path,
            "email_count": total,
            "new_emails": new,
            "storage_size": format_size(size_bytes),
            "status": u.get('status', 'active'),
            "department": u.get('department', '')
        })
    return result

@app.post("/api/mail/users/{email}/purge")
async def purge_mailbox(
    email: str,
    request: Request,
    current_user: models.User = Depends(auth.get_current_active_user),
    db: Session = Depends(get_db)
):
    users = read_users_file()
    user = next((u for u in users if u['email'] == email), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    parts = email.split('@')
    username = parts[0]
    domain = parts[1]
    
    MAILBOX_BASES = ["/var/mail/vhosts", "/var/mail/soop_mail"]
    purged_count = 0
    
    for base in MAILBOX_BASES:
        mailbox_path = os.path.join(base, domain, username)
        if not os.path.exists(mailbox_path):
            continue
            
        try:
            for root, dirs, files in os.walk(mailbox_path):
                # Solo borrar archivos en cur, new y tmp
                if os.path.basename(root) in ("cur", "new", "tmp"):
                    for file in files:
                        file_path = os.path.join(root, file)
                        try:
                            os.remove(file_path)
                            purged_count += 1
                        except:
                            pass
                # También borrar archivos de índice de Dovecot
                for file in files:
                    if file.startswith("dovecot"):
                        try:
                            os.remove(os.path.join(root, file))
                        except:
                            pass
        except Exception as e:
            print(f"Error purging {mailbox_path}: {str(e)}")
            
    log_audit(db, current_user.id, "PURGE_MAILBOX", "MailUser", email, f"Purged {purged_count} emails from {email}", request=request)
    
    return {"message": f"Buzón vaciado con éxito. Se eliminaron {purged_count} correos.", "count": purged_count}

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
    # Path following the user script: MAIL_BASE/domain/username
    user_home = os.path.join(MAIL_BASE, domain, username)
    maildir_path = os.path.join(user_home, "Maildir")
    
    # Create directory logic: Maildir/{new,cur,tmp}
    try:
        for d in ['new', 'cur', 'tmp']:
            os.makedirs(os.path.join(maildir_path, d), exist_ok=True)
            
        if os.name != 'nt':
            # chown -R vmail:vmail
            try:
                # Use sh to run chown recursively safely
                subprocess.run(['chown', '-R', f"{VMAIL_UID}:{VMAIL_GID}", user_home], check=True)
                subprocess.run(['chmod', '-R', '700', user_home], check=True)
            except Exception as e:
                print(f"Warning: Could not set permissions: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating mail directory: {str(e)}")
    
    new_user = {
        'email': user_data.email,
        'hash': pw_hash,
        'uid': str(VMAIL_UID),
        'gid': str(VMAIL_GID),
        'gecos': '',
        'home': user_home,
        'shell': '',
        'status': user_data.status,
        'department': user_data.department or ''
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
            if user_data.password:
                u['hash'] = generate_soop_mail_hash(user_data.password)
            if user_data.status:
                u['status'] = user_data.status
            if user_data.department is not None:
                u['department'] = user_data.department
            user_found = True
            break
            
    if not user_found:
        raise HTTPException(status_code=404, detail="User not found")
        
    write_users_file(users)
    log_audit(db, current_user.id, "UPDATE_MAIL_USER", "MailUser", email, f"Updated settings for {email}", request=request)
    return {"message": "Usuario actualizado con éxito", "email": email}

# Alias & Forwarding Management
@app.get("/api/mail/aliases")
async def get_mail_aliases(current_user: models.User = Depends(auth.get_current_active_user)):
    return read_virtual_file()

@app.post("/api/mail/aliases")
async def create_mail_alias(
    alias_data: schemas.SoopMailAliasCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    aliases = read_virtual_file()
    if any(a['email'] == alias_data.email for a in aliases):
        raise HTTPException(status_code=400, detail="El alias ya existe")
        
    aliases.append({
        "email": alias_data.email,
        "destinations": alias_data.destinations,
        "is_dynamic": alias_data.is_dynamic,
        "description": alias_data.description
    })
    
    if write_virtual_file(aliases):
        print(f"INFO: Alias created successfully: {alias_data.email}")
        log_audit(db, current_user.id, "CREATE_ALIAS", "MailAlias", alias_data.email, f"Created alias {alias_data.email} -> {alias_data.destinations}", request=request)
        return {"message": "Alias creado con éxito"}
    else:
        print(f"ERROR: Failed to create alias: {alias_data.email}")
        raise HTTPException(status_code=500, detail="Error al escribir el archivo de alias")

@app.delete("/api/mail/aliases/{email}")
async def delete_mail_alias(
    email: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    aliases = read_virtual_file()
    new_aliases = [a for a in aliases if a['email'] != email]
    
    if len(new_aliases) == len(aliases):
        raise HTTPException(status_code=404, detail="Alias no encontrado")
        
    if write_virtual_file(new_aliases):
        print(f"INFO: Alias deleted successfully: {email}")
        log_audit(db, current_user.id, "DELETE_ALIAS", "MailAlias", email, f"Deleted alias {email}", request=request)
        return {"message": "Alias eliminado con éxito"}
    else:
        print(f"ERROR: Failed to delete alias: {email}")
        raise HTTPException(status_code=500, detail="Error al escribir el archivo de alias")

# Auto-Responder Management
@app.get("/api/mail/users/{email}/auto-responder", response_model=schemas.AutoResponderOut)
async def get_auto_responder(
    email: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    responder = db.query(models.AutoResponder).filter(models.AutoResponder.email == email).first()
    if not responder:
        # Si no existe, lo creamos desactivado
        responder = models.AutoResponder(email=email, active=False)
        db.add(responder)
        db.commit()
        db.refresh(responder)
    return responder

@app.put("/api/mail/users/{email}/auto-responder", response_model=schemas.AutoResponderOut)
async def update_auto_responder(
    email: str,
    data: schemas.AutoResponderUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    responder = db.query(models.AutoResponder).filter(models.AutoResponder.email == email).first()
    if not responder:
        responder = models.AutoResponder(email=email)
        db.add(responder)
        
    if data.active is not None: responder.active = data.active
    if data.subject is not None: responder.subject = data.subject
    if data.body is not None: responder.body = data.body
    if data.start_date is not None: responder.start_date = data.start_date
    if data.end_date is not None: responder.end_date = data.end_date
    
    db.commit()
    db.refresh(responder)
    
    # Aquí deberíamos generar el archivo .sieve en el home del usuario
    # ... (Pendiente implementar write_sieve_script)
    
# Forwarding Rules (BCC)
def read_bcc_rules(mode="sender"):
    """Reads BCC rules from the specified file (sender or recipient)."""
    path = SENDER_BCC_FILE if mode == "sender" else RECIPIENT_BCC_FILE
    rules = []
    if not os.path.exists(path):
        return rules
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'): continue
                parts = re.split(r'\s+', line)
                if len(parts) >= 2:
                    rules.append({"email": parts[0], "target": parts[1]})
    except: pass
    return rules

def write_bcc_rules(rules, mode="sender"):
    """Writes BCC rules to the specified file and runs postmap."""
    path = SENDER_BCC_FILE if mode == "sender" else RECIPIENT_BCC_FILE
    try:
        content = f"# BCC Rules ({mode}) - Generated by Soop Mail\n"
        for r in rules:
            content += f"{r['email']}    {r['target']}\n"
            
        _write_map_file(path, content)
        return True
    except Exception as e:
        print(f"Error writing {mode} BCC rules: {str(e)}")
        return False

def _write_map_file(path, content):
    """Helper to write a map file and postmap it"""
    try:
        # Ensure parent directory exists
        os.makedirs(os.path.dirname(path), exist_ok=True)
        
        # Write file
        with open(path, 'w') as f:
            f.write(content)
            
        # Postmap if not on Windows
        if os.name != 'nt':
            try:
                subprocess.run(['postmap', path], check=True)
                subprocess.run(['postfix', 'reload'], check=True)
            except subprocess.CalledProcessError as e:
                print(f"Error executing postmap/reload for {path}: {str(e)}")
    except Exception as e:
        print(f"ERROR: Could not write map file {path}: {str(e)}")
        # If writing to /etc fails, try a fallback in the project dir for diagnostics
        if not path.startswith(BASE_DIR):
            fallback = os.path.join(BASE_DIR, os.path.basename(path))
            try:
                with open(fallback, 'w') as f:
                    f.write(content)
                print(f"INFO: Wrote fallback diagnostic file to {fallback}")
            except: pass

@app.get("/api/mail/bcc")
async def get_bcc_rules(current_user: models.User = Depends(auth.get_current_active_user)):
    return {
        "sender": read_bcc_rules("sender"),
        "recipient": read_bcc_rules("recipient")
    }

@app.post("/api/mail/bcc/recipient")
async def create_recipient_bcc(
    rule: schemas.ForwardingRule,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    rules = read_bcc_rules("recipient")
    rules = [r for r in rules if r['email'] != rule.email]
    rules.append({"email": rule.email, "target": rule.target})
    if write_bcc_rules(rules, "recipient"):
        log_audit(db, current_user.id, "CREATE_RECIPIENT_BCC", "MailBCC", rule.email, f"Recipient BCC {rule.email} -> {rule.target}", request=request)
        return {"message": "Regla de copia (BCC) de destinatario creada"}
    raise HTTPException(status_code=500, detail="Error al guardar regla")

@app.post("/api/mail/bcc/sender")
async def create_sender_bcc(
    rule: schemas.ForwardingRule,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    rules = read_bcc_rules("sender")
    rules = [r for r in rules if r['email'] != rule.email]
    rules.append({"email": rule.email, "target": rule.target})
    if write_bcc_rules(rules, "sender"):
        log_audit(db, current_user.id, "CREATE_SENDER_BCC", "MailBCC", rule.email, f"Sender BCC {rule.email} -> {rule.target}", request=request)
        return {"message": "Regla de copia (BCC) de remitente creada"}
    raise HTTPException(status_code=500, detail="Error al guardar regla")

@app.delete("/api/mail/bcc/{mode}/{email}")
async def delete_bcc_rule(
    mode: str,
    email: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if mode not in ("sender", "recipient"):
        raise HTTPException(status_code=400, detail="Modo inválido")
    rules = read_bcc_rules(mode)
    new_rules = [r for r in rules if r['email'] != email]
    if write_bcc_rules(new_rules, mode):
        log_audit(db, current_user.id, f"DELETE_{mode.upper()}_BCC", "MailBCC", email, f"Deleted {mode} BCC rule for {email}", request=request)
        return {"message": "Regla de copia eliminada"}
    raise HTTPException(status_code=500, detail="Error al eliminar regla")

# New Forwards Endpoints
@app.get("/api/mail/forwards")
async def get_mail_forwards(current_user: models.User = Depends(auth.get_current_active_user)):
    entries = read_virtual_file()
    return [e for e in entries if e.get('is_forward')]

@app.post("/api/mail/forwards")
async def create_mail_forward(
    forward_data: schemas.SoopMailForward,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    entries = read_virtual_file()
    # Remove existing
    entries = [e for e in entries if e['email'] != forward_data.source]
    entries.append({
        "email": forward_data.source,
        "destinations": forward_data.destinations,
        "is_forward": True,
        "keep_local": forward_data.keep_local,
        "description": forward_data.description
    })
    if write_virtual_file(entries):
        log_audit(db, current_user.id, "CREATE_FORWARD", "MailForward", forward_data.source, f"Forward {forward_data.source} -> {forward_data.destinations} (keep_local: {forward_data.keep_local})", request=request)
        return {"message": "Reenvío creado con éxito"}
    raise HTTPException(status_code=500, detail="Error al guardar reenvío")

@app.delete("/api/mail/forwards/{email}")
async def delete_mail_forward(
    email: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    entries = read_virtual_file()
    new_entries = [e for e in entries if e['email'] != email]
    if write_virtual_file(new_entries):
        log_audit(db, current_user.id, "DELETE_FORWARD", "MailForward", email, f"Deleted forward for {email}", request=request)
        return {"message": "Reenvío eliminado"}
    raise HTTPException(status_code=500, detail="Error al eliminar reenvío")

@app.put("/api/mail/users/{email}/password")
async def update_mail_user_password(
    email: str,
    user_data: schemas.SoopMailUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if user_data.password != user_data.password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")
        
    users = read_users_file()
    user_index = -1
    for i, u in enumerate(users):
        if u['email'] == email:
            user_index = i
            break
            
    if user_index == -1:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Update hash
    users[user_index]['hash'] = generate_soop_mail_hash(user_data.password)
    
    # Write back
    write_users_file(users)
    
    log_audit(db, current_user.id, "UPDATE_MAIL_USER_PASSWORD", "MailUser", email, f"Updated password for mail user {email}", request=request)
    
    if user_data.restart_soop_mail:
        try:
            subprocess.run(['systemctl', 'restart', 'soop-mail'], check=True)
        except:
            pass
            
    return {"message": "Password updated successfully"}

@app.get("/api/system/utils/generate-password")
async def get_secure_password(length: int = 12, current_user: models.User = Depends(auth.get_current_active_user)):
    return {"password": generate_secure_password(length)}

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
            active_out = result.stdout.strip()
            print(f"DEBUG: soop-mail service status: '{active_out}' (code: {result.returncode})")
            service_active = active_out == 'active'
            
            # Fallback: Si el comando dice 'inactive' o falla, pero estamos respondiendo, es que el programa está corriendo
            if not service_active:
                service_active = True # Forzamos activo ya que estamos respondiendo a la petición
            
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
                
            # Check BCC and Virtual maps configuration
            try:
                s_bcc = subprocess.run(['postconf', '-h', 'sender_bcc_maps'], capture_output=True, text=True)
                sender_bcc_config = s_bcc.stdout.strip()
                
                r_bcc = subprocess.run(['postconf', '-h', 'recipient_bcc_maps'], capture_output=True, text=True)
                recipient_bcc_config = r_bcc.stdout.strip()

                v_alias = subprocess.run(['postconf', '-h', 'virtual_alias_maps'], capture_output=True, text=True)
                virtual_alias_config = v_alias.stdout.strip()

                v_mailbox = subprocess.run(['postconf', '-h', 'virtual_mailbox_maps'], capture_output=True, text=True)
                virtual_mailbox_config = v_mailbox.stdout.strip()
            except:
                sender_bcc_config = "Error checking postconf"
                recipient_bcc_config = "Error checking postconf"
                virtual_alias_config = "Error checking postconf"
                virtual_mailbox_config = "Error checking postconf"
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
    total_emails = 0
    total_new = 0
    total_size_bytes = 0
    for u in users:
        t, n, s_bytes, _ = get_mailbox_stats(u['home'])
        total_emails += t
        total_new += n
        total_size_bytes += s_bytes
    
    # If the sum is 0, we try to get the whole directory size as fallback
    if total_size_bytes == 0:
        total_size_bytes = get_dir_size(MAIL_BASE)
        
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
        "total_new_emails": total_new,
        "mail_base_size": format_size(total_size_bytes),
        "postfix_active": postfix_active,
        "dovecot_active": dovecot_active,
        "postfix_config_ok": postfix_config_ok,
        "postfix_config_error": postfix_config_error,
        "dovecot_config_ok": dovecot_config_ok,
        "dovecot_config_error": dovecot_config_error,
        "db_connected": success_db,
        "db_message": message_db,
        "database_logs": database.CONNECTION_LOGS,
        "sender_bcc_config": sender_bcc_config if 'sender_bcc_config' in locals() else "N/A",
        "recipient_bcc_config": recipient_bcc_config if 'recipient_bcc_config' in locals() else "N/A",
        "virtual_alias_config": virtual_alias_config if 'virtual_alias_config' in locals() else "N/A",
        "virtual_mailbox_config": virtual_mailbox_config if 'virtual_mailbox_config' in locals() else "N/A"
    }
    
    # Mail System Diagnostics
    file_diagnostics = {}
    files_to_check = {
        "users": USERS_FILE,
        "virtual": POSTFIX_VIRTUAL,
        "aliases_meta": ALIAS_META_FILE,
        "sender_bcc": SENDER_BCC_FILE,
        "mail_base": MAIL_BASE
    }
    for name, path in files_to_check.items():
        exists = os.path.exists(path)
        parent_dir = os.path.dirname(path)
        
        # Determine writability
        if os.path.exists(path):
            writable = os.access(path, os.W_OK)
        elif os.path.exists(parent_dir):
            writable = os.access(parent_dir, os.W_OK)
        else:
            writable = False
            
        file_diagnostics[name] = {
            "path": path,
            "exists": exists,
            "writable": writable,
            "status": "OK" if exists else "NOT_FOUND",
            "write_status": "WRITABLE" if writable else "READ_ONLY",
            "parent_exists": os.path.exists(parent_dir)
        }
    details["file_diagnostics"] = file_diagnostics
    
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
@app.get("/api/system/logs/mail")
def get_mail_logs(lines: int = 100, current_user: models.User = Depends(auth.get_current_admin_user)):
    log_paths = ['/var/log/mail.log', '/var/log/mail.err', '/var/log/mail.info']
    
    # Intenta encontrar el archivo de log que exista
    target_log = None
    for path in log_paths:
        if os.path.exists(path):
            target_log = path
            break
            
    if not target_log:
        return {"logs": ["No se encontró el archivo de logs de correo en el sistema."]}
        
    try:
        # Usar tail para eficiencia
        result = subprocess.run(['tail', '-n', str(lines), target_log], capture_output=True, text=True)
        if result.returncode == 0:
            return {"logs": result.stdout.splitlines(), "path": target_log}
        else:
            return {"logs": [f"Error al leer logs: {result.stderr}"]}
    except Exception as e:
        return {"logs": [f"Error de sistema: {str(e)}"]}

@app.get("/api/system/logs/mail/auth")
def get_auth_logs(lines: int = 100, email: Optional[str] = None, current_user: models.User = Depends(auth.get_current_active_user)):
    # Restricción: Si no es admin, DEBE proporcionar un email para filtrar
    if not current_user.is_admin and not email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        
    log_paths = ['/var/log/mail.log', '/var/log/mail.err', '/var/log/mail.info']
    target_log = None
    for path in log_paths:
        if os.path.exists(path):
            target_log = path
            break
            
    if not target_log:
        return {"logs": []}
        
    try:
        # Markers for authentication
        auth_patterns = ["Login:", "sasl_username=", "password verification failed", "authentication failed", "auth-worker", "passdb"]
        
        # Read the last N lines and filter
        result = subprocess.run(['tail', '-n', '2000', target_log], capture_output=True, text=True)
        if result.returncode != 0:
            return {"logs": []}
            
        all_lines = result.stdout.splitlines()
        auth_lines = []
        
        for line in all_lines:
            if any(p in line for p in auth_patterns):
                if not email or email in line:
                    auth_lines.append(line)
                    
        # Return only requested number of lines (latest)
        return {"logs": auth_lines[-lines:]}
    except Exception as e:
        return {"logs": [f"Error: {str(e)}"]}

@app.get("/api/system/logs/auth/stream")
async def stream_auth_logs(email: Optional[str] = None, current_user: models.User = Depends(auth.get_current_admin_user)):
    async def auth_log_generator():
        log_paths = ['/var/log/mail.log', '/var/log/mail.err', '/var/log/mail.info']
        target_log = None
        for path in log_paths:
            if os.path.exists(path):
                target_log = path
                break
                
        if not target_log:
            yield "data: Error: No log file found\n\n"
            return

        auth_patterns = ["Login:", "sasl_username=", "password verification failed", "authentication failed", "auth-worker", "passdb"]
        
        process = await asyncio.create_subprocess_exec(
            'tail', '-f', '-n', '100', target_log,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        try:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                decoded_line = line.decode('utf-8', errors='replace').strip()
                if any(p in decoded_line for p in auth_patterns):
                    if not email or email in decoded_line:
                        yield f"data: {decoded_line}\n\n"
        except asyncio.CancelledError:
            process.terminate()
            await process.wait()
            raise
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
        finally:
            if process.returncode is None:
                process.terminate()
                await process.wait()

    return StreamingResponse(auth_log_generator(), media_type="text/event-stream")

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
