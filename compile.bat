@echo off
echo Compilando SCSS a CSS...
python compile_scss.py
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Compilacion exitosa!
) else (
    echo.
    echo Error en la compilacion
    pause
)

