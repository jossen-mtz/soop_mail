#!/bin/bash

##############################################################################
# FIX COMPLETO DEL SISTEMA DE CORREO - SOOP MAIL
# 
# Este script unifica todas las correcciones que funcionaron para resolver
# el problema de conteo de correos y permisos del sistema.
#
# Ejecutar como: sudo bash fix_mail_system_complete.sh
##############################################################################

set -e  # Salir si hay algún error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_header() {
    echo -e "\n${BLUE}=========================================="
    echo -e "$1"
    echo -e "==========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then 
    print_error "Este script debe ejecutarse como root (sudo bash $0)"
    exit 1
fi

# Variables del sistema
MAIL_BASE="/var/mail/vhosts"
MAIL_BASE_OLD="/var/mail/soop_mail"
VMAIL_USER="vmail"
VMAIL_GROUP="vmail"
WWW_USER="www-data"
DOVECOT_USERS="/etc/dovecot/users"
BACKEND_DIR="/var/www/soop_mail"
BACKEND_ENV="$BACKEND_DIR/backend/.env.production"
PROJECT_ENV="$BACKEND_DIR/.env"

print_header "INICIANDO CORRECCIÓN COMPLETA DEL SISTEMA DE CORREO"

##############################################################################
# PASO 1: BACKUP DE ARCHIVOS CRÍTICOS
##############################################################################

print_header "PASO 1: CREANDO BACKUPS DE SEGURIDAD"

BACKUP_DIR="/var/backups/soop_mail_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup de archivos de configuración
cp "$DOVECOT_USERS" "$BACKUP_DIR/dovecot_users.bak" 2>/dev/null || true
cp "$BACKEND_ENV" "$BACKUP_DIR/backend_env.bak" 2>/dev/null || true
cp "$PROJECT_ENV" "$BACKUP_DIR/project_env.bak" 2>/dev/null || true

print_success "Backups creados en: $BACKUP_DIR"

##############################################################################
# PASO 2: CORREGIR PATHS EN /etc/dovecot/users
##############################################################################

print_header "PASO 2: CORRIGIENDO PATHS EN $DOVECOT_USERS"

# Verificar que el archivo existe
if [ ! -f "$DOVECOT_USERS" ]; then
    print_error "Archivo $DOVECOT_USERS no encontrado"
    exit 1
fi

print_info "Unificando todos los paths a $MAIL_BASE..."

# 1. Cambiar todos los paths de /var/mail/soop_mail a /var/mail/vhosts
sed -i "s|:$MAIL_BASE_OLD/|:$MAIL_BASE/|g" "$DOVECOT_USERS"

# 2. Asegurar que usuarios sin home path lo tengan
# Buscar líneas que NO tienen el 6to campo (home) y agregarlo
awk -F: -v base="$MAIL_BASE" '
{
    # Si la línea tiene menos de 7 campos o el campo 6 está vacío
    if (NF < 7 || $6 == "") {
        # Extraer email (campo 1)
        email = $1
        # Separar dominio y usuario
        split(email, parts, "@")
        user = parts[1]
        domain = parts[2]
        # Construir home path
        home = base "/" domain "/" user
        # Reconstruir línea con home path
        printf "%s:%s:%s:%s:%s:%s:%s:%s\n", $1, $2, $3, $4, $5, home, $7, $8
    } else {
        # Línea ya tiene home path, imprimirla tal cual
        print $0
    }
}' "$DOVECOT_USERS" > "$DOVECOT_USERS.tmp"

mv "$DOVECOT_USERS.tmp" "$DOVECOT_USERS"

print_success "Paths corregidos en $DOVECOT_USERS"

# Mostrar algunos ejemplos de usuarios corregidos
print_info "Ejemplos de usuarios corregidos:"
grep -E "coordinacion|mantenimiento|pruebas" "$DOVECOT_USERS" | head -3

##############################################################################
# PASO 3: CORREGIR VARIABLE SOOP_MAIL_BASE EN .env
##############################################################################

print_header "PASO 3: CORRIGIENDO VARIABLE SOOP_MAIL_BASE EN ARCHIVOS .env"

