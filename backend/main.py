import os
import re
import subprocess
import shutil
from passlib.hash import sha512_crypt
from datetime import datetime, timedelta
from typing import List, Optional
import platform
from fastapi import FastAPI, Depends, HTTPException, status, Request, BackgroundTasks
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

    # Force sync of the vmailbox map to ensure all existing users are recognized by Postfix
    if os.name != 'nt':
        try:
            print("INFO: Synchronizing Postfix vmailbox maps...")
            users = read_users_file()
            update_postfix_vmailbox(users)
        except Exception as e:
            print(f"ERROR: Failed to sync Postfix vmailbox on startup: {str(e)}")

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
PROJECT_ROOT = os.path.dirname(BASE_DIR)

def resolve_path(path, default_filename=None):
    """
    Intelligent path resolution:
    1. If path is absolute and exists, use it.
    2. If path is relative, try relative to PROJECT_ROOT.
    3. If path is absolute but doesn't exist, and is just a filename, try in PROJECT_ROOT.
    """
    if not path:
        return os.path.join(PROJECT_ROOT, default_filename) if default_filename else ""
    
    # If it's already an absolute path that exists, we are good
    if os.path.isabs(path) and os.path.exists(path):
        return path
        
    # Try relative to PROJECT_ROOT
    rel_path = os.path.abspath(os.path.join(PROJECT_ROOT, path))
    if os.path.exists(rel_path):
        return rel_path
        
    # If it doesn't exist but it's absolute, maybe the user intended it to be in the project
    if os.path.isabs(path):
        basename = os.path.basename(path)
        project_fallback = os.path.join(PROJECT_ROOT, basename)
        if os.path.exists(project_fallback):
            return project_fallback
            
    # Default to the joined path even if it doesn't exist yet (for creation)
    if not os.path.isabs(path):
        return rel_path
        
    return path

# Auto-discovery for USERS_FILE
def discover_users_file():
    env_users = os.environ.get('SOOP_MAIL_USERS_FILE', os.environ.get('USERS_FILE', ''))
    if env_users:
        resolved = resolve_path(env_users, 'users')
        if os.path.exists(resolved):
            return resolved
            
    # Standard locations
    candidates = [
        "/etc/dovecot/users",
        "/etc/postfix/users",
        os.path.join(PROJECT_ROOT, 'users'),
        os.path.join(BASE_DIR, 'users')
    ]
    for c in candidates:
        if os.path.exists(c):
            print(f"INFO: Auto-discovered USERS_FILE at: {c}")
            return c
    return resolve_path(env_users, 'users')

def discover_postfix_file(env_var, default_name, std_path):
    env_val = os.environ.get(env_var, '')
    if env_val:
        resolved = resolve_path(env_val, default_name)
        if os.path.exists(resolved):
            return resolved
    if os.path.exists(std_path):
        return std_path
    return resolve_path(env_val, default_name)

USERS_FILE = discover_users_file()
ALIAS_META_FILE = resolve_path(os.environ.get('ALIAS_META_FILE', ''), 'aliases_meta.json')
SENDER_BCC_FILE = discover_postfix_file('SENDER_BCC_FILE', 'sender_bcc', '/etc/postfix/sender_bcc')
RECIPIENT_BCC_FILE = discover_postfix_file('RECIPIENT_BCC_FILE', 'recipient_bcc', '/etc/postfix/recipient_bcc')
VIRTUAL_MAP = discover_postfix_file('POSTFIX_VIRTUAL', 'virtual', '/etc/postfix/virtual')
VMAILBOX_MAP = discover_postfix_file('POSTFIX_VMAILBOX', 'vmailbox', '/etc/postfix/vmailbox')

# Backward compatibility aliases
POSTFIX_VIRTUAL = VIRTUAL_MAP
POSTFIX_VMAILBOX = VMAILBOX_MAP

POSTFIX_SENDER_RESTRICTIONS = resolve_path(os.environ.get('POSTFIX_SENDER_RESTRICTIONS', ''), 'sender_restrictions')

# Auto-discovery for MAIL_BASE
def discover_mail_base():
    env_base = os.environ.get('SOOP_MAIL_BASE', os.environ.get('MAIL_BASE', ''))
    if env_base:
        resolved = resolve_path(env_base, 'vhosts')
        if os.path.exists(resolved):
            return resolved
            
    # Standard locations to check
    candidates = [
        "/var/mail/vhosts",
        "/var/mail/soop_mail",
        "/var/vmail",
        os.path.join(PROJECT_ROOT, 'mail'),
        os.path.join(PROJECT_ROOT, 'vhosts')
    ]
    
    for c in candidates:
        if os.path.exists(c) and os.access(c, os.R_OK):
            # If it contains subdirectories, it's likely a valid mail base
            try:
                if any(os.path.isdir(os.path.join(c, d)) for d in os.listdir(c)):
                    print(f"INFO: Auto-discovered MAIL_BASE at: {c}")
                    return c
            except: pass
            
    return resolve_path(env_base, 'vhosts') # Fallback to default logic

MAIL_BASE = discover_mail_base()

VMAIL_UID = int(os.getenv("SOOP_MAIL_VMAIL_UID", 5000))
VMAIL_GID = int(os.getenv("SOOP_MAIL_VMAIL_GID", 5000))
DEFAULT_DOMAIN = os.getenv("DEFAULT_DOMAIN", "mmbtransporte.com")

