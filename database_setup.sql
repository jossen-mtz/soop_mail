-- Script SQL para crear la base de datos y usuario
-- Ejecutar como root de MySQL

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS soop_mail_admin 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Crear usuario (cambiar la contraseña)
CREATE USER IF NOT EXISTS 'soop_mail_admin'@'localhost' 
    IDENTIFIED BY 'cambiar_esta_contraseña_segura';

-- Otorgar privilegios
GRANT ALL PRIVILEGES ON soop_mail_admin.* TO 'soop_mail_admin'@'localhost';

-- Aplicar cambios
FLUSH PRIVILEGES;

-- Verificar
SHOW DATABASES LIKE 'soop_mail_admin';
SELECT User, Host FROM mysql.user WHERE User = 'soop_mail_admin';