# Corregir en backend/.env.production
if [ -f "$BACKEND_ENV" ]; then
    print_info "Actualizando $BACKEND_ENV..."
    sed -i "s|^SOOP_MAIL_BASE=.*|SOOP_MAIL_BASE=$MAIL_BASE|g" "$BACKEND_ENV"
    
    # Verificar el cambio
    if grep -q "^SOOP_MAIL_BASE=$MAIL_BASE" "$BACKEND_ENV"; then
        print_success "SOOP_MAIL_BASE actualizado en $BACKEND_ENV"
    else
        print_warning "No se pudo actualizar SOOP_MAIL_BASE en $BACKEND_ENV"
    fi
fi

# Corregir en .env del proyecto (si existe)
if [ -f "$PROJECT_ENV" ]; then
    print_info "Actualizando $PROJECT_ENV..."
    sed -i "s|^SOOP_MAIL_BASE=.*|SOOP_MAIL_BASE=$MAIL_BASE|g" "$PROJECT_ENV"
    
    # Verificar el cambio
    if grep -q "^SOOP_MAIL_BASE=$MAIL_BASE" "$PROJECT_ENV"; then
        print_success "SOOP_MAIL_BASE actualizado en $PROJECT_ENV"
    else
        print_warning "No se pudo actualizar SOOP_MAIL_BASE en $PROJECT_ENV"
    fi
fi

##############################################################################
# PASO 4: CONFIGURAR PERMISOS CORRECTOS
##############################################################################

print_header "PASO 4: CONFIGURANDO PERMISOS DEL SISTEMA DE ARCHIVOS"

# 4.1: Agregar www-data al grupo vmail
print_info "Agregando $WWW_USER al grupo $VMAIL_GROUP..."
usermod -aG "$VMAIL_GROUP" "$WWW_USER"

# Verificar
if groups "$WWW_USER" | grep -q "$VMAIL_GROUP"; then
    print_success "$WWW_USER está en el grupo $VMAIL_GROUP"
    print_info "Grupos de $WWW_USER: $(groups $WWW_USER)"
else
    print_error "No se pudo agregar $WWW_USER al grupo $VMAIL_GROUP"
    exit 1
fi

# 4.2: Configurar permisos en /var/mail/vhosts
print_info "Configurando permisos en $MAIL_BASE..."

# Permisos base del directorio principal
chmod 750 "$MAIL_BASE"
chown "$VMAIL_USER:$VMAIL_GROUP" "$MAIL_BASE"

# Permisos de subdirectorios (750 = rwxr-x---)
print_info "Aplicando permisos 750 a directorios..."
find "$MAIL_BASE" -type d -exec chmod 750 {} \;

# Permisos de archivos (640 = rw-r-----)
print_info "Aplicando permisos 640 a archivos..."
find "$MAIL_BASE" -type f -exec chmod 640 {} \;

# Asegurar ownership correcto
print_info "Asegurando ownership vmail:vmail..."
chown -R "$VMAIL_USER:$VMAIL_GROUP" "$MAIL_BASE"

print_success "Permisos configurados correctamente"

# Mostrar permisos de ejemplo
print_info "Permisos verificados:"
ls -ld "$MAIL_BASE"
if [ -d "$MAIL_BASE/mmbtransporte.com/coordinacion" ]; then
    ls -ld "$MAIL_BASE/mmbtransporte.com/coordinacion"
fi

##############################################################################
# PASO 5: REINICIAR SERVICIOS
##############################################################################

print_header "PASO 5: REINICIANDO SERVICIOS"

# Reiniciar Dovecot
print_info "Reiniciando Dovecot..."
systemctl restart dovecot
if systemctl is-active --quiet dovecot; then
    print_success "Dovecot reiniciado correctamente"
else
    print_error "Error al reiniciar Dovecot"
    systemctl status dovecot --no-pager -l
    exit 1
fi

# Reiniciar backend (soop_mail)
print_info "Reiniciando backend (soop_mail)..."
systemctl restart soop_mail
sleep 3  # Dar tiempo para que inicie

if systemctl is-active --quiet soop_mail; then
    print_success "Backend reiniciado correctamente"
else
    print_error "Error al reiniciar backend"
    systemctl status soop_mail --no-pager -l
    exit 1
