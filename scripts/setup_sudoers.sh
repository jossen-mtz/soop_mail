#!/bin/bash
# ============================================================
# setup_sudoers.sh - Soop Mail: configuración correcta de permisos
#
# Ejecutar como root: sudo bash scripts/setup_sudoers.sh
#
# ARQUITECTURA DE PERMISOS (no se modifica nada más):
#
#  /var/mail/vhosts/           → vmail:vmail  700  (solo Dovecot)
#  /var/mail/vhosts/domain/    → vmail:vmail  700  (solo Dovecot)
#  /var/mail/vhosts/domain/u/  → vmail:vmail  700  (solo Dovecot)
#
#  /etc/postfix/vmailbox       → root:www-data 660  (Postfix lee, app escribe)
#  /etc/dovecot/users          → root:www-data 660  (Dovecot lee, app escribe)
#
#  www-data NUNCA toca /var/mail/ directamente.
#  Para crear un nuevo buzón, usa: sudo /usr/local/bin/soop_create_mailbox
#  Ese helper corre como root y crea el dir con vmail:vmail 700.
# ============================================================

set -euo pipefail

# ---- Detectar usuario del servicio soop_mail ----
SOOP_USER=$(systemctl show -pUser soop_mail 2>/dev/null | cut -d= -f2)
SOOP_USER="${SOOP_USER:-www-data}"
echo "Usuario del servicio: $SOOP_USER"

# ---- Detectar usuario/grupo vmail ----
if id vmail &>/dev/null; then
    VMAIL_UID=$(id -u vmail)
    VMAIL_GID=$(id -g vmail)
    VMAIL_GROUP=$(id -gn vmail)
else
    VMAIL_UID=5000
    VMAIL_GID=5000
    VMAIL_GROUP=vmail
fi
echo "vmail: UID=$VMAIL_UID GID=$VMAIL_GID grupo=$VMAIL_GROUP"

echo ""
echo "========================================================"
echo " PASO 1: Restaurar /var/mail/ a vmail:vmail"
echo " (Repara daños de scripts anteriores. Solo ownership/perms)"
echo "========================================================"

for MAIL_DIR in /var/mail/vhosts /var/mail/soop_mail /var/vmail; do
    [ -d "$MAIL_DIR" ] || continue
    echo "  → Restaurando $MAIL_DIR ..."
    chown -R "$VMAIL_UID:$VMAIL_GID" "$MAIL_DIR"
    find "$MAIL_DIR" -type d -exec chmod 700 {} \;
    find "$MAIL_DIR" -type f -exec chmod 600 {} \;
    echo "     OK: $MAIL_DIR → vmail:vmail (dirs:700, files:600)"
done

echo ""
echo "========================================================"
echo " PASO 2: Archivos de config de Postfix y Dovecot"
echo " www-data puede ESCRIBIR estos archivos, no /var/mail/"
echo "========================================================"

for FILE in \
    /etc/postfix/vmailbox \
    /etc/postfix/virtual \
    /etc/postfix/sender_bcc \
    /etc/postfix/recipient_bcc; do
    [ -f "$FILE" ] || { touch "$FILE"; echo "  Creado: $FILE"; }
    chown "root:$SOOP_USER" "$FILE"
    chmod 660 "$FILE"
    echo "  OK: $FILE → root:$SOOP_USER (660)"
done

if [ -f /etc/dovecot/users ]; then
    chown "root:$SOOP_USER" /etc/dovecot/users
    chmod 660 /etc/dovecot/users
    echo "  OK: /etc/dovecot/users → root:$SOOP_USER (660)"
fi

echo ""
echo "========================================================"
echo " PASO 3: Instalar helper /usr/local/bin/soop_create_mailbox"
echo " www-data llama a este script via sudo para crear maildirs"
echo " El script crea dirs con vmail:vmail sin tocar lo existente"
echo "========================================================"

HELPER="/usr/local/bin/soop_create_mailbox"
cat > "$HELPER" << HELPEREOF
#!/bin/bash
# soop_create_mailbox - Crea un Maildir con ownership vmail:vmail
# Uso: sudo $HELPER /var/mail/vhosts/domain/usuario
# mail_location = maildir:/var/mail/vhosts/%d/%n  (sin subcarpeta Maildir/)
set -euo pipefail

TARGET="\$1"
[ -z "\$TARGET" ] && { echo "ERROR: falta ruta" >&2; exit 1; }
[[ "\$TARGET" =~ ^/var/mail/ ]] || { echo "ERROR: ruta invalida" >&2; exit 1; }

VMAIL_UID=$VMAIL_UID
VMAIL_GID=$VMAIL_GID

mkdir -p "\$TARGET/new" "\$TARGET/cur" "\$TARGET/tmp"
chown -R "\$VMAIL_UID:\$VMAIL_GID" "\$TARGET"
chmod -R 700 "\$TARGET"
echo "OK: \$TARGET creado como \$VMAIL_UID:\$VMAIL_GID (new/cur/tmp)"
HELPEREOF

chown root:root "$HELPER"
chmod 755 "$HELPER"
echo "  OK: $HELPER instalado"

echo ""
echo "========================================================"
echo " PASO 4: Reglas sudoers para $SOOP_USER"
echo "========================================================"

SUDOERS="/etc/sudoers.d/soop_mail"
cat > "$SUDOERS" << EOF
# Soop Mail sudoers - $(date)
# $SOOP_USER puede ejecutar comandos de correo SIN contraseña.
# NO se otorgan permisos sobre /var/mail/ directamente.

# Indexar mapas de Postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postmap

# Recargar Postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postfix reload
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart postfix

# Recargar Dovecot
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload dovecot
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart dovecot

# Crear nuevos maildirs (el helper valida la ruta antes de ejecutar)
$SOOP_USER ALL=(root) NOPASSWD: $HELPER
EOF

chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS" && echo "  OK: $SUDOERS validado" || { rm "$SUDOERS"; echo "ERROR: sudoers inválido"; exit 1; }

echo ""
echo "========================================================"
echo " PASO 5: Reiniciar soop_mail"
echo "========================================================"
systemctl restart soop_mail && echo "  OK: servicio reiniciado"

echo ""
echo "========================================================"
echo " VERIFICACIÓN FINAL"
echo "========================================================"
echo "  Propietarios /var/mail/:"
ls -la /var/mail/ 2>/dev/null || true
echo ""
echo "  Propietarios /etc/postfix/vmailbox:"
ls -la /etc/postfix/vmailbox 2>/dev/null || true
echo ""
echo " LISTO. Dovecot y Roundcube no fueron afectados."
echo " Prueba crear un usuario en el dashboard."
echo "========================================================"