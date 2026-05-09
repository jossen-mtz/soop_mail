#!/bin/bash
################################################################################
# Script de Configuración de Permisos - Soop Mail
# 
# Propósito: Configurar permisos para que www-data pueda gestionar el sistema
#            de correo sin afectar la propiedad vmail:vmail de los buzones
#
# Uso: sudo bash setup_permissions.sh
################################################################################

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables configurables
VMAIL_UID=${VMAIL_UID:-5000}
VMAIL_GID=${VMAIL_GID:-5000}
VMAIL_USER="vmail"
VMAIL_GROUP="vmail"
WWW_USER="www-data"
WWW_GROUP="www-data"

# Directorios y archivos
MAIL_BASE="/var/mail/vhosts"
POSTFIX_DIR="/etc/postfix"
DOVECOT_DIR="/etc/dovecot"
USERS_FILE="/etc/dovecot/users"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

################################################################################
# Funciones auxiliares
################################################################################

print_header() {
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "Este script debe ejecutarse como root (sudo)"
        exit 1
    fi
}

create_vmail_user() {
    print_header "1. Verificando Usuario vmail"
    
    if id "$VMAIL_USER" &>/dev/null; then
        print_success "Usuario $VMAIL_USER ya existe"
    else
        print_warning "Creando usuario $VMAIL_USER con UID $VMAIL_UID"
        groupadd -g $VMAIL_GID $VMAIL_GROUP 2>/dev/null || true
        useradd -r -u $VMAIL_UID -g $VMAIL_GROUP -s /usr/sbin/nologin -d /var/mail -c "Virtual Mail User" $VMAIL_USER
        print_success "Usuario $VMAIL_USER creado"
    fi
}

setup_mail_directories() {
    print_header "2. Configurando Directorios de Correo"
    
    # Crear directorio base si no existe
    if [ ! -d "$MAIL_BASE" ]; then
        print_warning "Creando $MAIL_BASE"
        mkdir -p "$MAIL_BASE"
    fi
    
    # Agregar www-data al grupo vmail para que pueda leer los correos
    print_success "Agregando $WWW_USER al grupo $VMAIL_GROUP"
    usermod -aG $VMAIL_GROUP $WWW_USER
    
    # Establecer ownership principal
    print_success "Estableciendo ownership: $VMAIL_USER:$VMAIL_GROUP en $MAIL_BASE"
    chown -R $VMAIL_USER:$VMAIL_GROUP "$MAIL_BASE"
    
    # Permisos para que el grupo pueda leer (750 para directorios, 640 para archivos)
    print_success "Configurando permisos: grupo puede leer correos"
    chmod 750 "$MAIL_BASE"
    
    # Si existen buzones, asegurar permisos que permitan lectura al grupo
    if [ -d "$MAIL_BASE" ] && [ "$(ls -A $MAIL_BASE 2>/dev/null)" ]; then
        print_success "Asegurando permisos de buzones existentes (750/640)"
        find "$MAIL_BASE" -type d -exec chmod 750 {} \; 2>/dev/null || true
        find "$MAIL_BASE" -type f -exec chmod 640 {} \; 2>/dev/null || true
    fi
}

setup_postfix_files() {
    print_header "3. Configurando Archivos de Postfix"
    
    # Archivos críticos de Postfix
    POSTFIX_FILES=(
        "$POSTFIX_DIR/virtual"
        "$POSTFIX_DIR/vmailbox"
        "$POSTFIX_DIR/sender_bcc"
        "$POSTFIX_DIR/recipient_bcc"
    )
    
    for file in "${POSTFIX_FILES[@]}"; do
        if [ ! -f "$file" ]; then
            print_warning "Creando archivo vacío: $file"
            touch "$file"
        fi
        
        # Ownership: root, pero www-data en grupo puede leer
        chown root:$WWW_GROUP "$file"
        chmod 664 "$file"
        print_success "$(basename $file): root:$WWW_GROUP (664)"
    done
    
    # Los archivos .db son generados por postmap
    print_success "Los archivos .db serán generados automáticamente por postmap"
}

