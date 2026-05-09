#!/usr/bin/env python3
import os

def get_mailbox_stats_debug(mail_dir: str):
    """Versión debug de get_mailbox_stats"""
    print(f"\n{'='*60}")
    print(f"DEBUG: Analizando mail_dir='{mail_dir}'")
    print(f"{'='*60}")
    
    if not mail_dir:
        print("  ❌ mail_dir está vacío")
        return 0, 0, 0, ""
        
    # Extraer dominio y usuario
    parts = mail_dir.strip('/').split('/')
    domain = parts[-2] if len(parts) >= 2 else "mmbtransporte.com"
    username = parts[-1] if len(parts) >= 1 else ""
    email = f"{username}@{domain}" if username and domain else ""
    
    print(f"  📧 Email calculado: {email}")
    print(f"  📁 Domain: {domain}, Username: {username}")
    
    # Bases donde buscaremos
    MAILBOX_BASES = ["/var/mail/vhosts", "/var/mail/soop_mail", "/var/mail", "/var/vmail"]
    if os.path.dirname(os.path.dirname(mail_dir)) not in MAILBOX_BASES:
        MAILBOX_BASES.append(os.path.dirname(os.path.dirname(mail_dir)))
    
    print(f"  🔍 Bases a buscar: {MAILBOX_BASES}")

    total = 0
    new = 0
    size_bytes = 0
    resolved_paths = []

    for base in set(MAILBOX_BASES):
        if not base or base == "/": 
            continue
        
        print(f"\n  🔎 Probando base: {base}")
        
        # Probar diferentes combinaciones de carpetas
        candidates = [
            os.path.join(base, domain, username), # dominio/usuario
            os.path.join(base, email),           # usuario@dominio
            os.path.join(base, username),        # usuario
            mail_dir                             # ruta original
        ]
        
        for mailbox_path in candidates:
            if not mailbox_path or mailbox_path in resolved_paths:
                continue
            
            print(f"     🧪 Candidato: {mailbox_path}")
            
            if not os.path.exists(mailbox_path):
                print(f"        ❌ No existe")
                continue
            
            # Verificar si parece un Maildir (tiene cur, new o tmp)
            has_cur = os.path.exists(os.path.join(mailbox_path, "cur"))
            has_new = os.path.exists(os.path.join(mailbox_path, "new"))
            has_tmp = os.path.exists(os.path.join(mailbox_path, "tmp"))
            
            print(f"        📂 cur={has_cur}, new={has_new}, tmp={has_tmp}")
            
            is_maildir = has_cur or has_new or has_tmp
            if not is_maildir:
                print(f"        ❌ No es un Maildir válido")
                continue
            
            print(f"        ✅ Es un Maildir válido!")
            resolved_paths.append(mailbox_path)
            
            try:
                for root, dirs, files in os.walk(mailbox_path):
                    folder_name = os.path.basename(root)
                    if folder_name in ("cur", "new"):
                        is_new_dir = folder_name == "new"
                        email_files = [f for f in files if not f.startswith("dovecot")]
                        if email_files:
                            print(f"        📬 {len(email_files)} correos en {root}")
                        for file in email_files:
                            total += 1
                            if is_new_dir: new += 1
                            try:
                                fp = os.path.join(root, file)
                                if not os.path.islink(fp):
                                    size_bytes += os.path.getsize(fp)
                            except: 
                                pass
            except Exception as e:
                print(f"        ⚠️ Error al leer: {str(e)}")
    
    print(f"\n  {'='*58}")
    print(f"  ✅ RESULTADO: {total} correos, {new} nuevos")
    print(f"  📂 Rutas resueltas: {resolved_paths}")
    print(f"  {'='*58}\n")
    
    return total, new, size_bytes, resolved_paths[0] if resolved_paths else mail_dir

# Test con usuarios reales
test_cases = [
    "/var/mail/vhosts/mmbtransporte.com/mantenimiento",
    "/var/mail/vhosts/mmbtransporte.com/coordinacion",
    "/var/mail/vhosts/mmbtransporte.com/talentohumano",
    "/var/mail/vhosts/mmbtransporte.com/notificaciones_mantenimientos"
]

for mail_dir in test_cases:
    total, new, size_bytes, path = get_mailbox_stats_debug(mail_dir)