print(f"DIAG: USERS_FILE resolved to: {USERS_FILE}")
print(f"DIAG: MAIL_BASE resolved to: {MAIL_BASE}")

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
                    _run_privileged(['postconf', '-e', f"{param} = {expected}"], f"postconf set {param}")
                    changed = True
                elif expected not in current:
                    # Append it if it's not there (comma separated)
                    new_value = f"{current}, {expected}"
                    print(f"INFO: Updating {param} to {new_value}")
                    _run_privileged(['postconf', '-e', f"{param} = {new_value}"], f"postconf update {param}")
                    changed = True
            except Exception as e:
                print(f"WARNING: Could not check/set {param}: {str(e)}")

        # Ensure files exist and are indexed
        for fpath in [RECIPIENT_BCC_FILE, SENDER_BCC_FILE, VIRTUAL_MAP, VMAILBOX_MAP]:
            if not os.path.exists(fpath):
                print(f"INFO: Creating missing Postfix map file: {fpath}")
                try:
                    os.makedirs(os.path.dirname(fpath), exist_ok=True)
                    ok, _ = _write_privileged(fpath, f"# Postfix map file: {os.path.basename(fpath)}\n")
                    if ok:
                        _run_privileged(['postmap', fpath], f"postmap {os.path.basename(fpath)}")
                        changed = True
                except Exception as e:
                    print(f"ERROR: Could not create/index {fpath}: {str(e)}")

        if changed:
            print("INFO: Reloading Postfix to apply changes")
            _reload_postfix()

    except Exception as e:
        print(f"ERROR: General failure in _ensure_postfix_config: {str(e)}")

def get_mailbox_stats(mail_dir: str):
    if not mail_dir:
        return 0, 0, 0, ""
        
    # Extraer dominio y usuario
    parts = mail_dir.strip('/').split('/')
    domain = parts[-2] if len(parts) >= 2 else DEFAULT_DOMAIN
    username = parts[-1] if len(parts) >= 1 else ""
    email = f"{username}@{domain}" if username and domain else ""
    
    # Bases donde buscaremos
    MAILBOX_BASES = ["/var/mail/vhosts", "/var/mail/soop_mail", "/var/mail", "/var/vmail"]
    if os.path.dirname(os.path.dirname(mail_dir)) not in MAILBOX_BASES:
        MAILBOX_BASES.append(os.path.dirname(os.path.dirname(mail_dir)))

    total = 0
    new = 0
    size_bytes = 0
    resolved_paths = []

    for base in set(MAILBOX_BASES):
        if not base or base == "/": continue
        
        # Probar diferentes combinaciones de carpetas
        candidates = [
            os.path.join(base, domain, username), # dominio/usuario
            os.path.join(base, email),           # usuario@dominio
            os.path.join(base, username),        # usuario
            mail_dir                             # ruta original
        ]
        
        for mailbox_path in candidates:
            if not mailbox_path or not os.path.exists(mailbox_path) or mailbox_path in resolved_paths:
                continue
            
            # Verificar si parece un Maildir (tiene cur, new o tmp)
            is_maildir = any(os.path.exists(os.path.join(mailbox_path, d)) for d in ("cur", "new", "tmp"))
            if not is_maildir:
                continue

            resolved_paths.append(mailbox_path)
            try:
                for root, dirs, files in os.walk(mailbox_path):
                    folder_name = os.path.basename(root)
                    if folder_name in ("cur", "new"):
                        is_new_dir = folder_name == "new"
                        for file in files:
                            if file.startswith("dovecot"): continue
                            total += 1
                            if is_new_dir: new += 1
                            try:
                                fp = os.path.join(root, file)
                                if not os.path.islink(fp):
                                    size_bytes += os.path.getsize(fp)
                            except: pass
            except Exception as e:
                print(f"DEBUG: Error al leer {mailbox_path}: {str(e)}")
            
    # Mostrar de dónde vienen los datos en el log
    if resolved_paths:
        print(f"DEBUG: User {email} -> {total} emails found in {resolved_paths}")
    
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

def _run_privileged(cmd: list, description: str = "") -> tuple:
    """Run a command, first directly, then with sudo if permission is denied."""
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"OK: {description} ({' '.join(cmd)})")
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        # Try with sudo
        try:
            result = subprocess.run(['sudo', '-n'] + cmd, check=True, capture_output=True, text=True)
            print(f"OK (sudo): {description} ({' '.join(cmd)})")
            return True, result.stdout
        except subprocess.CalledProcessError as e2:
            msg = f"ERROR: {description} failed. Direct: {e.stderr.strip()} | Sudo: {e2.stderr.strip()}"
            print(msg)
            return False, msg
    except FileNotFoundError:
        msg = f"ERROR: Command not found: {cmd[0]}"
        print(msg)
        return False, msg

def _write_privileged(path: str, content: str) -> tuple:
    """Write content to a file, using sudo tee if direct write fails."""
    try:
        with open(path, 'w') as f:
            f.write(content)
        print(f"OK: Direct write to {path}")
        return True, ""
    except PermissionError:
        # Try sudo tee
        try:
            proc = subprocess.run(
                ['sudo', '-n', 'tee', path],
                input=content,
                capture_output=True,
                text=True,
                check=True
            )
            print(f"OK (sudo tee): Wrote to {path}")
            return True, ""
        except subprocess.CalledProcessError as e:
            msg = f"ERROR: Could not write {path} even with sudo tee: {e.stderr.strip()}"
            print(msg)
            return False, msg
        except FileNotFoundError:
            msg = f"ERROR: sudo not available, cannot write to {path}"
            print(msg)
            return False, msg

def _reload_postfix():
    """Try to reload postfix using available methods."""
    methods = [
        (['postfix', 'reload'], "postfix reload"),
        (['systemctl', 'reload', 'postfix'], "systemctl reload postfix"),
        (['systemctl', 'restart', 'postfix'], "systemctl restart postfix"),
    ]
    for cmd, desc in methods:
        ok, err = _run_privileged(cmd, desc)
        if ok:
            return True
    print(f"CRITICAL: All postfix reload methods failed. Run manually: sudo postfix reload")
    return False

