# Descargar y dar permisos
cd /usr/local/bin
nano manage-soop-mail-users.sh
# Pega el contenido del artifact

chmod +x manage-soop-mail-users.sh

#!/bin/bash
#
# Script para gestionar usuarios de soop MAIL con passwd-file
# Uso: ./manage-soop-mail-users.sh [crear|cambiar|eliminar|listar]
#

USERS_FILE="/etc/soop_mail/users"
MAIL_BASE="/var/mail/soop_mail"
VMAIL_UID=5000
VMAIL_GID=5000

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que se ejecuta como root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: Este script debe ejecutarse como root${NC}"
   exit 1
fi

# Función para mostrar el menú
mostrar_menu() {
    echo "================================"
    echo "  Gestor de Usuarios soop MAIL"
    echo "================================"
    echo "1) Crear usuario"
    echo "2) Cambiar contraseña"
    echo "3) Eliminar usuario"
    echo "4) Listar usuarios"
    echo "5) Salir"
    echo "================================"
}

# Función para crear usuario
crear_usuario() {
    echo -e "${GREEN}=== Crear Nuevo Usuario ===${NC}"
    
    read -p "Email del usuario: " email
    
    # Validar formato de email
    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        echo -e "${RED}Error: Formato de email inválido${NC}"
        return 1
    fi
    
    # Verificar si el usuario ya existe
    if grep -q "^${email}:" "$USERS_FILE" 2>/dev/null; then
        echo -e "${RED}Error: El usuario ${email} ya existe${NC}"
        return 1
    fi
    
    # Solicitar contraseña
    read -s -p "Contraseña: " password
    echo
    read -s -p "Confirmar contraseña: " password2
    echo
    
    if [ "$password" != "$password2" ]; then
        echo -e "${RED}Error: Las contraseñas no coinciden${NC}"
        return 1
    fi
    
    if [ -z "$password" ]; then
        echo -e "${RED}Error: La contraseña no puede estar vacía${NC}"
        return 1
    fi
    
    # Generar hash de la contraseña
    echo -e "${YELLOW}Generando hash de contraseña...${NC}"
    hash=$(soop-mailtool pw -s SHA512-CRYPT -p "$password")
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error al generar el hash de la contraseña${NC}"
        return 1
    fi
    
    # Extraer dominio del email
    domain=$(echo "$email" | cut -d@ -f2)
    username=$(echo "$email" | cut -d@ -f1)
    
    # Crear directorio de correo
    mail_dir="${MAIL_BASE}/${domain}/${username}"
    echo -e "${YELLOW}Creando directorio de correo: ${mail_dir}${NC}"
    mkdir -p "$mail_dir"
    chown -R vmail:vmail "${MAIL_BASE}/${domain}"
    chmod -R 770 "${MAIL_BASE}/${domain}"
    
    # Agregar usuario al archivo
    echo "${email}:${hash}:${VMAIL_UID}:${VMAIL_GID}::${mail_dir}::" >> "$USERS_FILE"
    
    # Ajustar permisos del archivo de usuarios
    chmod 644 "$USERS_FILE"
    chown root:soopmail "$USERS_FILE"
    
    echo -e "${GREEN}✓ Usuario ${email} creado exitosamente${NC}"
    
    # Reiniciar soop MAIL
    read -p "¿Desea reiniciar soop MAIL ahora? (s/n): " reiniciar
    if [[ "$reiniciar" =~ ^[Ss]$ ]]; then
        systemctl restart soop-mail
        echo -e "${GREEN}✓ soop MAIL reiniciado${NC}"
    fi
    
    # Probar autenticación
    read -p "¿Desea probar la autenticación? (s/n): " probar
    if [[ "$probar" =~ ^[Ss]$ ]]; then
        soop-mailtool auth test "$email" "$password"
    fi
}

# Función para cambiar contraseña
cambiar_password() {
    echo -e "${GREEN}=== Cambiar Contraseña ===${NC}"
    
    read -p "Email del usuario: " email
    
    # Verificar si el usuario existe
    if ! grep -q "^${email}:" "$USERS_FILE" 2>/dev/null; then
        echo -e "${RED}Error: El usuario ${email} no existe${NC}"
        return 1
    fi
    
    # Solicitar nueva contraseña
    read -s -p "Nueva contraseña: " password
    echo
    read -s -p "Confirmar contraseña: " password2
    echo
    
    if [ "$password" != "$password2" ]; then
        echo -e "${RED}Error: Las contraseñas no coinciden${NC}"
        return 1
    fi
    
    if [ -z "$password" ]; then
        echo -e "${RED}Error: La contraseña no puede estar vacía${NC}"
        return 1
    fi
    
    # Generar nuevo hash
    echo -e "${YELLOW}Generando nuevo hash de contraseña...${NC}"
    hash=$(doveadm pw -s SHA512-CRYPT -p "$password")
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error al generar el hash de la contraseña${NC}"
        return 1
    fi
    
    # Hacer backup del archivo
    cp "$USERS_FILE" "${USERS_FILE}.bak"
    
    # Obtener la línea actual del usuario
    old_line=$(grep "^${email}:" "$USERS_FILE")
    
    # Extraer campos (mantener uid, gid, home, etc.)
    IFS=':' read -ra fields <<< "$old_line"
    uid=${fields[2]:-$VMAIL_UID}
    gid=${fields[3]:-$VMAIL_GID}
    gecos=${fields[4]:-}
    home=${fields[5]:-}
    shell=${fields[6]:-}
    
    # Crear nueva línea con el nuevo hash
    new_line="${email}:${hash}:${uid}:${gid}:${gecos}:${home}:${shell}"
    
    # Reemplazar la línea en el archivo
    sed -i "s|^${email}:.*|${new_line}|" "$USERS_FILE"
    
    echo -e "${GREEN}✓ Contraseña cambiada exitosamente para ${email}${NC}"
    
    # Reiniciar soop MAIL
    read -p "¿Desea reiniciar soop MAIL ahora? (s/n): " reiniciar
    if [[ "$reiniciar" =~ ^[Ss]$ ]]; then
        systemctl restart soop-mail
        echo -e "${GREEN}✓ soop MAIL reiniciado${NC}"
    fi
    
    # Probar autenticación
    read -p "¿Desea probar la autenticación? (s/n): " probar
    if [[ "$probar" =~ ^[Ss]$ ]]; then
        doveadm auth test "$email" "$password"
    fi
}

