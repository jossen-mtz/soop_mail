#!/bin/bash
# ============================================================
# soop_create_mailbox - Helper privilegiado para crear maildirs
# 
# Este script se ejecuta como root via sudo por www-data.
# Crea el directorio Maildir con el ownership correcto (vmail:vmail)
# sin afectar ningún otro directorio existente.
#
# Uso: sudo /usr/local/bin/soop_create_mailbox <ruta_maildir>
# Ejemplo: sudo /usr/local/bin/soop_create_mailbox /var/mail/vhosts/mmbtransporte.com/usuario
# ============================================================

set -e

MAIL_BASE_PATH="$1"

# Validación de seguridad: solo rutas dentro de /var/mail/
if [ -z "$MAIL_BASE_PATH" ]; then
    echo "ERROR: Se requiere la ruta del maildir" >&2
    exit 1
fi

if [[ ! "$MAIL_BASE_PATH" =~ ^/var/mail/ ]]; then
    echo "ERROR: Ruta inválida. Debe estar dentro de /var/mail/" >&2
    exit 1
fi

# Detectar vmail UID/GID
VMAIL_UID=5000
VMAIL_GID=5000
if id "vmail" &>/dev/null; then
    VMAIL_UID=$(id -u vmail)
    VMAIL_GID=$(id -g vmail)
fi

# Crear estructura Maildir
MAILDIR="$MAIL_BASE_PATH/Maildir"
mkdir -p "$MAILDIR/new" "$MAILDIR/cur" "$MAILDIR/tmp"

# Asignar ownership a vmail (Dovecot necesita esto)
chown -R "$VMAIL_UID":"$VMAIL_GID" "$MAIL_BASE_PATH"
chmod -R 700 "$MAIL_BASE_PATH"

echo "OK: Maildir creado en $MAILDIR con owner $VMAIL_UID:$VMAIL_GID"
