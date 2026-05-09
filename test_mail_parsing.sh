#!/bin/bash
################################################################################
# Script de Prueba - Parsing de Logs de Correo
# Simula la lógica de detección de correos enviados/recibidos
################################################################################

echo "=========================================="
echo "TEST DE PARSING DE LOGS - Soop Mail"
echo "=========================================="
echo ""

LOG_FILE="/var/log/mail.log"

echo "1. Análisis de QIDs (Queue IDs) únicos:"
echo "--------------------------------------"
TOTAL_QIDS=$(sudo grep -oP '[A-F0-9]{10,15}:' "$LOG_FILE" | sort -u | wc -l)
echo "Total de QIDs únicos: $TOTAL_QIDS"
echo ""

echo "2. QIDs de correos ENVIADOS:"
echo "--------------------------------------"
# Correos enviados: tienen sasl_username (autenticación) o vienen de localhost
SENT_QIDS=$(sudo grep "status=sent" "$LOG_FILE" | \
    grep -E "(sasl_username=|client=localhost|client=127.0.0.1)" | \
    grep -oP '[A-F0-9]{10,15}:' | sort -u | wc -l)
echo "QIDs de correos enviados: $SENT_QIDS"
echo ""

# Mostrar ejemplos
echo "Ejemplos de líneas de correos ENVIADOS:"
sudo grep "status=sent" "$LOG_FILE" | \
    grep -E "(sasl_username=|client=localhost)" | \
    head -2
echo ""

echo "3. QIDs de correos RECIBIDOS:"
echo "--------------------------------------"
# Correos recibidos: relay a dovecot-lmtp (entrega local)
RECEIVED_QIDS=$(sudo grep "status=sent" "$LOG_FILE" | \
    grep -E "(private/dovecot-lmtp|relay=lmtp|relay=local|relay=virtual|relay=dovecot|relay=127.0.0.1)" | \
    grep -v "sasl_username=" | \
    grep -v "client=localhost" | \
    grep -oP '[A-F0-9]{10,15}:' | sort -u | wc -l)
echo "QIDs de correos recibidos: $RECEIVED_QIDS"
echo ""

# Mostrar ejemplos
echo "Ejemplos de líneas de correos RECIBIDOS:"
sudo grep "status=sent" "$LOG_FILE" | \
    grep "private/dovecot-lmtp" | \
    head -2
echo ""

echo "4. Desglose por tipo de relay:"
echo "--------------------------------------"
echo "Relay a Gmail/Hotmail (ENVIADOS externos):"
sudo grep "status=sent" "$LOG_FILE" | \
    grep -E "(gmail-smtp-in|aspmx|hotmail-com.olc)" | \
    wc -l

echo ""
echo "Relay a dovecot-lmtp (RECIBIDOS locales):"
sudo grep "status=sent" "$LOG_FILE" | \
    grep "private/dovecot-lmtp" | \
    wc -l

echo ""
echo "=========================================="
echo "RESUMEN"
echo "=========================================="
echo "Total de correos procesados: $(sudo grep 'status=sent' "$LOG_FILE" | wc -l)"
echo "Enviados detectados: $SENT_QIDS"
echo "Recibidos detectados: $RECEIVED_QIDS"
echo ""

echo "=========================================="
echo "VERIFICACIÓN EN LA BASE DE DATOS"
echo "=========================================="
echo "Ejecuta este comando SQL para ver el estado actual:"
echo ""
echo "mysql -u soop_mail -p soop_mail_db -e \"SELECT date, sent_count, received_count FROM email_traffic ORDER BY date DESC LIMIT 5;\""
echo ""

echo "=========================================="
echo "SIGUIENTE PASO"
echo "=========================================="
echo "1. Reinicia la aplicación:"
echo "   sudo systemctl restart soop_mail"
echo ""
echo "2. Llama al endpoint de sincronización:"
echo "   curl -X GET 'http://localhost:8000/api/mail/traffic' -H 'Authorization: Bearer TU_TOKEN'"
echo ""
echo "3. Verifica los logs de la aplicación:"
echo "   sudo journalctl -u soop_mail -n 50 | grep 'DEBUG SYNC'"
echo ""
