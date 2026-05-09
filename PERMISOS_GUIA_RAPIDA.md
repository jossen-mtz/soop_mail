# Guía Rápida de Permisos - Soop Mail

## Instalación Rápida

```bash
# 1. Dar permisos de ejecución al script
chmod +x setup_permissions.sh

# 2. Ejecutar como root
sudo bash setup_permissions.sh
```

## ¿Qué hace el script?

### 1. **Usuario vmail** (UID 5000, GID 5000)
- Crea el usuario `vmail` si no existe
- Este usuario es el propietario de todos los buzones de correo
- **IMPORTANTE**: Los buzones siempre pertenecen a `vmail:vmail` (700)

### 2. **Usuario www-data** (Gunicorn)
- Se agrega al grupo `dovecot` o `vmail`
- Puede leer/escribir archivos de configuración
- **NO** tiene acceso directo a los correos
- Usa `sudo` para operaciones privilegiadas

### 3. **Archivos de Postfix**
| Archivo | Owner | Permisos | Descripción |
|---------|-------|----------|-------------|
| `/etc/postfix/virtual` | root:www-data | 664 | Aliases y forwards |
| `/etc/postfix/vmailbox` | root:www-data | 664 | Buzones virtuales |
| `/etc/postfix/sender_bcc` | root:www-data | 664 | BCC de remitentes |
| `/etc/postfix/recipient_bcc` | root:www-data | 664 | BCC de destinatarios |

### 4. **Archivos de Dovecot**
| Archivo | Owner | Permisos | Descripción |
|---------|-------|----------|-------------|
| `/etc/dovecot/users` | dovecot:dovecot | 660 | Base de datos de usuarios |

### 5. **Directorios de Correo**
| Directorio | Owner | Permisos | Descripción |
|------------|-------|----------|-------------|
| `/var/mail/vhosts` | vmail:vmail | 755 | Directorio base |
| `/var/mail/vhosts/dominio.com/usuario` | vmail:vmail | 700 | Buzón de usuario |
| `Maildir/{new,cur,tmp}` | vmail:vmail | 700 | Estructura Maildir |

### 6. **Permisos sudo para www-data**

El script crea `/etc/sudoers.d/soop_mail` con estos permisos **SIN CONTRASEÑA**:

#### Comandos de Postfix:
- `postmap` - Generar archivos .db
- `postconf` - Consultar configuración
- `postfix reload` - Recargar configuración
- `postfix check` - Verificar configuración
- `postqueue -f` - Forzar envío de cola

#### Comandos de Dovecot:
- `doveadm reload` - Recargar configuración
- `doveadm auth test` - Probar autenticación
- `doveadm pw` - Generar hashes de contraseñas

#### Comandos de systemctl:
- `systemctl reload postfix`
- `systemctl restart postfix`
- `systemctl status postfix`
- `systemctl reload dovecot`
- `systemctl restart dovecot`
- `systemctl status dovecot`

#### Comando tee (para escribir archivos):
- `tee /etc/postfix/virtual`
- `tee /etc/postfix/vmailbox`
- `tee /etc/postfix/sender_bcc`
- `tee /etc/postfix/recipient_bcc`
- `tee /etc/dovecot/users`

#### Script helper:
- `/usr/local/bin/soop_create_mailbox` - Crear estructura Maildir

#### Comandos de gestión de archivos (solo en /var/mail/vhosts):
- `chown -R vmail:vmail /var/mail/vhosts/*`
- `chmod -R 700 /var/mail/vhosts/*`
- `rm -rf /var/mail/vhosts/*/Maildir/{new,cur,tmp}/*`

---

## Cómo Funciona en la Práctica

### Escenario 1: Crear Usuario de Correo

```python
# En backend/main.py - Endpoint POST /api/mail/users

# 1. www-data ejecuta soop_create_mailbox con sudo
subprocess.run(['sudo', '-n', '/usr/local/bin/soop_create_mailbox', 
                '/var/mail/vhosts/dominio.com/usuario'])
# ✓ Crea Maildir con ownership vmail:vmail (700)

# 2. www-data escribe el archivo users (tiene permiso de grupo)
with open('/etc/dovecot/users', 'a') as f:
    f.write('usuario@dominio.com:{SHA512-CRYPT}...')
# ✓ Escritura directa (dovecot:dovecot 660, www-data en grupo dovecot)

# 3. www-data recarga Dovecot con sudo
subprocess.run(['sudo', '-n', 'doveadm', 'reload'])
# ✓ Sin contraseña
```

### Escenario 2: Crear Alias

