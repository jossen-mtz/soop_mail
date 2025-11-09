#!/usr/bin/env python3
"""
Compilador SCSS a CSS usando libsass
"""

import sys
from pathlib import Path

try:
    import sass
    HAS_LIBSASS = True
except ImportError:
    HAS_LIBSASS = False
    print("ADVERTENCIA: libsass no está instalado. Instala con: pip install libsass")

SCSS_DIR = Path('static/scss')
CSS_DIR = Path('static/css')
MAIN_SCSS = SCSS_DIR / 'main.scss'
OUTPUT_CSS = CSS_DIR / 'style.css'

def compile_scss():
    """Compila SCSS a CSS usando libsass"""
    print("Compilando SCSS a CSS...")
    print(f"Archivo fuente: {MAIN_SCSS}")
    print(f"Archivo destino: {OUTPUT_CSS}")
    
    if not HAS_LIBSASS:
        print("ERROR: libsass no está disponible")
        return False
    
    if not MAIN_SCSS.exists():
        print(f"ERROR: No se encontró {MAIN_SCSS}")
        return False
    
    try:
        # Asegurar que el directorio de salida existe
        OUTPUT_CSS.parent.mkdir(parents=True, exist_ok=True)
        
        # Compilar SCSS a CSS
        # libsass necesita la ruta del directorio scss para resolver imports
        output = sass.compile(
            filename=str(MAIN_SCSS),
            include_paths=[str(SCSS_DIR)],
            output_style='expanded',
            source_comments=False
        )
        
        # Añadir header
        final_content = f"""/* =============================================================================
   ESTILOS COMPILADOS - MAIL ADMON
   Compilado automáticamente desde SCSS usando libsass
   NO EDITAR DIRECTAMENTE - Editar archivos en static/scss/
   ============================================================================= */

{output}
"""
        
        # Escribir archivo CSS
        OUTPUT_CSS.write_text(final_content, encoding='utf-8')
        print(f"OK: CSS compilado exitosamente: {OUTPUT_CSS}")
        print(f"Tamaño: {len(final_content)} caracteres")
        return True
        
    except sass.CompileError as e:
        print(f"ERROR de compilación SCSS: {e}")
        filename = getattr(e, 'filename', getattr(e, 'sass_filename', 'desconocido'))
        line = getattr(e, 'lineno', getattr(e, 'sass_lineno', '?'))
        column = getattr(e, 'colno', getattr(e, 'sass_colno', '?'))
        print(f"  Archivo: {filename}")
        print(f"  Línea: {line}, Columna: {column}")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    success = compile_scss()
    if success:
        print("\nCompilación completada exitosamente!")
    else:
        print("\nERROR en la compilación")
        sys.exit(1)
