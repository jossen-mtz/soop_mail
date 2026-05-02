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
        print("\nSistema en ejecucion. Presiona Ctrl+C para detener.\n")
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print(f"El servidor se detuvo (Exit code: {backend_proc.returncode}).")
                break

    except KeyboardInterrupt:
        print("\nDeteniendo servicios...")
        if os.name == 'nt':
            subprocess.run(f"taskkill /F /T /PID {backend_proc.pid}", shell=True, capture_output=True)
        else:
            backend_proc.terminate()
        print("Hasta luego!")

if __name__ == "__main__":
    main()
