import subprocess
import sys
import os
import signal
import time
import shutil

def run_command(command, cwd, wait=False):
    if wait:
        return subprocess.run(command, cwd=cwd, shell=True)
    return subprocess.Popen(
        command,
        cwd=cwd,
        shell=True,
        stdout=sys.stdout,
        stderr=sys.stderr
    )

def main():
    import argparse
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
        
    default_env = os.getenv("APP_ENV", "dev")
    parser = argparse.ArgumentParser(description="Gestor de soop MAIL")
    parser.add_argument("--env", choices=["dev", "prod"], default=default_env, help=f"Ambiente (actual: {default_env})")
    parser.add_argument("--hot", action="store_true", help="Activar modo de desarrollo en caliente (HMR + Backend Reload)")
    args = parser.parse_args()

    os.environ["APP_ENV"] = args.env
    print(f"Preparando sistema soop MAIL en ambiente: {args.env.upper()}")
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(base_dir, "backend")
    frontend_dir = os.path.join(base_dir, "frontend")
    static_dir = os.path.join(backend_dir, "static")

    # 1. Instalar dependencias del Backend
    print("Instalando dependencias del Backend...")
    run_command(f"{sys.executable} -m pip install -r requirements.txt", backend_dir, wait=True)

    # 2. Instalar dependencias del Frontend
    print("Instalando dependencias del Frontend...")
    run_command("npm install", frontend_dir, wait=True)

    frontend_proc = None
    if args.hot:
        # MODO HOT: No construimos, arrancamos ambos en paralelo
        print("\n[!] MODO HOT ACTIVADO: Iniciando Frontend en puerto 5173 y Backend con autoreload...")
        
        # Arrancar Frontend (Vite Dev Server)
        frontend_proc = run_command("npm run dev", frontend_dir)
        
        # Arrancar Backend con --reload
        print("Arrancando Backend en http://localhost:8000...")
        backend_proc = run_command(f"{sys.executable} -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload", backend_dir)
    else:
        # MODO PRODUCCIÓN/ESTÁTICO: Construimos y servimos
        # 3. Construir Frontend
        print("Construyendo Frontend (React)...")
        build_res = run_command("npm run build", frontend_dir, wait=True)
        
        if build_res.returncode != 0:
            print("[X] Error al construir el frontend.")
            sys.exit(1)

        # 2. Copiar archivos estáticos al backend
        print("Sincronizando archivos estaticos...")
        dist_dir = os.path.join(frontend_dir, "dist")
        if os.path.exists(static_dir):
            shutil.rmtree(static_dir)
        shutil.copytree(dist_dir, static_dir)

        # 3. Iniciar Backend (que ahora sirve el frontend)
        print("\nArrancando Servidor Unico en http://localhost:8000...")
        backend_proc = run_command(f"{sys.executable} -m uvicorn main:app --host 0.0.0.0 --port 8000", backend_dir)

    try:
        if args.hot:
            print("\n>>> FRONTEND: http://localhost:5173 (Usa este para desarrollo)")
            print(">>> BACKEND:  http://localhost:8000\n")
        
        print("Sistema en ejecucion. Presiona Ctrl+C para detener.\n")
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print(f"El servidor backend se detuvo (Exit code: {backend_proc.returncode}).")
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print(f"El servidor frontend se detuvo (Exit code: {frontend_proc.returncode}).")
                break

    except KeyboardInterrupt:
        print("\nDeteniendo servicios...")
        try:
            if os.name == 'nt':
                if frontend_proc:
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)], capture_output=True)
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)], capture_output=True)
            else:
                if frontend_proc:
                    frontend_proc.terminate()
                backend_proc.terminate()
        except:
            pass
        print("Hasta luego!")

if __name__ == "__main__":
    main()
else:
    # Permitir que el archivo se use como punto de entrada para ASGI (Gunicorn/Uvicorn)
    try:
        from backend.main import app
    except ImportError:
        # Fallback para diferentes estructuras de carpetas
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
        from main import app
