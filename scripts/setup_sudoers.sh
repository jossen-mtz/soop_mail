#!/bin/bash
# ============================================================
# setup_sudoers.sh - Soop Mail: configuración correcta de permisos
#
# Ejecutar como root: sudo bash scripts/setup_sudoers.sh
#
# ARQUITECTURA DE PERMISOS:
#
#  /var/mail/soop_mail/        → vmail:vmail  750  (vmail escribe, www-data lee via grupo)
#  /var/mail/soop_mail/domain/ → vmail:vmail  750  (ídem)
#  /var/mail/soop_mail/domain/u/→ vmail:vmail  700  (solo Dovecot, buzones privados)
#
#  /etc/postfix/vmailbox       → root:www-data 660  (Postfix lee, app escribe)
#  /etc/dovecot/users          → root:www-data 660  (Dovecot lee, app escribe)
#
#  www-data NUNCA escribe en /var/mail/ directamente.
#  Solo puede LEER el directorio raíz y de dominio (para validación).
#  Para crear un nuevo buzón usa: sudo /usr/local/bin/soop_create_mailbox
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
echo " PASO 1: Agregar $SOOP_USER al grupo vmail"
echo " (permite lectura de /var/mail/ sin dar escritura)"
echo "========================================================"

usermod -aG "$VMAIL_GROUP" "$SOOP_USER"
echo "  OK: $SOOP_USER agregado al grupo $VMAIL_GROUP"

echo ""
echo "========================================================"
echo " PASO 2: Restaurar /var/mail/ a vmail:vmail"
echo " Directorios raíz y dominio: 750 (grupo puede leer)"
echo " Buzones individuales:        700 (solo vmail/Dovecot)"
echo "========================================================"

for MAIL_DIR in /var/mail/vhosts /var/mail/soop_mail /var/vmail; do
    [ -d "$MAIL_DIR" ] || continue
    echo "  → Restaurando $MAIL_DIR ..."

    # Owner siempre vmail
    chown -R "$VMAIL_UID:$VMAIL_GID" "$MAIL_DIR"

    # Archivos: solo vmail (600)
    find "$MAIL_DIR" -type f -exec chmod 600 {} \;

    # Todos los directorios: 700 por defecto
    find "$MAIL_DIR" -type d -exec chmod 700 {} \;

    # Directorio raíz y primer nivel (dominio): 750 para que www-data pueda leer
    chmod 750 "$MAIL_DIR"
    for DOMAIN_DIR in "$MAIL_DIR"/*/; do
        [ -d "$DOMAIN_DIR" ] && chmod 750 "$DOMAIN_DIR"
    done

    echo "     OK: $MAIL_DIR → vmail:vmail (raíz/dominio:750, buzones:700, files:600)"
done

echo ""
echo "========================================================"
echo " PASO 3: Archivos de config de Postfix y Dovecot"
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
echo " PASO 4: Instalar helper /usr/local/bin/soop_create_mailbox"
echo " www-data llama a este script via sudo para crear maildirs"
echo " El script crea dirs con vmail:vmail 700 (buzón privado)"
echo " mail_location = maildir:/var/mail/vhosts/%d/%n"
echo "========================================================"

HELPER="/usr/local/bin/soop_create_mailbox"
cat > "$HELPER" << HELPEREOF
#!/bin/bash
# soop_create_mailbox - Crea un Maildir con ownership vmail:vmail
# Uso: sudo $HELPER /var/mail/soop_mail/domain/usuario
set -euo pipefail

TARGET="\$1"
[ -z "\$TARGET" ] && { echo "ERROR: falta ruta" >&2; exit 1; }
[[ "\$TARGET" =~ ^/var/mail/ ]] || { echo "ERROR: ruta invalida" >&2; exit 1; }

VMAIL_UID=$VMAIL_UID
VMAIL_GID=$VMAIL_GID

# Crear estructura Maildir sin subcarpeta extra
# (mail_location = maildir:/var/mail/vhosts/%d/%n)
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
echo " PASO 5: Reglas sudoers para $SOOP_USER"
echo "========================================================"

SUDOERS="/etc/sudoers.d/soop_mail"
cat > "$SUDOERS" << EOF
# Soop Mail sudoers - $(date)
# $SOOP_USER puede ejecutar comandos de correo SIN contraseña.
# NO se otorgan permisos de escritura sobre /var/mail/ directamente.

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
echo " PASO 6: Reiniciar servicios"
echo "========================================================"
systemctl restart dovecot && echo "  OK: dovecot reiniciado"
systemctl restart soop_mail && echo "  OK: soop_mail reiniciado"

echo ""
echo "========================================================"
echo " VERIFICACIÓN FINAL"
echo "========================================================"
echo "  Grupos de $SOOP_USER:"
groups "$SOOP_USER"
echo ""
echo "  Permisos /var/mail/:"
ls -la /var/mail/ 2>/dev/null || true
echo ""
echo "  Permisos /var/mail/soop_mail/:"
ls -la /var/mail/soop_mail/ 2>/dev/null || true
echo ""
echo "  Permisos /etc/postfix/vmailbox:"
ls -la /etc/postfix/vmailbox 2>/dev/null || true
echo ""
echo " LISTO. Dovecot y Roundcube no fueron afectados."
echo " Prueba crear un usuario en el dashboard."
echo "========================================================"