# Función para eliminar usuario
eliminar_usuario() {
    echo -e "${YELLOW}=== Eliminar Usuario ===${NC}"
    
    read -p "Email del usuario: " email
    
    # Verificar si el usuario existe
    if ! grep -q "^${email}:" "$USERS_FILE" 2>/dev/null; then
        echo -e "${RED}Error: El usuario ${email} no existe${NC}"
        return 1
    fi
    
    # Mostrar información del usuario
    echo -e "${YELLOW}Usuario encontrado:${NC}"
    grep "^${email}:" "$USERS_FILE"
    
    # Confirmar eliminación
    read -p "¿Está seguro que desea eliminar este usuario? (escriba 'SI' para confirmar): " confirmar
    
    if [ "$confirmar" != "SI" ]; then
        echo -e "${YELLOW}Operación cancelada${NC}"
        return 0
    fi
    
    # Hacer backup
    cp "$USERS_FILE" "${USERS_FILE}.bak"
    
    # Eliminar del archivo
    sed -i "/^${email}:/d" "$USERS_FILE"
    
    echo -e "${GREEN}✓ Usuario ${email} eliminado del archivo de usuarios${NC}"
    
    # Preguntar si desea eliminar el directorio de correo
    domain=$(echo "$email" | cut -d@ -f2)
    username=$(echo "$email" | cut -d@ -f1)
    mail_dir="${MAIL_BASE}/${domain}/${username}"
    
    if [ -d "$mail_dir" ]; then
        read -p "¿Desea eliminar también el directorio de correo ${mail_dir}? (s/n): " eliminar_dir
        if [[ "$eliminar_dir" =~ ^[Ss]$ ]]; then
            rm -rf "$mail_dir"
            echo -e "${GREEN}✓ Directorio de correo eliminado${NC}"
        fi
    fi
    
    # Reiniciar soop MAIL
    read -p "¿Desea reiniciar soop MAIL ahora? (s/n): " reiniciar
    if [[ "$reiniciar" =~ ^[Ss]$ ]]; then
        systemctl restart soop-mail
        echo -e "${GREEN}✓ soop MAIL reiniciado${NC}"
    fi
}

# Función para listar usuarios
listar_usuarios() {
    echo -e "${GREEN}=== Lista de Usuarios ===${NC}"
    
    if [ ! -f "$USERS_FILE" ]; then
        echo -e "${YELLOW}No hay usuarios configurados${NC}"
        return 0
    fi
    
    echo -e "\n${YELLOW}Email${NC}\t\t\t\t${YELLOW}UID${NC}\t${YELLOW}GID${NC}\t${YELLOW}Directorio${NC}"
    echo "--------------------------------------------------------------------------------"
    
    while IFS=':' read -r email hash uid gid gecos home shell; do
        printf "%-40s\t%s\t%s\t%s\n" "$email" "$uid" "$gid" "$home"
    done < "$USERS_FILE"
    
    echo ""
    echo -e "${GREEN}Total de usuarios: $(wc -l < "$USERS_FILE")${NC}"
}

# Crear archivo de usuarios si no existe
if [ ! -f "$USERS_FILE" ]; then
    touch "$USERS_FILE"
    chmod 644 "$USERS_FILE"
    chown root:soopmail "$USERS_FILE"
fi

# Menú principal
while true; do
    echo ""
    mostrar_menu
    read -p "Seleccione una opción: " opcion
    
    case $opcion in
        1)
            crear_usuario
            ;;
        2)
            cambiar_password
            ;;
        3)
            eliminar_usuario
            ;;
        4)
            listar_usuarios
            ;;
        5)
            echo -e "${GREEN}¡Hasta luego!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Opción inválida${NC}"
            ;;
    esac
    
    read -p "Presione Enter para continuar..."
done


# Ejecutar el script
sudo /usr/local/bin/manage-soop-mail-users.sh