#!/bin/bash

echo "=========================================="
echo "CORRECCIÓN DE RUTAS EN /etc/dovecot/users"
echo "=========================================="

# Backup del archivo original
sudo cp /etc/dovecot/users /etc/dovecot/users.backup.$(date +%Y%m%d_%H%M%S)

echo -e "\n1. Creando archivo corregido..."

# Corregir todas las rutas para que apunten a /var/mail/vhosts
sudo sed -i 's|:/var/mail/soop_mail/|:/var/mail/vhosts/|g' /etc/dovecot/users

# Corregir usuarios sin ruta (como mantenimiento)
sudo sed -i 's|mantenimiento@mmbtransporte.com:\(.*\):5000:5000::::|mantenimiento@mmbtransporte.com:\1:5000:5000::/var/mail/vhosts/mmbtransporte.com/mantenimiento::|' /etc/dovecot/users

echo -e "\n2. Verificando cambios..."
sudo grep -E "coordinacion|pruebas|mantenimiento" /etc/dovecot/users

echo -e "\n3. Reiniciando Dovecot..."
sudo systemctl restart dovecot

echo -e "\n4. Estado de Dovecot:"
sudo systemctl status dovecot | grep Active

echo "=========================================="
echo "✅ CORRECCIÓN COMPLETADA"
echo "=========================================="