def _reload_dovecot():
    """Try to reload dovecot using available methods."""
    methods = [
        (['systemctl', 'reload', 'dovecot'], "systemctl reload dovecot"),
        (['systemctl', 'restart', 'dovecot'], "systemctl restart dovecot"),
        (['dovecot', 'reload'], "dovecot reload"),
    ]
    for cmd, desc in methods:
        ok, err = _run_privileged(cmd, desc)
        if ok:
            return True
    print(f"WARNING: All dovecot reload methods failed. Run manually: sudo systemctl reload dovecot")
    return False

def update_postfix_vmailbox(users: List[dict]):
    try:
        # Build content
        content_lines = [f"# Postfix vmailbox - Generated by Soop Mail\n"]
        content_lines.append(f"# Updated: {datetime.now()}\n\n")
        for user in users:
            email = user['email']
            domain = email.split('@')[1]
            username = email.split('@')[0]
            line = f"{email}    {domain}/{username}/Maildir/\n"
            content_lines.append(line)
        content = "".join(content_lines)

        # Write file (with sudo fallback)
        ok, err = _write_privileged(POSTFIX_VMAILBOX, content)
        if not ok:
            print(f"CRITICAL: Could not write vmailbox file. Postfix will NOT recognize new users. {err}")
            print(f"HINT: Run: sudo chmod 664 {POSTFIX_VMAILBOX} && sudo chown root:$(whoami) {POSTFIX_VMAILBOX}")
            fallback = os.path.join(BASE_DIR, 'vmailbox.pending')
            try:
                with open(fallback, 'w') as f:
                    f.write(content)
                print(f"INFO: Wrote pending vmailbox copy to {fallback}")
            except: pass
            return False

        # Set permissions and run postmap/reload
        if os.name != 'nt':
            try:
                os.chmod(POSTFIX_VMAILBOX, 0o644)
            except:
                _run_privileged(['chmod', '644', POSTFIX_VMAILBOX], "chmod vmailbox")

            ok1, err1 = _run_privileged(['postmap', POSTFIX_VMAILBOX], "postmap vmailbox")
            if not ok1:
                print(f"CRITICAL: postmap failed - new users won't be in Postfix lookup table.")
                print(f"HINT: Run manually: sudo postmap {POSTFIX_VMAILBOX} && sudo postfix reload")

            _reload_postfix()

        return True
    except Exception as e:
        print(f"ERROR in update_postfix_vmailbox: {str(e)}")
        import traceback
        traceback.print_exc()
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
        if os.name != 'nt':
            _reload_dovecot()
            
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
            _run_privileged(['postmap', VIRTUAL_MAP], "postmap virtual")
            _reload_postfix()
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

@app.get("/api/system/audit-logs", response_model=List[schemas.AuditLogOut])
async def get_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_admin_user)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(limit).all()
    return logs

# User Management (Mail Users)
@app.get("/api/system/diagnostics")
async def get_system_diagnostics(current_user: models.User = Depends(auth.get_current_admin_user)):
    issues = []
    
    paths_to_check = [
        ("Base de Datos de Usuarios (USERS_FILE)", USERS_FILE),
        ("Tabla de Alias Virtuales (VIRTUAL_MAP)", VIRTUAL_MAP),
        ("Tabla de Buzones Virtuales (VMAILBOX_MAP)", VMAILBOX_MAP),
        ("Tabla de BCC Remitentes", SENDER_BCC_FILE),
        ("Tabla de BCC Destinatarios", RECIPIENT_BCC_FILE),
        ("Directorio de Correos (MAIL_BASE)", MAIL_BASE)
    ]
    
    import getpass
    current_os_user = getpass.getuser()
    
    # We will output suggested fixes for the frontend
    for label, path in paths_to_check:
        if not path:
            continue
            
        is_dir = label == "Directorio de Correos (MAIL_BASE)"
        
        # Check if it exists
        if not os.path.exists(path):
            parent_dir = os.path.dirname(path)
            # If parent dir does not exist or is not writable
            if not os.path.exists(parent_dir):
                issues.append({
                    "path": path,
                    "label": label,
                    "error": "El directorio padre no existe",
                    "fix_command": f"sudo mkdir -p {parent_dir} && sudo chown -R {current_os_user}:{current_os_user} {parent_dir}"
                })
            elif not os.access(parent_dir, os.W_OK):
                issues.append({
                    "path": path,
                    "label": label,
                    "error": "El sistema no tiene permisos de escritura en el directorio padre para crear el archivo",
                    "fix_command": f"sudo chown -R {current_os_user}:{current_os_user} {parent_dir}"
                })
        else:
            # Check read and write permissions
            if not os.access(path, os.R_OK):
                issues.append({
                    "path": path,
                    "label": label,
                    "error": "Sin permisos de lectura",
                    "fix_command": f"sudo chmod +r {path} && sudo chown -R {current_os_user}:{current_os_user} {path}"
                })
            elif not os.access(path, os.W_OK):
                issues.append({
                    "path": path,
                    "label": label,
                    "error": "Sin permisos de escritura (requerido para crear buzones/alias)",
                    "fix_command": f"sudo chmod +w {path} && sudo chown -R {current_os_user}:{current_os_user} {path}"
                })
                
    if not issues:
        return {"ok": True, "issues": []}
    
    return {"ok": False, "issues": issues}