```python
# En backend/main.py - Endpoint POST /api/mail/aliases

# 1. www-data escribe el archivo virtual (tiene permiso de grupo)
with open('/etc/postfix/virtual', 'w') as f:
    f.write('alias@dominio.com    usuario@dominio.com\n')
# ✓ Escritura directa (root:www-data 664)

# 2. www-data genera el .db con postmap
subprocess.run(['sudo', '-n', 'postmap', '/etc/postfix/virtual'])
# ✓ Sin contraseña

# 3. www-data recarga Postfix
subprocess.run(['sudo', '-n', 'postfix', 'reload'])
# ✓ Sin contraseña
```

### Escenario 3: Cambiar Contraseña

```python
# En backend/main.py - Endpoint PUT /api/mail/users/{email}/password

# 1. www-data genera nuevo hash
result = subprocess.run(['sudo', '-n', 'doveadm', 'pw', '-s', 'SHA512-CRYPT', 
                        '-p', 'nueva_password'], capture_output=True)
new_hash = result.stdout.strip()

# 2. www-data lee y modifica users file
with open('/etc/dovecot/users', 'r') as f:
    lines = f.readlines()
# Modificar línea del usuario...
with open('/etc/dovecot/users', 'w') as f:
    f.writelines(lines)
# ✓ Escritura directa

# 3. www-data recarga Dovecot
subprocess.run(['sudo', '-n', 'doveadm', 'reload'])
```

---

## Verificación Post-Instalación

### 1. Verificar usuario vmail
```bash
id vmail
# Salida esperada: uid=5000(vmail) gid=5000(vmail) groups=5000(vmail)

ls -la /var/mail/vhosts
# Salida esperada: drwxr-xr-x vmail vmail
```

### 2. Verificar www-data en grupos
```bash
groups www-data
# Salida esperada: www-data dovecot (o vmail)
```

### 3. Verificar permisos de archivos
```bash
ls -la /etc/postfix/virtual
# Salida esperada: -rw-rw-r-- root www-data

ls -la /etc/dovecot/users
# Salida esperada: -rw-rw---- dovecot dovecot
```

### 4. Probar sudo sin contraseña (como www-data)
```bash
# Test 1: postmap
sudo -u www-data sudo -n postmap -q test /etc/postfix/virtual
# ✓ No debe pedir contraseña

# Test 2: doveadm
sudo -u www-data sudo -n doveadm reload
# ✓ No debe pedir contraseña

# Test 3: helper script
sudo -u www-data sudo -n /usr/local/bin/soop_create_mailbox /tmp/test_mailbox
# ✓ No debe pedir contraseña, debe crear el maildir
```

### 5. Verificar sudoers
```bash
sudo visudo -c -f /etc/sudoers.d/soop_mail
# Salida esperada: /etc/sudoers.d/soop_mail: parsed OK

cat /etc/sudoers.d/soop_mail
# Debe mostrar todas las reglas
```

---

## Seguridad

### ✅ Lo que SÍ puede hacer www-data:
- ✅ Leer y escribir archivos de configuración (virtual, vmailbox, users, BCC)
- ✅ Ejecutar postmap para generar archivos .db
- ✅ Recargar Postfix y Dovecot
- ✅ Crear buzones con ownership vmail:vmail vía helper script
- ✅ Consultar estado de servicios
- ✅ Generar hashes de contraseñas con doveadm pw

