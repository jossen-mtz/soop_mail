#!/bin/bash
# ============================================================
# setup_sudoers.sh - Soop Mail: Configuración con soporte ACL
#
# SOLUCIÓN DE ARMONÍA (CORREGIDA):
# - Dovecot/IMAP no se rompe (sigue usando vmail y el grupo soopmail para auth)
# - El panel web no lanza errores (www-data obtiene escritura vía ACL y Owner)
# ============================================================
set -euo pipefail

# Asegurar que el sistema soporta ACL (Listas de Control de Acceso)
if ! command -v setfacl &> /dev/null; then
    echo "Instalando paquete acl..."
    apt-get update && apt-get install -y acl
fi

SOOP_USER=$(systemctl show -pUser soop_mail 2>/dev/null | cut -d= -f2)
SOOP_USER="${SOOP_USER:-www-data}"

# DEFINICIÓN DEL GRUPO DE AUTENTICACIÓN (Basado en los logs de Dovecot)
AUTH_GROUP="soopmail"

VMAIL_UID=$(id -u vmail 2>/dev/null || echo 5000)
VMAIL_GID=$(id -g vmail 2>/dev/null || echo 5000)

echo "========================================================"
echo " PASO 1: Archivo /etc/dovecot/users (Permiso Híbrido)"
echo "========================================================"
[ -f /etc/dovecot/users ] || touch /etc/dovecot/users

# CORRECCIÓN APLICADA: 
# El panel web ($SOOP_USER) es el dueño para que no lance errores en la UI.
# El grupo es $AUTH_GROUP (soopmail) porque es el que usa Dovecot para leer el archivo.
chown "$SOOP_USER:$AUTH_GROUP" /etc/dovecot/users
chmod 660 /etc/dovecot/users

echo "  OK: /etc/dovecot/users -> $SOOP_USER:$AUTH_GROUP (660)"

echo ""
echo "========================================================"
echo " PASO 2: Directorio de Correos (Magia con ACL)"
echo "========================================================"
MAIL_DIR="/var/mail/soop_mail"
mkdir -p "$MAIL_DIR"

# 1. Devolver el control real a vmail para que IMAP funcione
chown -R "$VMAIL_UID:$VMAIL_GID" "$MAIL_DIR"
find "$MAIL_DIR" -type d -exec chmod 750 {} \;
find "$MAIL_DIR" -type f -exec chmod 600 {} \;

# 2. Aplicar ACL: Dar permisos invisibles de lectura/escritura al panel web
# Esto engaña a la validación de tu panel haciéndole creer que es el dueño
setfacl -R -m u:"$SOOP_USER":rwx "$MAIL_DIR"

# 3. ACL por defecto: Cualquier carpeta nueva heredará estos permisos
setfacl -R -d -m u:"$SOOP_USER":rwx "$MAIL_DIR"

echo "  OK: Permisos base restaurados para vmail."
echo "  OK: Reglas ACL aplicadas para $SOOP_USER."

echo ""
echo "========================================================"
echo " PASO 3: Archivos de config de Postfix"
echo "========================================================"
for FILE in /etc/postfix/vmailbox /etc/postfix/virtual /etc/postfix/sender_bcc /etc/postfix/recipient_bcc; do
    [ -f "$FILE" ] || touch "$FILE"
    chown "$SOOP_USER:postfix" "$FILE"
    chmod 660 "$FILE"
done
echo "  OK: Archivos de Postfix listos."

echo ""
echo "========================================================"
echo " PASO 4: Reglas Sudoers (Para recargar servicios)"
echo "========================================================"
SUDOERS="/etc/sudoers.d/soop_mail"
cat > "$SUDOERS" << EOF
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postmap
$SOOP_USER ALL=(root) NOPASSWD: /usr/sbin/postfix reload
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart postfix
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload dovecot
$SOOP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart dovecot
EOF

chmod 440 "$SUDOERS"
visudo -cf "$SUDOERS" || { rm "$SUDOERS"; echo "ERROR: sudoers inválido"; exit 1; }

echo ""
echo "========================================================"
echo " PASO 5: Reinicio de Servicios"
echo "========================================================"
systemctl restart dovecot
systemctl restart postfix
systemctl restart php*-fpm 2>/dev/null || true
systemctl restart nginx 2>/dev/null || true
systemctl restart apache2 2>/dev/null || true

echo "LISTO. IMAP y Panel Web ahora están en sincronía total."