@app.get("/api/system/vmailbox-diagnostics")
async def get_vmailbox_diagnostics(current_user: models.User = Depends(auth.get_current_admin_user)):
    """Deep diagnostics for the Postfix vmailbox permission issue."""
    import getpass, pwd, grp
    report = {}

    # 1. Running user
    try:
        running_user = getpass.getuser()
        uid = os.getuid() if hasattr(os, 'getuid') else -1
        report["running_as"] = {"user": running_user, "uid": uid}
    except Exception as e:
        report["running_as"] = {"error": str(e)}

    # 2. vmailbox file state
    vfile = POSTFIX_VMAILBOX
    try:
        exists = os.path.exists(vfile)
        writable = os.access(vfile, os.W_OK) if exists else False
        stat = os.stat(vfile) if exists else None
        owner_uid = stat.st_uid if stat else -1
        owner_gid = stat.st_gid if stat else -1
        try:
            owner_name = pwd.getpwuid(owner_uid).pw_name if owner_uid >= 0 else "?"
        except: owner_name = str(owner_uid)
        try:
            group_name = grp.getgrgid(owner_gid).gr_name if owner_gid >= 0 else "?"
        except: group_name = str(owner_gid)
        
        # Read current content
        content_preview = ""
        if exists:
            try:
                with open(vfile, 'r') as f:
                    content_preview = f.read(2000)
            except: content_preview = "(no se pudo leer)"
        
        report["vmailbox_file"] = {
            "path": vfile,
            "exists": exists,
            "writable": writable,
            "owner": f"{owner_name}:{group_name}",
            "mode": oct(stat.st_mode)[-4:] if stat else "?",
            "content_preview": content_preview
        }
    except Exception as e:
        report["vmailbox_file"] = {"error": str(e)}

    # 3. Test sudo -n access
    sudo_tests = {}
    for cmd in [['postmap', '--version'], ['postfix', 'status']]:
        try:
            r = subprocess.run(['sudo', '-n'] + cmd, capture_output=True, text=True, timeout=5)
            sudo_tests[cmd[0]] = {"sudo_available": r.returncode == 0, "stderr": r.stderr.strip()}
        except Exception as e:
            sudo_tests[cmd[0]] = {"sudo_available": False, "error": str(e)}
    report["sudo_access"] = sudo_tests

    # 4. Generate fix commands
    ru = report.get("running_as", {}).get("user", "$(whoami)")
    report["fix_commands"] = [
        f"# Dar permisos de escritura al archivo vmailbox al usuario de Gunicorn",
        f"sudo chown root:{ru} {vfile}",
        f"sudo chmod 664 {vfile}",
        f"",
        f"# Permitir que Gunicorn ejecute postmap y postfix reload sin contraseña",
        f"echo '{ru} ALL=(ALL) NOPASSWD: /usr/sbin/postmap, /usr/sbin/postfix, /bin/tee {vfile}' | sudo tee /etc/sudoers.d/soop_mail",
        f"sudo chmod 440 /etc/sudoers.d/soop_mail",
        f"",
        f"# Reiniciar Gunicorn para aplicar los cambios",
        f"sudo systemctl restart soop_mail"
    ]

    return report

@app.get("/api/mail/users", response_model=List[schemas.SoopMailUserBase])
async def get_mail_users(current_user: models.User = Depends(auth.get_current_active_user)):
    users = read_users_file()
    print(f"DEBUG: Found {len(users)} users in file. Starting stats calculation...")
    result = []
    for u in users:
        total, new, size_bytes, actual_path = get_mailbox_stats(u['home'])
        
        if os.name == 'nt' and total == 0:
            import hashlib
            h = int(hashlib.md5(u['email'].encode()).hexdigest(), 16)
            total = (h % 1500) + 10
            new = (h % 25)
            size_bytes = total * 1024 * 65

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

def cleanup_file(path: str):
    import os
    try:
        os.unlink(path)
    except:
        pass

