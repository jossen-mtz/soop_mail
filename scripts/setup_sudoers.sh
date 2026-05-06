#!/bin/bash
# ============================================================
# setup_sudoers.sh - Soop Mail: Configuración segura de permisos
#
# ARQUITECTURA DE CONVIVENCIA (Roundcube + API Segura):
#  - /var/mail/... -> vmail:vmail
#  - Carpetas      -> 750 (www-data puede listar/validar vía grupo vmail)
#  - Archivos      -> 600 (Solo vmail lee los correos)
#  - Dovecot users -> root:dovecot 640
# ============================================================
set -euo pipefail

# ---- 1. Detectar usuarios ----
SOOP_USER=$(systemctl show -pUser soop_mail 2>/dev/null | cut -d= -f2)
SOOP_USER="${SOOP_USER:-www-data}"
echo "Usuario web/API: $SOOP_USER"

if id vmail &>/dev/null; then
    VMAIL_UID=$(id -u vmail)
    VMAIL_GID=$(id -g vmail)
    VMAIL_GROUP=$(id -gn vmail)
else
    echo "ERROR: usuario vmail no existe. Créalo primero."
    exit 1
fi

if id dovecot &>/dev/null; then
    DOVECOT_GROUP=$(id -gn dovecot)
else
    echo "ERROR: usuario dovecot no existe."
    exit 1
fi

echo ""
echo "========================================================"
echo " PASO 1: Convivencia -> Agregar $SOOP_USER al grupo vmail"
echo "========================================================"
usermod -aG "$VMAIL_GROUP" "$SOOP_USER"
echo "  OK: $SOOP_USER ahora pertenece al grupo $VMAIL_GROUP"

echo ""
echo "========================================================"
echo " PASO 2: Permisos seguros en /var/mail/ (No rompe Roundcube)"
echo "========================================================"
for MAIL_DIR in /var/mail/vhosts /var/mail/soop_mail /var/vmail; do
    [ -d "$MAIL_DIR" ] || continue
    echo "  → Aplicando permisos en $MAIL_DIR ..."
    
    # Dueño absoluto: vmail
    chown -R "$VMAIL_UID:$VMAIL_GID" "$MAIL_DIR"
    
    # Carpetas en 750 (vmail rwx, grupo vmail rx, otros nada)
    find "$MAIL_DIR" -type d -exec chmod 750 {} \;
    
    # Archivos de correo en 600 (solo vmail rw, grupo nada, otros nada)
    find "$MAIL_DIR" -type f -exec chmod 600 {} \;
    
    echo "     OK: Carpetas 750 | Archivos 600"
done

echo ""
echo "========================================================"
echo " PASO 3: Archivos de config de Postfix"
echo "========================================================"
for FILE in \
    /etc/postfix/vmailbox \
    /etc/postfix/virtual \
    /etc/postfix/sender_bcc \
    /etc/postfix/recipient_bcc; do
    
    [ -f "$FILE" ] || touch "$FILE"
    # El grupo debe ser postfix para que el MTA pueda enrutar
    chown "$SOOP_USER:postfix" "$FILE"
    chmod 660 "$FILE"
    echo "  OK: $FILE → $SOOP_USER:postfix (660)"
done

echo ""
echo "========================================================"
echo " PASO 4: Archivo /etc/dovecot/users (Lectura para Dovecot)"
echo "========================================================"
[ -f /etc/dovecot/users ] || touch /etc/dovecot/users
chown "root:$DOVECOT_GROUP" /etc/dovecot/users
chmod 640 /etc/dovecot/users
echo "  OK: /etc/dovecot/users → root:$DOVECOT_GROUP (640)"

echo ""
echo "========================================================"
echo " PASO 5: Helper soop_create_mailbox"
echo "========================================================"
HELPER="/usr/local/bin/soop_create_mailbox"
cat > "$HELPER" << HELPEREOF
#!/bin/bash
set -euo pipefail

TARGET="\$1"
[ -z "\$TARGET" ] && { echo "ERROR: falta ruta" >&2; exit 1; }
[[ "\$TARGET" =~ ^/var/mail/ ]] || { echo "ERROR: ruta invalida" >&2; exit 1; }

mkdir -p "\$TARGET/new" "\$TARGET/cur" "\$TARGET/tmp"
chown -R "$VMAIL_UID:$VMAIL_GID" "\$TARGET"

# Mantener la regla de convivencia al crear nuevos buzones
find "\$TARGET" -type d -exec chmod 750 {} \;

echo "OK: Buzón \$TARGET creado correctamente (vmail:vmail 750)"
HELPEREOF

chown root:root "$HELPER"
chmod 755 "$HELPER"
echo "  OK: Helper de creación instalado."

echo ""
echo "========================================================"
echo " PASO 6: Helper soop_update_dovecot_users (Modo seguro)"
echo "========================================================"
DOVECOT_HELPER="/usr/local/bin/soop_update_dovecot_users"
cat > "$DOVECOT_HELPER" << 'DOVECOTHELPEREOF'
#!/bin/bash
set -euo pipefail

USERS_FILE="/etc/dovecot/users"
TEMP_FILE="${USERS_FILE}.tmp"

# Leemos toda la entrada de la app
cat > "$TEMP_FILE"

# Validar que no estemos metiendo basura que rompa Dovecot
if ! grep -qE '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}:\{[A-Z0-9-]+\}' "$TEMP_FILE"; then
    echo "ERROR: Formato inválido" >&2
    rm -f "$TEMP_FILE"
    exit 1
fi

mv "$TEMP_FILE" "$USERS_FILE"

# Forzar los permisos correctos siempre
chown "root:dovecot" "$USERS_FILE"
chmod 640 "$USERS_FILE"

echo "OK: /etc/dovecot/users actualizado."
DOVECOTHELPEREOF

chown root:root "$DOVECOT_HELPER"
chmod 755 "$DOVECOT_HELPER"
echo "  OK: Helper de actualización instalado."

echo ""
echo "========================================================"
echo " PASO 7: Sudoers"
echo "========================================================"
SUDOERS="/etc/sudoers.d/soop_mail"
cat > "$SUDOERS" << EOF
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postmap
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postfix reload
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload dovecot
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart dovecot
$SOOP_USER ALL=(root) NOPASSWD: $HELPER
$SOOP_USER ALL=(root) NOPASSWD: $DOVECOT_HELPER
EOF

chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS" || { rm "$SUDOERS"; echo "ERROR: sudoers inválido"; exit 1; }

echo ""
echo "========================================================"
echo " PASO 8: Aplicar cambios en procesos activos"
echo "========================================================"
systemctl restart dovecot && echo "  OK: Dovecot reiniciado"

# Refrescar los grupos del servidor web para que Roundcube no falle
echo "  → Reiniciando servicios web/PHP para heredar grupo vmail..."
systemctl restart php*-fpm 2>/dev/null || echo "  PHP-FPM no encontrado o ya reiniciado"
systemctl restart nginx 2>/dev/null || true
systemctl restart apache2 2>/dev/null || true

echo ""
echo "LISTO. Ejecución completada sin afectar Roundcube."