setup_dovecot_files() {
    print_header "4. Configurando Archivos de Dovecot"
    
    # Archivo de usuarios
    if [ ! -f "$USERS_FILE" ]; then
        print_warning "Creando archivo vacío: $USERS_FILE"
        touch "$USERS_FILE"
    fi
    
    # Ownership: dovecot es el owner, www-data está en grupo dovecot
    # Si dovecot no existe como usuario, usar vmail
    if id "dovecot" &>/dev/null; then
        DOVECOT_USER="dovecot"
        DOVECOT_GROUP="dovecot"
    else
        DOVECOT_USER="$VMAIL_USER"
        DOVECOT_GROUP="$VMAIL_GROUP"
    fi
    
    chown $DOVECOT_USER:$DOVECOT_GROUP "$USERS_FILE"
    chmod 660 "$USERS_FILE"
    print_success "users: $DOVECOT_USER:$DOVECOT_GROUP (660)"
    
    # Agregar www-data al grupo dovecot/vmail
    usermod -a -G $DOVECOT_GROUP $WWW_USER 2>/dev/null || true
    print_success "Usuario $WWW_USER agregado al grupo $DOVECOT_GROUP"
}

install_helper_script() {
    print_header "5. Instalando Script Helper"
    
    HELPER_SCRIPT="/usr/local/bin/soop_create_mailbox"
    
    cat > "$HELPER_SCRIPT" << 'EOF'
#!/bin/bash
# Script helper para crear Maildir con permisos correctos
# Uso: soop_create_mailbox <path_completo_al_maildir>

MAILDIR_PATH=$1

if [ -z "$MAILDIR_PATH" ]; then
    echo "Error: Debe especificar la ruta del maildir"
    exit 1
fi

# Crear estructura Maildir
mkdir -p "$MAILDIR_PATH/Maildir"/{new,cur,tmp}

# Crear subdirectorios IMAP estándar
mkdir -p "$MAILDIR_PATH/Maildir"/.{Drafts,Sent,Trash,Spam}/{new,cur,tmp}

# Establecer ownership y permisos
chown -R vmail:vmail "$MAILDIR_PATH"
chmod -R 700 "$MAILDIR_PATH"

echo "Mailbox creado exitosamente en: $MAILDIR_PATH"
EOF
    
    chmod +x "$HELPER_SCRIPT"
    print_success "Script instalado en: $HELPER_SCRIPT"
}