### ❌ Lo que NO puede hacer www-data:
- ❌ Leer correos directamente (permisos 700 en Maildir)
- ❌ Modificar ownership de archivos fuera de /var/mail/vhosts
- ❌ Ejecutar comandos sudo arbitrarios
- ❌ Reiniciar servicios distintos a postfix/dovecot
- ❌ Escribir en /etc fuera de tee específico
- ❌ Ejecutar rm fuera de /var/mail/vhosts/*/Maildir

### 🔒 Principios de Seguridad Implementados:
1. **Least Privilege**: www-data solo puede ejecutar comandos específicos
2. **Path Restriction**: Los comandos sudo están limitados a rutas concretas
3. **No Direct Mail Access**: www-data nunca accede directamente a los correos
4. **Separation of Duties**: vmail gestiona buzones, www-data gestiona configuración
5. **Audit Trail**: Todas las operaciones quedan registradas en logs de auditoría

---

## Troubleshooting

### Problema: "sudo: no tty present and no askpass program specified"
**Causa**: Falta configurar sudoers o la sintaxis es incorrecta.

**Solución**:
```bash
# Verificar que existe el archivo
ls -la /etc/sudoers.d/soop_mail

# Verificar sintaxis
sudo visudo -c -f /etc/sudoers.d/soop_mail

# Si hay error, re-ejecutar script
sudo bash setup_permissions.sh
```

### Problema: "Permission denied" al escribir en /etc/postfix/virtual
**Causa**: www-data no está en el grupo correcto o permisos incorrectos.

**Solución**:
```bash
# Verificar permisos
ls -la /etc/postfix/virtual

# Debe ser: -rw-rw-r-- root www-data
# Si no, corregir:
sudo chown root:www-data /etc/postfix/virtual
sudo chmod 664 /etc/postfix/virtual

# Verificar que www-data está en grupo
groups www-data
```

### Problema: Los buzones no tienen ownership vmail:vmail
**Causa**: El script helper no se ejecutó correctamente.

**Solución**:
```bash
# Verificar que existe el helper
ls -la /usr/local/bin/soop_create_mailbox

# Probar ejecución manual
sudo /usr/local/bin/soop_create_mailbox /var/mail/vhosts/test.com/test

# Verificar ownership
ls -la /var/mail/vhosts/test.com/test
# Debe ser: drwx------ vmail vmail

# Si no, corregir manualmente
sudo chown -R vmail:vmail /var/mail/vhosts
sudo find /var/mail/vhosts -type d -exec chmod 700 {} \;
```

### Problema: Postfix no reconoce cambios en virtual file
**Causa**: No se ejecutó postmap después de modificar el archivo.

**Solución**:
```bash
# Verificar que existe el .db
ls -la /etc/postfix/virtual.db

# Regenerar .db
sudo postmap /etc/postfix/virtual
sudo postfix reload

# Probar lookup
postmap -q alias@dominio.com /etc/postfix/virtual
```

---

## Comandos Útiles

### Gestión de Servicios
```bash
# Estado de servicios
sudo systemctl status postfix dovecot soop_mail

# Reiniciar servicios
sudo systemctl restart postfix
sudo systemctl restart dovecot

# Logs en tiempo real
tail -f /var/log/mail.log
journalctl -u soop_mail -f
```

### Diagnóstico de Permisos
```bash
# Ver permisos de archivos críticos
ls -la /etc/postfix/{virtual,vmailbox,sender_bcc,recipient_bcc}
ls -la /etc/dovecot/users
ls -la /var/mail/vhosts

# Ver grupos de www-data
groups www-data

# Ver usuario actual
whoami

# Probar sudo como www-data
sudo -u www-data sudo -n -l
```

### Verificación de Configuración
```bash
# Postfix
postconf virtual_mailbox_base
postconf virtual_mailbox_maps
postconf virtual_alias_maps

# Dovecot
doveconf -n | grep -E "(passdb|userdb|mail_location)"

# Sudoers
sudo cat /etc/sudoers.d/soop_mail
```

---

## Mantenimiento

### Agregar Nuevo Comando sudo

1. Editar el archivo sudoers:
```bash
sudo visudo -f /etc/sudoers.d/soop_mail
```

2. Agregar línea siguiendo el patrón:
```
www-data ALL=(ALL) NOPASSWD: /ruta/completa/al/comando [args_específicos]
```

3. Guardar y verificar sintaxis:
```bash
sudo visudo -c -f /etc/sudoers.d/soop_mail
```

### Rotar Logs de Auditoría

```bash
# Configurar logrotate para logs de la aplicación
sudo nano /etc/logrotate.d/soop_mail
```

```
/var/log/soop_mail/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
}
```

### Backup de Configuración

```bash
# Backup de archivos críticos
sudo tar czf soop_mail_config_backup_$(date +%Y%m%d).tar.gz \
    /etc/postfix/{virtual,vmailbox,sender_bcc,recipient_bcc} \
    /etc/dovecot/users \
    /etc/sudoers.d/soop_mail \
    /usr/local/bin/soop_create_mailbox \
    /var/mail/vhosts
```

---

## Resumen de Comandos Rápidos

```bash
# Instalación inicial
sudo bash setup_permissions.sh

# Verificar estado
sudo systemctl status postfix dovecot soop_mail

# Probar permisos
sudo -u www-data sudo -n postmap -q test /etc/postfix/virtual

# Ver logs
tail -f /var/log/mail.log

# Reiniciar servicios
sudo systemctl restart postfix dovecot soop_mail

# Verificar buzones
ls -la /var/mail/vhosts

# Backup
sudo tar czf backup_$(date +%Y%m%d).tar.gz /etc/postfix /etc/dovecot /var/mail
```

---

## Contacto y Soporte

Para más información, consultar:
- **Documentación Principal**: `DOCUMENTACION_SISTEMA_PERMISOS_EMAIL.md`
- **Script de Instalación**: `setup_permissions.sh`
- **Logs de Sistema**: `/var/log/mail.log`, `/var/log/syslog`
- **Logs de Aplicación**: Configurar en `gunicorn` o `uvicorn`

---

**Última Actualización**: 2025-01-XX  
**Versión**: 1.0  
**Sistema**: Soop Mail - Gestión de Correo Corporativo
