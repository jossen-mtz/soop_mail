#!/bin/bash

echo "=========================================="
echo "VERIFICACIÓN DE CONTEO DE CORREOS"
echo "=========================================="
echo

# 1. Verificar conteo directo en el sistema de archivos
echo "1. CONTEO DIRECTO EN SISTEMA DE ARCHIVOS:"
echo "   Total de correos en /var/mail/vhosts:"
TOTAL_EMAILS=$(sudo find /var/mail/vhosts -path "*/cur/*" -o -path "*/new/*" | grep -E "/(cur|new)/" | wc -l)
echo "   $TOTAL_EMAILS correos encontrados"
echo

# 2. Verificar que www-data puede leer los directorios
echo "2. VERIFICACIÓN DE PERMISOS (www-data):"
TEST_DIR="/var/mail/vhosts/mmbtransporte.com/coordinacion/cur"
if sudo -u www-data ls "$TEST_DIR" &>/dev/null; then
    COUNT=$(sudo -u www-data ls "$TEST_DIR" | wc -l)
    echo "   ✓ www-data puede leer $TEST_DIR"
    echo "   Correos en coordinacion/cur: $COUNT"
else
    echo "   ✗ www-data NO puede leer $TEST_DIR"
fi
echo

# 3. Ejecutar el script de debug Python como www-data
echo "3. EJECUTAR SCRIPT DEBUG COMO www-data:"
if [ -f "/var/www/soop_mail/debug_mailbox_stats.py" ]; then
    echo "   Ejecutando debug script..."
    sudo -u www-data python3 /var/www/soop_mail/debug_mailbox_stats.py 2>&1 | tail -30
else
    echo "   ⚠ Script debug_mailbox_stats.py no encontrado"
fi
echo

# 4. Verificar permisos del grupo vmail
echo "4. VERIFICACIÓN DEL GRUPO vmail:"
echo "   Grupos de www-data:"
groups www-data
echo
echo "   Permisos de /var/mail/vhosts:"
ls -ld /var/mail/vhosts
echo
echo "   Permisos de ejemplo (coordinacion):"
ls -ld /var/mail/vhosts/mmbtransporte.com/coordinacion
echo

# 5. Test de lectura de archivos
echo "5. TEST DE LECTURA DE ARCHIVOS:"
SAMPLE_FILE=$(sudo find /var/mail/vhosts/mmbtransporte.com/coordinacion/cur -type f | head -1)
if [ -n "$SAMPLE_FILE" ]; then
    echo "   Archivo de prueba: $SAMPLE_FILE"
    if sudo -u www-data cat "$SAMPLE_FILE" &>/dev/null; then
        echo "   ✓ www-data puede leer archivos de correo"
    else
        echo "   ✗ www-data NO puede leer archivos de correo"
        ls -l "$SAMPLE_FILE"
    fi
else
    echo "   ⚠ No se encontraron archivos de correo para probar"
fi
echo

# 6. Verificar la respuesta de la API (sin auth - solo para ver la estructura)
echo "6. VERIFICACIÓN DE API (estructura):"
echo "   Intentando acceder a /api/mail/users..."
RESPONSE=$(curl -s --unix-socket /var/www/soop_mail/soop_mail.sock http://localhost/api/mail/users)
echo "   Respuesta: $RESPONSE"
echo "   (Se espera 'Not authenticated' - esto es correcto)"
echo

# 7. Resumen del estado
echo "=========================================="
echo "RESUMEN:"
echo "=========================================="
echo "Correos totales en sistema: $TOTAL_EMAILS"
echo "Usuario del backend: www-data"
echo "Grupos de www-data: $(groups www-data | cut -d: -f2)"
echo "API escuchando en: /var/www/soop_mail/soop_mail.sock"
echo "Estado de autenticación: Requiere credenciales (correcto)"
echo
echo "PRÓXIMO PASO:"
echo "  Para ver los correos en la interfaz web:"
echo "  1. Accede a https://soopmail.mmbtransporte.com"
echo "  2. Inicia sesión con tus credenciales"
echo "  3. Los conteos deberían aparecer correctamente"
echo "=========================================="