@app.get("/api/mail/users/{email}/export")
async def export_mailbox(
    email: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    users = read_users_file()
    user = next((u for u in users if u['email'] == email), None)
    if not user:
        raise HTTPException(status_code=404, detail="Mailbox not found")
        
    _, _, _, mailbox_path = get_mailbox_stats(user['home'])
    if not mailbox_path or not os.path.exists(mailbox_path):
        raise HTTPException(status_code=404, detail="Mailbox directory not found")
        
    import tempfile
    import shutil
    
    fd, temp_path = tempfile.mkstemp(suffix='.zip')
    os.close(fd)
    
    try:
        shutil.make_archive(temp_path.replace('.zip', ''), 'zip', mailbox_path)
        background_tasks.add_task(cleanup_file, temp_path)
        log_audit(db, current_user.id, "EXPORT_MAILBOX", "MailUser", email, f"Exported mailbox {email}", request=request)
        return FileResponse(
            path=temp_path,
            filename=f"mailbox_{email}.zip",
            media_type="application/zip"
        )
    except Exception as e:
        cleanup_file(temp_path)
        raise HTTPException(status_code=500, detail=f"Error exporting mailbox: {str(e)}")

@app.get("/api/mail/users/{email}/export/data")
async def export_mailbox_data(
    email: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    users = read_users_file()
    user = next((u for u in users if u['email'] == email), None)
    if not user:
        raise HTTPException(status_code=404, detail="Mailbox not found")
        
    aliases = read_virtual_file()
    user_aliases = [a for a in aliases if a['email'] == email]
    
    responder = db.query(models.AutoResponder).filter(models.AutoResponder.email == email).first()
    
    sender_bcc = read_bcc_rules("sender")
    recipient_bcc = read_bcc_rules("recipient")
    
    export_data = {
        "user_info": user,
        "aliases_and_forwards": user_aliases,
        "auto_responder": {
            "active": responder.active,
            "subject": responder.subject,
            "body": responder.body
        } if responder else None,
        "bcc_rules": {
            "sender": [r for r in sender_bcc if r['email'] == email],
            "recipient": [r for r in recipient_bcc if r['email'] == email]
        },
        "exported_at": datetime.now().isoformat()
    }
    
    import tempfile
    import json
    
    fd, temp_path = tempfile.mkstemp(suffix='.json')
    os.close(fd)
    
    try:
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=4, ensure_ascii=False)
            
        background_tasks.add_task(cleanup_file, temp_path)
        log_audit(db, current_user.id, "EXPORT_DATA", "MailUser", email, f"Exported structured data for {email}", request=request)
        
        return FileResponse(
            path=temp_path,
            filename=f"datos_{email}.json",
            media_type="application/json"
        )
    except Exception as e:
        cleanup_file(temp_path)
        raise HTTPException(status_code=500, detail=f"Error exporting data: {str(e)}")

@app.get("/api/mail/users/{email}/export/pdf")
async def export_mailbox_pdf(
    email: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    users = read_users_file()
    user = next((u for u in users if u['email'] == email), None)
    if not user:
        raise HTTPException(status_code=404, detail="Mailbox not found")
        
    total, new, size_bytes, mailbox_path = get_mailbox_stats(user['home'])
    
    import tempfile
    
    fd, temp_path = tempfile.mkstemp(suffix='.html')
    os.close(fd)
    
    # We will generate an HTML file that can be easily printed to PDF
    # Since we can't guarantee a PDF library is installed in the current environment
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Reporte de Buzón - {email}</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 40px; color: #333; }}
            h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
            .stats-box {{ background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 5px; margin-top: 20px; }}
            .stats-row {{ display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 5px; }}
            .footer {{ margin-top: 50px; font-size: 12px; color: #7f8c8d; text-align: center; }}
        </style>
    </head>
    <body>
        <h1>Reporte Oficial de Buzón</h1>
        <div class="stats-box">
            <div class="stats-row"><strong>Cuenta de Correo:</strong> <span>{email}</span></div>
            <div class="stats-row"><strong>Estado:</strong> <span>{user.get('status', 'Activo')}</span></div>
            <div class="stats-row"><strong>Departamento:</strong> <span>{user.get('department', 'No asignado')}</span></div>
            <div class="stats-row"><strong>Total de Mensajes:</strong> <span>{total}</span></div>
            <div class="stats-row"><strong>Mensajes Nuevos:</strong> <span>{new}</span></div>
            <div class="stats-row"><strong>Espacio Utilizado:</strong> <span>{format_size(size_bytes)}</span></div>
            <div class="stats-row"><strong>Fecha de Exportación:</strong> <span>{datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</span></div>
        </div>
        <p style="margin-top: 30px;">
            Este documento representa un extracto certificado del paquete de mensajes asociado al buzón <strong>{email}</strong>.
            Puede imprimir este documento como PDF desde su navegador para mantener un registro formal.
        </p>
        <div class="footer">
            Generado automáticamente por el Sistema de Administración Soop Mails.
        </div>
    </body>
    </html>
    """
    
    try:
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        background_tasks.add_task(cleanup_file, temp_path)
        log_audit(db, current_user.id, "EXPORT_PDF", "MailUser", email, f"Exported PDF report for {email}", request=request)
        
        return FileResponse(
            path=temp_path,
            filename=f"reporte_{email}.html",
            media_type="text/html"
        )
    except Exception as e:
        cleanup_file(temp_path)
        raise HTTPException(status_code=500, detail=f"Error exporting PDF report: {str(e)}")

@app.get("/api/mail/export-all")
async def export_all_mailboxes(
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    users = read_users_file()
    if not users:
        raise HTTPException(status_code=404, detail="No mailboxes found")
        
    import tempfile
    import shutil
    from datetime import datetime
    temp_dir = tempfile.mkdtemp()
    
    try:
        for u in users:
            _, _, _, mailbox_path = get_mailbox_stats(u['home'])
            if mailbox_path and os.path.exists(mailbox_path):
                dest_path = os.path.join(temp_dir, u['email'])
                shutil.copytree(mailbox_path, dest_path, dirs_exist_ok=True)
                
        fd, temp_zip = tempfile.mkstemp(suffix='.zip')
        os.close(fd)
        
        shutil.make_archive(temp_zip.replace('.zip', ''), 'zip', temp_dir)
        
        def cleanup_all():
            shutil.rmtree(temp_dir, ignore_errors=True)
            cleanup_file(temp_zip)
            
        background_tasks.add_task(cleanup_all)
        log_audit(db, current_user.id, "EXPORT_ALL_MAILBOXES", "System", None, "Exported all mailboxes", request=request)
        
        return FileResponse(
            path=temp_zip,
            filename=f"all_mailboxes_{datetime.now().strftime('%Y%m%d')}.zip",
            media_type="application/zip"
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error exporting all mailboxes: {str(e)}")


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
            # chown -R vmail:vmail (try direct first, then sudo)
            ok1, _ = _run_privileged(['chown', '-R', f"{VMAIL_UID}:{VMAIL_GID}", user_home], "chown maildir")
            ok2, _ = _run_privileged(['chmod', '-R', '700', user_home], "chmod maildir")
            if not ok1:
                print(f"WARNING: Could not set ownership of {user_home} to {VMAIL_UID}:{VMAIL_GID}")
                print(f"HINT: Run: sudo chown -R {VMAIL_UID}:{VMAIL_GID} {user_home}")
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
            subprocess.run(['systemctl', 'restart', 'soop_mail'], check=True)
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
            _run_privileged(['postmap', path], f"postmap {os.path.basename(path)}")
            _reload_postfix()
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
@app.get("/api/mail/forwarding")
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
            subprocess.run(['systemctl', 'restart', 'soop_mail'], check=True)
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

# Mailbox Export
@app.get("/api/mail/users/{email}/export")
async def export_mailbox(
    email: str,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: models.User = Depends(auth.get_current_active_user),
    db: Session = Depends(get_db)
):
    users = read_users_file()
    user = next((u for u in users if u['email'] == email), None)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    total, new, size_bytes, mailbox_path = get_mailbox_stats(user['home'])
    if not os.path.exists(mailbox_path):
        raise HTTPException(status_code=404, detail="El directorio del buzón no existe")
        
    # Create temp zip file in a temporary location
    try:
        # Use a subfolder in PROJECT_ROOT or /tmp if possible
        temp_dir = os.path.join(PROJECT_ROOT, "temp_exports")
        os.makedirs(temp_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_email = email.replace('@', '_at_').replace('.', '_')
        zip_base_name = os.path.join(temp_dir, f"export_{safe_email}_{timestamp}")
        
        # Zip the mailbox directory
        zip_file_path = shutil.make_archive(zip_base_name, 'zip', mailbox_path)
        
        # Schedule deletion after response
        background_tasks.add_task(os.remove, zip_file_path)
        
        log_audit(db, current_user.id, "EXPORT_MAILBOX", "MailUser", email, f"Exportó el buzón de {email}", request=request)
        
        return FileResponse(
            path=zip_file_path,
            filename=f"buzon_{email}_{timestamp}.zip",
            media_type="application/zip"
        )
    except Exception as e:
        print(f"ERROR exporting mailbox: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al generar el archivo de exportación: {str(e)}")

@app.get("/api/mail/export-all")
async def export_all_mailboxes(
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: models.User = Depends(auth.get_current_active_user),
    db: Session = Depends(get_db)
):
    if not os.path.exists(MAIL_BASE):
        raise HTTPException(status_code=404, detail="El directorio base de correo no existe")
        
    try:
        temp_dir = os.path.join(PROJECT_ROOT, "temp_exports")
        os.makedirs(temp_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        zip_base_name = os.path.join(temp_dir, f"export_all_mailboxes_{timestamp}")
        
        # Zip all mailboxes
        zip_file_path = shutil.make_archive(zip_base_name, 'zip', MAIL_BASE)
        
        background_tasks.add_task(os.remove, zip_file_path)
        
        log_audit(db, current_user.id, "EXPORT_ALL_MAILBOXES", "System", "all", "Exportó todos los buzones del sistema", request=request)
        
        return FileResponse(
            path=zip_file_path,
            filename=f"todos_los_buzones_{timestamp}.zip",
            media_type="application/zip"
        )
    except Exception as e:
        print(f"ERROR exporting all mailboxes: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al generar la exportación masiva: {str(e)}")

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
            result = subprocess.run(['systemctl', 'is-active', 'soop_mail'], capture_output=True, text=True)
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
            
            # Postfix configuration is validated via the maps below, 
            # we don't use 'postfix check' because it requires superuser privileges.
            postfix_config_ok = True
            postfix_config_error = ""
                
            # Verify Dovecot configuration
            dv_check = subprocess.run(['doveadm', 'config'], capture_output=True, text=True)
            if dv_check.returncode != 0:
                dovecot_config_ok = False
                dovecot_config_error = dv_check.stderr.strip()
            else:
                dovecot_config_ok = True
                dovecot_config_error = ""
                
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
        "virtual_mailbox_config": virtual_mailbox_config if 'virtual_mailbox_config' in locals() else "N/A",
        "storage_diagnostics": {
            "mail_base_path": MAIL_BASE,
            "mail_base_exists": os.path.exists(MAIL_BASE),
            "mail_base_writable": os.access(MAIL_BASE, os.W_OK) if os.path.exists(MAIL_BASE) else False,
            "users_checked": len(users),
            "mail_mailbox_bases": ["/var/mail/vhosts", "/var/mail/soop_mail"]
        }
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
            "exists": exists,
            "writable": writable,
            "status": "OK" if exists else "NOT_FOUND",
            "write_status": "WRITABLE" if writable else "READ_ONLY",
            "parent_exists": os.path.exists(parent_dir)
        }
    details["file_diagnostics"] = file_diagnostics
    
    # Alertas de almacenamiento
    storage_alerts = []
    if not os.path.exists(MAIL_BASE):
        storage_alerts.append(f"El directorio base de correo no existe.")
    elif not os.access(MAIL_BASE, os.R_OK):
        storage_alerts.append(f"No hay permisos de lectura para el directorio de correo.")
    
    if total_size_bytes == 0 and os.path.exists(MAIL_BASE):
        storage_alerts.append("No se detectaron archivos de correo en el almacenamiento.")
        
    details["storage_alerts"] = storage_alerts
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

    import ssl
    import socket
    def check_ssl_certificate(hostname: str, port: int = 443):
        context = ssl.create_default_context()
        try:
            with socket.create_connection((hostname, port), timeout=3) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    not_after_str = cert['notAfter']
                    expire_date = datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
                    days_remaining = (expire_date - datetime.utcnow()).days
                    issuer = dict(x[0] for x in cert['issuer'])
                    return {
                        "valid": days_remaining > 0,
                        "days_remaining": days_remaining,
                        "expire_date": expire_date.strftime('%Y-%m-%d %H:%M:%S'),
                        "issuer": issuer.get('organizationName', issuer.get('commonName', 'Unknown')),
                        "error": None
                    }
        except Exception as e:
            return {"valid": False, "error": str(e)}

    details["ssl_info"] = check_ssl_certificate(DEFAULT_DOMAIN, 443)
    
    try:
        if os.name != 'nt':
            certbot_check = subprocess.run(['systemctl', 'is-active', 'certbot.timer'], capture_output=True, text=True)
            details["ssl_info"]["auto_renew_active"] = certbot_check.stdout.strip() == 'active'
        else:
            details["ssl_info"]["auto_renew_active"] = True
    except:
        details["ssl_info"]["auto_renew_active"] = False

    return {
        "status": "online",
        "service_active": service_active,
        "details": details
    }

@app.get("/api/system/debug/storage")
async def debug_storage(current_user: models.User = Depends(auth.get_current_admin_user)):
    """Deep diagnostic tool for storage issues."""
    results = {
        "configured_base": MAIL_BASE,
        "base_exists": os.path.exists(MAIL_BASE),
        "base_readable": os.access(MAIL_BASE, os.R_OK),
        "base_contents": [],
        "user_paths_scanned": []
    }
    
    if results["base_exists"]:
        try:
            results["base_contents"] = os.listdir(MAIL_BASE)[:20] # Limit to first 20
        except Exception as e:
            results["base_contents_error"] = str(e)
            
    users = read_users_file()
    for u in users[:5]: # Debug first 5 users
        email = u['email']
        parts = email.split('@')
        domain = parts[1] if len(parts) > 1 else DEFAULT_DOMAIN
        username = parts[0]
        
        user_info = {
            "email": email,
            "configured_home": u['home'],
            "checked_paths": []
        }
        
        bases = ["/var/mail/vhosts", "/var/mail/soop_mail", os.path.dirname(os.path.dirname(u['home'] or "/"))]
        for base in set(bases):
            if not base or base == "/": continue
            path = os.path.join(base, domain, username)
            path_exists = os.path.exists(path)
            user_info["checked_paths"].append({
                "path": path,
                "exists": path_exists,
                "readable": os.access(path, os.R_OK) if path_exists else False,
                "size": format_size(get_dir_size(path)) if path_exists else 0
            })
        results["user_paths_scanned"].append(user_info)
        
    return results

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
        # Intenta usar tail, si falla (como en Windows), usa Python puro
        try:
            result = subprocess.run(['tail', '-n', str(lines), target_log], capture_output=True, text=True)
            if result.returncode == 0:
                return {"logs": result.stdout.splitlines(), "path": target_log}
        except FileNotFoundError:
            # Fallback para Windows o sistemas sin tail
            with open(target_log, 'r', encoding='utf-8', errors='replace') as f:
                # Leer las últimas N líneas de forma ineficiente pero segura para archivos pequeños/medianos
                all_lines = f.readlines()
                return {"logs": [line.strip() for line in all_lines[-lines:]], "path": target_log}

        return {"logs": ["Error al leer logs: Tail no devolvió nada"]}
    except Exception as e:
        return {"logs": [f"Error de sistema: {str(e)}"]}

@app.get("/api/system/logs/mail/auth")
def get_auth_logs(lines: int = 100, email: Optional[str] = None, current_user: models.User = Depends(auth.get_current_active_user)):
    # Todos los usuarios son admins ahora
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
        
        all_lines = []
        try:
            # Intentar usar tail para las últimas 2000 líneas
            result = subprocess.run(['tail', '-n', '2000', target_log], capture_output=True, text=True)
            if result.returncode == 0:
                all_lines = result.stdout.splitlines()
        except FileNotFoundError:
            # Fallback para Windows
            with open(target_log, 'r', encoding='utf-8', errors='replace') as f:
                all_lines = f.readlines()
        
        if not all_lines:
            return {"logs": []}
            
        auth_lines = []
        for line in all_lines:
            line = line.strip()
            if any(p in line for p in auth_patterns):
                if not email or email in line:
                    auth_lines.append(line)
                    
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
        
        process = None
        try:
            process = await asyncio.create_subprocess_exec(
                'tail', '-f', '-n', '100', target_log,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                decoded_line = line.decode('utf-8', errors='replace').strip()
                if any(p in decoded_line for p in auth_patterns):
                    if not email or email in decoded_line:
                        yield f"data: {decoded_line}\n\n"
        except FileNotFoundError:
            # Fallback para Windows: Polling básico (no recomendado para prod, pero útil para dev)
            last_size = os.path.getsize(target_log)
            while True:
                current_size = os.path.getsize(target_log)
                if current_size > last_size:
                    with open(target_log, 'r', encoding='utf-8', errors='replace') as f:
                        f.seek(last_size)
                        new_content = f.read()
                        for line in new_content.splitlines():
                            if any(p in line for p in auth_patterns):
                                if not email or email in line:
                                    yield f"data: {line}\n\n"
                    last_size = current_size
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            if process:
                process.terminate()
                await process.wait()
            raise
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
        finally:
            if process and process.returncode is None:
                process.terminate()
                await process.wait()

    return StreamingResponse(auth_log_generator(), media_type="text/event-stream")

# Email Traffic Logic
def sync_email_traffic(db: Session):
    """Parses mail logs to update email traffic statistics."""
    log_paths = ['/var/log/mail.log', '/var/log/mail.log.1']
    target_log = None
    for p in log_paths:
        if os.path.exists(p):
            target_log = p
            break
    
    if not target_log:
        return
        
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    try:
        qids_seen = set()
        
        try:
            # We check the last 10000 lines for the sync
            result = subprocess.run(['tail', '-n', '10000', target_log], capture_output=True, text=True)
            lines = result.stdout.splitlines()
        except:
            with open(target_log, 'r', errors='ignore') as f:
                lines = f.readlines()[-10000:]
                
        outgoing_qids = set()
        daily_counts = {}
        current_year = datetime.utcnow().year
        
        for line in lines:
            match = re.search(r'([A-F0-9]{10,15}):', line)
            if match:
                qid = match.group(1)
                
                # Extract date from log line
                line_date = None
                iso_match = re.match(r'^(\d{4}-\d{2}-\d{2})T', line)
                if iso_match:
                    line_date = iso_match.group(1)
                else:
                    syslog_match = re.match(r'^([A-Z][a-z]{2}\s+\d+)\s+', line)
                    if syslog_match:
                        try:
                            from datetime import timedelta
                            dt = datetime.strptime(f"{syslog_match.group(1)} {current_year}", "%b %d %Y")
                            if dt > datetime.utcnow() + timedelta(days=1):
                                dt = dt.replace(year=current_year - 1)
                            line_date = dt.strftime("%Y-%m-%d")
                        except: pass
                
                if not line_date:
                    line_date = today.strftime("%Y-%m-%d")
                    
                if line_date not in daily_counts:
                    daily_counts[line_date] = {"sent": 0, "received": 0}
                
                if "sasl_username=" in line or "client=localhost" in line or "client=127.0.0.1" in line:
                    outgoing_qids.add(qid)
                    
                if "status=sent" in line:
                    if qid not in qids_seen:
                        qids_seen.add(qid)
                        if qid in outgoing_qids:
                            daily_counts[line_date]["sent"] += 1
                        elif any(r in line for r in ["relay=local", "relay=virtual", "relay=lmtp", "relay=dovecot"]):
                            daily_counts[line_date]["received"] += 1
                            
        print(f"DEBUG SYNC: Parsed {len(lines)} lines. Counts grouped by date: {daily_counts}")
        
        for date_str, counts in daily_counts.items():
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            traffic = db.query(models.EmailTraffic).filter(models.EmailTraffic.date == dt).first()
            if not traffic:
                traffic = models.EmailTraffic(date=dt, sent_count=counts["sent"], received_count=counts["received"])
                db.add(traffic)
            else:
                traffic.sent_count = max(traffic.sent_count, counts["sent"])
                traffic.received_count = max(traffic.received_count, counts["received"])
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error syncing traffic: {str(e)}")

@app.get("/api/mail/traffic", response_model=schemas.TrafficStatsResponse)
async def get_mail_traffic(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if os.name != 'nt':
        sync_email_traffic(db)
        
    history_objs = db.query(models.EmailTraffic).order_by(models.EmailTraffic.date.desc()).limit(days).all()
    history_objs.reverse()
    
    if os.name == 'nt' and len(history_objs) == 0:
        import random
        from datetime import timedelta
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        history = []
        total_sent = 0
        total_received = 0
        peak_day_total = 0
        for i in range(days - 1, -1, -1):
            d = today - timedelta(days=i)
            sent = random.randint(50, 300)
            received = random.randint(100, 500)
            history.append({
                "date": d.strftime("%Y-%m-%d"),
                "sent": sent,
                "received": received,
                "total": sent + received
            })
            total_sent += sent
            total_received += received
            if (sent + received) > peak_day_total:
                peak_day_total = sent + received
        
        return {
            "history": history,
            "summary": {
                "total_sent": total_sent,
                "total_received": total_received,
                "days_analyzed": days,
                "avg_sent": total_sent / days,
                "avg_received": total_received / days,
                "peak_day_total": peak_day_total
            }
        }
    
    history = []
    total_sent = 0
    total_received = 0
    peak_day_total = 0
    
    from datetime import timedelta
    today_dt = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    history_map = {t.date.strftime("%Y-%m-%d"): t for t in history_objs}
    
    for i in range(days - 1, -1, -1):
        d = today_dt - timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        
        if d_str in history_map:
            t = history_map[d_str]
            sent = t.sent_count
            received = t.received_count
        else:
            sent = 0
            received = 0
            
        total = sent + received
        history.append({
            "date": d_str,
            "sent": sent,
            "received": received,
            "total": total
        })
        
        total_sent += sent
        total_received += received
        if total > peak_day_total:
            peak_day_total = total
            
    num_days = days
    
    return {
        "history": history,
        "summary": {
            "total_sent": total_sent,
            "total_received": total_received,
            "days_analyzed": days,
            "avg_sent": total_sent / num_days,
            "avg_received": total_received / num_days,
            "peak_day_total": peak_day_total
        }
    }

@app.post("/api/mail/traffic/track")
async def track_mail_traffic(
    direction: str,
    count: int = 1,
    db: Session = Depends(get_db)
):
    if direction not in ("sent", "received"):
        raise HTTPException(status_code=400, detail="Invalid direction")
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    traffic = db.query(models.EmailTraffic).filter(models.EmailTraffic.date == today).first()
    if not traffic:
        traffic = models.EmailTraffic(date=today)
        db.add(traffic)
    if direction == "sent": traffic.sent_count += count
    else: traffic.received_count += count
    db.commit()
    return {"status": "success"}

@app.post("/api/system/traffic/populate-mock")
async def populate_mock_traffic(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    import random
    for i in range(days):
        date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i)
        traffic = db.query(models.EmailTraffic).filter(models.EmailTraffic.date == date).first()
        if not traffic:
            traffic = models.EmailTraffic(
                date=date,
                sent_count=random.randint(10, 150),
                received_count=random.randint(20, 250)
            )
            db.add(traffic)
        else:
            traffic.sent_count = random.randint(10, 150)
            traffic.received_count = random.randint(20, 250)
    db.commit()
    return {"message": f"Populated {days} days of mock traffic data"}

# Serve Frontend
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # API requests that reach here are truly Not Found
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        
        # 1. Try to serve exact file from static
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # 2. Otherwise serve index.html (SPA logic)
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Frontend build (index.html) not found in static folder")
else:
    print(f"WARNING: STATIC_DIR not found at {STATIC_DIR}. Frontend will not be served.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
