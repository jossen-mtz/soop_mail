# soop MAIL - Nueva Tecnología (FastAPI + React)

Este proyecto ha sido migrado de Flask a una arquitectura moderna de **FastAPI** (Backend) y **React** (Frontend).

## Requisitos
- Python 3.9+
- Node.js 18+
- MySQL Server

## Configuración del Backend
1. Entra en la carpeta `backend`:
   ```bash
   cd backend
   ```
2. Instala las dependencias:
   ```bash
   pip install -r requirements.txt
   ```
3. Configura el archivo `.env` con tus credenciales de base de datos y rutas.
4. Inicializa la base de datos y crea el administrador inicial:
   ```bash
   python -m init_db
   ```
5. Ejecuta el servidor:
   ```bash
   uvicorn main:app --reload
   ```

## Configuración del Frontend
1. Entra en la carpeta `frontend`:
   ```bash
   cd frontend
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Características de la nueva versión
- **Interfaz Premium**: Diseño oscuro moderno con Glassmorphism y animaciones fluidas.
- **Seguridad JWT**: Autenticación basada en tokens JWT más robusta.
- **Rendimiento**: FastAPI ofrece una velocidad superior y validación automática de datos con Pydantic.
- **React + Vite**: Carga instantánea y una experiencia de usuario más fluida.

---
© 2026 soop Group