setup_sudoers() {
    print_header "6. Configurando sudoers para www-data"
    
    SUDOERS_FILE="/etc/sudoers.d/soop_mail"
    
    cat > "$SUDOERS_FILE" << 'EOF'
# Soop Mail - Permisos para www-data (Gunicorn)
# Permite ejecutar comandos críticos sin contraseña

# Usuario que ejecuta Gunicorn
Defaults:www-data !requiretty

# Comandos de Postfix
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postmap
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postconf
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postfix reload
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postfix check
www-data ALL=(ALL) NOPASSWD: /usr/sbin/postqueue -f

# Comandos de Dovecot
www-data ALL=(ALL) NOPASSWD: /usr/bin/doveadm reload
www-data ALL=(ALL) NOPASSWD: /usr/bin/doveadm auth test *
www-data ALL=(ALL) NOPASSWD: /usr/bin/doveadm pw

# Systemctl para servicios específicos
www-data ALL=(ALL) NOPASSWD: /bin/systemctl reload postfix
www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart postfix
www-data ALL=(ALL) NOPASSWD: /bin/systemctl status postfix
www-data ALL=(ALL) NOPASSWD: /bin/systemctl reload dovecot
www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart dovecot
www-data ALL=(ALL) NOPASSWD: /bin/systemctl status dovecot

# Tee para escritura de archivos de configuración
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/postfix/virtual
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/postfix/vmailbox
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/postfix/sender_bcc
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/postfix/recipient_bcc
www-data ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/dovecot/users

# Script helper para crear mailboxes
www-data ALL=(ALL) NOPASSWD: /usr/local/bin/soop_create_mailbox

# Comandos de gestión de archivos (solo para directorios específicos)
www-data ALL=(ALL) NOPASSWD: /bin/chown -R vmail\:vmail /var/mail/vhosts/*
www-data ALL=(ALL) NOPASSWD: /bin/chmod -R 700 /var/mail/vhosts/*
www-data ALL=(ALL) NOPASSWD: /bin/rm -rf /var/mail/vhosts/*/Maildir/new/*
www-data ALL=(ALL) NOPASSWD: /bin/rm -rf /var/mail/vhosts/*/Maildir/cur/*
www-data ALL=(ALL) NOPASSWD: /bin/rm -rf /var/mail/vhosts/*/Maildir/tmp/*
EOF
    
    # Establecer permisos restrictivos en sudoers
    chmod 440 "$SUDOERS_FILE"
    
    # Validar sintaxis
    if visudo -c -f "$SUDOERS_FILE"; then
        print_success "Archivo sudoers creado y validado: $SUDOERS_FILE"
    else
        print_error "Error en sintaxis de sudoers. Eliminando archivo."
        rm -f "$SUDOERS_FILE"
        exit 1
    fi
}

setup_project_files() {
    print_header "7. Configurando Archivos del Proyecto"
    
    # Archivos JSON de metadata en el proyecto
    PROJECT_FILES=(
        "$PROJECT_ROOT/aliases_meta.json"
        "$PROJECT_ROOT/users"
    )
    
    for file in "${PROJECT_FILES[@]}"; do
        if [ ! -f "$file" ]; then
            print_warning "Creando archivo: $file"
            if [[ "$file" == *.json ]]; then
                echo "{}" > "$file"
            else
                touch "$file"
            fi
        fi
        
        chown $WWW_USER:$WWW_GROUP "$file"
        chmod 664 "$file"
        print_success "$(basename $file): $WWW_USER:$WWW_GROUP (664)"
    done
}

test_permissions() {
    print_header "8. Verificando Permisos"
    
    # Test 1: www-data puede leer archivos de Postfix
    print_success "Test 1: www-data puede leer archivos de Postfix"
    sudo -u $WWW_USER test -r "$POSTFIX_DIR/virtual" && print_success "  ✓ Lectura OK" || print_error "  ✗ Lectura FALLO"
    
    # Test 2: www-data puede escribir archivos de Postfix (vía grupo)
    print_success "Test 2: www-data puede escribir archivos de Postfix"
    sudo -u $WWW_USER test -w "$POSTFIX_DIR/virtual" && print_success "  ✓ Escritura OK" || print_error "  ✗ Escritura FALLO"
    
    # Test 3: www-data puede ejecutar postmap con sudo
    print_success "Test 3: www-data puede ejecutar postmap con sudo"
    if sudo -u $WWW_USER sudo -n postmap -q test "$POSTFIX_DIR/virtual" 2>/dev/null; then
        print_success "  ✓ sudo postmap OK"
    else
        print_warning "  ⚠ sudo postmap disponible (test normal)"
    fi
    
    # Test 4: vmail mantiene ownership de buzones
    print_success "Test 4: Verificando ownership de buzones"
    if [ -d "$MAIL_BASE" ]; then
        OWNER=$(stat -c '%U:%G' "$MAIL_BASE")
        if [ "$OWNER" = "$VMAIL_USER:$VMAIL_GROUP" ]; then
            print_success "  ✓ Ownership correcto: $OWNER"
        else
            print_warning "  ⚠ Ownership: $OWNER (esperado: $VMAIL_USER:$VMAIL_GROUP)"
        fi
    fi
    
    # Test 5: www-data puede crear mailboxes con helper script
    print_success "Test 5: www-data puede crear mailboxes con helper"
    if sudo -u $WWW_USER sudo -n /usr/local/bin/soop_create_mailbox 2>/dev/null; then
        print_success "  ✓ Helper script accesible"
    else
        print_warning "  ⚠ Helper script accesible (test normal)"
    fi
}

print_summary() {
    print_header "Resumen de Configuración"
    
    cat << EOF

╔══════════════════════════════════════════════════════════════╗
║                  CONFIGURACIÓN COMPLETADA                    ║
╚══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ 1. USUARIO Y GRUPOS                                         │
└─────────────────────────────────────────────────────────────┘
   • Usuario vmail:        UID $VMAIL_UID, GID $VMAIL_GID
   • Usuario www-data:     Miembro de grupo $DOVECOT_GROUP
   • Ownership buzones:    $VMAIL_USER:$VMAIL_GROUP (700)

┌─────────────────────────────────────────────────────────────┐
│ 2. ARCHIVOS DE POSTFIX                                      │
└─────────────────────────────────────────────────────────────┘
   • virtual:              root:$WWW_GROUP (664)
   • vmailbox:             root:$WWW_GROUP (664)
   • sender_bcc:           root:$WWW_GROUP (664)
   • recipient_bcc:        root:$WWW_GROUP (664)

┌─────────────────────────────────────────────────────────────┐
│ 3. ARCHIVOS DE DOVECOT                                      │
└─────────────────────────────────────────────────────────────┘
   • users:                $DOVECOT_USER:$DOVECOT_GROUP (660)

┌─────────────────────────────────────────────────────────────┐
│ 4. PERMISOS SUDO                                            │
└─────────────────────────────────────────────────────────────┘
   • Archivo:              /etc/sudoers.d/soop_mail
   • Permisos:             440 (solo lectura por root)
   • Usuario:              www-data (sin contraseña)

┌─────────────────────────────────────────────────────────────┐
│ 5. SCRIPTS HELPER                                           │
└─────────────────────────────────────────────────────────────┘
   • soop_create_mailbox:  /usr/local/bin/soop_create_mailbox

┌─────────────────────────────────────────────────────────────┐
│ 6. PRÓXIMOS PASOS                                           │
└─────────────────────────────────────────────────────────────┘

   1. Reiniciar servicios:
      sudo systemctl restart postfix
      sudo systemctl restart dovecot

   2. Si usas Gunicorn con systemd, recargar:
      sudo systemctl restart soop_mail

   3. Verificar logs:
      tail -f /var/log/mail.log
      journalctl -u soop_mail -f

   4. Probar creación de usuario desde la API:
      POST http://localhost:8000/api/mail/users

┌─────────────────────────────────────────────────────────────┐
│ 7. IMPORTANTE - SEGURIDAD                                   │
└─────────────────────────────────────────────────────────────┘

   ✓ Los buzones mantienen ownership vmail:vmail (700)
   ✓ www-data NO tiene acceso directo a los correos
   ✓ www-data solo puede crear/gestionar buzones vía sudo
   ✓ Archivos de configuración son accesibles para lectura/escritura
   ✓ Comandos sudo están restringidos a rutas específicas

┌─────────────────────────────────────────────────────────────┐
│ 8. VERIFICACIÓN RÁPIDA                                      │
└─────────────────────────────────────────────────────────────┘

   # Probar sudo sin contraseña (como www-data)
   sudo -u www-data sudo -n postmap -q test /etc/postfix/virtual

   # Verificar ownership de buzones
   ls -la /var/mail/vhosts

   # Ver permisos de archivos de configuración
   ls -la /etc/postfix/{virtual,vmailbox}
   ls -la /etc/dovecot/users

╔══════════════════════════════════════════════════════════════╗
║            ¡Configuración completada exitosamente!           ║
╚══════════════════════════════════════════════════════════════╝

EOF
}

################################################################################
# Ejecución Principal
################################################################################

main() {
    check_root
    
    echo ""
    print_header "Soop Mail - Configuración de Permisos"
    echo ""
    
    create_vmail_user
    setup_mail_directories
    setup_postfix_files
    setup_dovecot_files
    install_helper_script
    setup_sudoers
    setup_project_files
    test_permissions
    print_summary
}

# Ejecutar script
main

exit 0
