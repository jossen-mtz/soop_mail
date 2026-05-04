# Guía de Reparación de Permisos - Soop Mail

Ejecuta estos comandos en tu servidor para asegurar que el Dashboard pueda leer los correos y gestionar los usuarios correctamente.

## 1. Grupos de Sistema
Añade el usuario del servicio (`www-data`) a los grupos que manejan el correo y los logs para que tenga acceso de lectura.

```bash
# Acceso a logs de correo
sudo usermod -aG adm www-data

# Acceso a carpetas de correo (vmail es el estándar de Postfix/Dovecot)
sudo usermod -aG vmail www-data
```

## 2. Permisos de Escritura (Gestión de Usuarios)
Para poder crear y borrar usuarios desde el Dashboard, el servicio debe poder escribir en los archivos de configuración de Postfix y Dovecot.

```bash
# Cambiar el grupo a www-data para permitir edición
sudo chown root:www-data /etc/postfix/vmailbox /etc/postfix/vmailbox.db /etc/dovecot/users /etc/postfix/virtual /etc/postfix/virtual.db

# Dar permisos de lectura/escritura al grupo
sudo chmod 664 /etc/postfix/vmailbox /etc/postfix/vmailbox.db /etc/dovecot/users /etc/postfix/virtual /etc/postfix/virtual.db
```

## 3. Lectura de Mensajes (Estadísticas)
Para que el contador de mensajes y el tamaño de disco no aparezcan en 0, el servicio debe poder entrar en las carpetas de los buzones.

```bash
# Dar permisos de lectura y ejecución (para entrar en carpetas) al grupo vmail
sudo chmod -R g+rX /var/mail/vhosts
sudo chmod -R g+rX /var/mail/soop_mail

# Opcional: Si tus correos están en otra ruta, aplica lo mismo
# sudo chmod -R g+rX /ruta/a/tus/correos
```

## 4. Reiniciar y Verificar
Finalmente, reinicia el servicio para que tome los nuevos permisos de grupo.

```bash
# Reiniciar el backend
sudo systemctl restart soop_mail

# Verificar logs para confirmar que el diagnóstico sale [OK] [WRITABLE]
sudo journalctl -u soop_mail.service -n 50 --no-pager
```

---
**Nota:** Si después de esto sigues viendo "0 mensajes", verifica que las carpetas de tus usuarios contengan las subcarpetas `cur` y `new` (formato Maildir estándar).