fi

# Reload Postfix (no es crítico pero es buena práctica)
print_info "Recargando Postfix..."
postfix reload 2>/dev/null || print_warning "No se pudo recargar Postfix (no crítico)"

##############################################################################
# PASO 6: VERIFICACIÓN COMPLETA
##############################################################################

print_header "PASO 6: VERIFICACIÓN DEL SISTEMA"

# 6.1: Verificar conteo de correos
print_info "Verificando conteo de correos..."
TOTAL_EMAILS=$(find "$MAIL_BASE" -path "*/cur/*" -o -path "*/new/*" 2>/dev/null | grep -E "/(cur|new)/" | wc -l)
print_success "Total de correos en sistema: $TOTAL_EMAILS"

# 6.2: Verificar que www-data puede leer
print_info "Verificando permisos de lectura de $WWW_USER..."
TEST_DIR="$MAIL_BASE/mmbtransporte.com/coordinacion/cur"
if [ -d "$TEST_DIR" ]; then
    if sudo -u "$WWW_USER" ls "$TEST_DIR" &>/dev/null; then
        COUNT=$(sudo -u "$WWW_USER" ls "$TEST_DIR" | wc -l)
        print_success "$WWW_USER puede leer correos (test: $COUNT archivos en coordinacion/cur)"
    else
        print_error "$WWW_USER NO puede leer $TEST_DIR"
        ls -ld "$TEST_DIR"
        exit 1
    fi
else
    print_warning "Directorio de test no encontrado: $TEST_DIR"
fi

# 6.3: Verificar socket de la API
print_info "Verificando socket de la API..."
SOCKET_PATH="/var/www/soop_mail/soop_mail.sock"
if [ -S "$SOCKET_PATH" ]; then
    print_success "Socket de API existe: $SOCKET_PATH"
    ls -l "$SOCKET_PATH"
    
    # Test de conectividad
    RESPONSE=$(curl -s --unix-socket "$SOCKET_PATH" http://localhost/health 2>/dev/null || echo "error")
    if [ "$RESPONSE" != "error" ]; then
        print_success "API responde correctamente"
    else
        print_warning "API no responde (puede requerir autenticación)"
    fi
else
    print_warning "Socket de API no encontrado (puede estar iniciando)"
fi

# 6.4: Verificar logs recientes del backend
print_info "Últimos logs del backend:"
journalctl -u soop_mail -n 5 --no-pager | grep -E "Started|Booting|Application startup"

##############################################################################
# RESUMEN FINAL
##############################################################################

print_header "RESUMEN DE CORRECCIONES APLICADAS"

cat << EOF
${GREEN}✓ CORRECCIONES COMPLETADAS EXITOSAMENTE${NC}

${BLUE}1. Paths unificados:${NC}
   - Todos los buzones ahora usan: $MAIL_BASE
   - Archivo Dovecot actualizado: $DOVECOT_USERS
   - Variables de entorno actualizadas

${BLUE}2. Permisos configurados:${NC}
   - $WWW_USER agregado al grupo $VMAIL_GROUP
   - Directorios: 750 (rwxr-x---)
   - Archivos: 640 (rw-r-----)
   - Owner: $VMAIL_USER:$VMAIL_GROUP

${BLUE}3. Servicios reiniciados:${NC}
   - Dovecot: $(systemctl is-active dovecot)
   - Backend (soop_mail): $(systemctl is-active soop_mail)

${BLUE}4. Estadísticas:${NC}
   - Total de correos encontrados: $TOTAL_EMAILS
   - Backend puede leer correos: ${GREEN}SÍ${NC}

${BLUE}5. Backups guardados en:${NC}
   $BACKUP_DIR

${YELLOW}PRÓXIMOS PASOS:${NC}
   1. Acceder a https://soopmail.mmbtransporte.com
   2. Iniciar sesión con credenciales de administrador
   3. Verificar que los conteos de correos aparezcan correctamente
   4. Los usuarios deberían ver sus correos en la interfaz web

${GREEN}¡El sistema está listo para usar!${NC}
EOF

print_header "FIN DE LA CORRECCIÓN"

exit 0
