#!/bin/bash

# Script para configurar automáticamente el servicio systemd de soop MAIL
# Debe ejecutarse con privilegios de root (sudo)

PROJECT_DIR="/var/www/soop_mail"
SERVICE_NAME="soop_mail"
USER="www-data"
GROUP="www-data"

echo "==========================================="
echo "  Configurando servicio: $SERVICE_NAME"
echo "==========================================="

# 1. Asegurar que existan los archivos de inicialización de Python
echo "[1/4] Verificando estructura de archivos..."
touch "$PROJECT_DIR/backend/__init__.py"

# 2. Crear el archivo de servicio
echo "[2/4] Creando archivo /etc/systemd/system/$SERVICE_NAME.service..."
cat <<EOF > /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=Gunicorn instance to serve soop MAIL (FastAPI)
After=network.target mysql.service mariadb.service
Wants=mysql.service mariadb.service

[Service]
User=$USER
Group=$GROUP
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="PYTHONPATH=$PROJECT_DIR:$PROJECT_DIR/backend"
Environment="APP_ENV=prod"

ExecStart=$PROJECT_DIR/venv/bin/python -m gunicorn \\
    --workers 3 \\
    --worker-class uvicorn.workers.UvicornWorker \\
    --bind unix:$PROJECT_DIR/soop_mail.sock \\
    --access-logfile - \\
    --error-logfile - \\
    run:app

[Install]
WantedBy=multi-user.target
EOF

# 3. Instalar dependencias críticas en el venv
echo "[3/4] Asegurando uvicorn y gunicorn en el entorno virtual..."
if [ -f "$PROJECT_DIR/venv/bin/pip" ]; then
    "$PROJECT_DIR/venv/bin/pip" install uvicorn gunicorn
else
    echo "Error: No se encontró el entorno virtual en $PROJECT_DIR/venv"
    exit 1
fi

# 4. Recargar y Activar
echo "[4/4] Reiniciando systemd y el servicio..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo "-------------------------------------------"
echo "Estado actual del servicio:"
systemctl status $SERVICE_NAME
echo "==========================================="
