-- Script SQL para crear la base de datos y usuario
-- Ejecutar como root de MySQL

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS soop_mail_admin 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Crear usuario de pruebas (cambiar la contraseña por una segura)
CREATE USER IF NOT EXISTS 'admin'@'localhost' 
    IDENTIFIED BY '$2b$12$qa.ioo0RruQmr1Bpix0fQuINF7pF1z2Mahq.6oR6sgw6gDZBHhrrS';

-- Otorgar privilegios
GRANT ALL PRIVILEGES ON soop_mail_admin.* TO 'admin'@'localhost';

-- Aplicar cambios
FLUSH PRIVILEGES;

-- Usar la base de datos recién creada
USE soop_mail_admin;

-- Crear tabla de usuarios administradores
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(80) NOT NULL,
    email VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    last_login DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear tabla de sesiones
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_sessions_token (session_token),
    KEY idx_user_sessions_user_id (user_id),
    KEY idx_user_sessions_created_at (created_at),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NULL,
    resource_id VARCHAR(100) NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    details TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_logs_action (action),
    KEY idx_audit_logs_created_at (created_at),
    KEY idx_audit_logs_user_id (user_id),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear usuario administrador por defecto si no existe
INSERT INTO users (username, email, password_hash, full_name, is_active, is_admin)
SELECT 'admin', 'admin@localhost', '$2b$12$fenERlbUaSGBKSMZWKXS7udwuFiFfOAFVIuqrJBNqgkbKOIkAPucu', 'Administrador', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

-- Verificar
SHOW DATABASES LIKE 'soop_mail_admin';
SELECT User, Host FROM mysql.user WHERE User = 'admin';
SELECT COUNT(*) AS total_users FROM soop_mail_admin.users;

