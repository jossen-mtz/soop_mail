# Compilador SCSS para Mail Admon

## Descripción

Este compilador SCSS convierte los archivos SCSS modulares a CSS compilado. Es un compilador básico escrito en Python que:

- Resuelve imports de archivos SCSS
- Reemplaza variables SCSS con sus valores
- Procesa anidamientos básicos SCSS
- Genera CSS válido

## Uso

### Opción 1: Script Batch (Windows)
```bash
compile.bat
```

### Opción 2: Python directamente
```bash
python compile_scss.py
```

## Estructura

```
static/scss/
├── main.scss          # Archivo principal (punto de entrada)
├── colors.scss        # Variables de colores
├── components/        # Componentes modulares
│   ├── _buttons.scss
│   ├── _forms.scss
│   ├── _tables.scss
│   ├── _modals.scss
│   ├── _messages.scss
│   └── _badges.scss
└── ui/                # Estilos de UI específicos
    ├── auth.scss
    └── dashboard.scss
```

## Características

- ✅ Resolución de imports
- ✅ Resolución de variables
- ✅ Procesamiento básico de anidamientos
- ✅ Compatible con estructura modular
- ✅ Genera CSS válido

## Notas

- El CSS compilado se genera en `static/css/style.css`
- **NO editar directamente** el archivo CSS compilado
- Editar solo los archivos SCSS en `static/scss/`
- Ejecutar el compilador después de hacer cambios en SCSS

## Limitaciones

Este es un compilador básico. Para funcionalidades avanzadas de SCSS, considera usar:
- Sass/SCSS oficial (requiere Node.js o Ruby)
- Dart Sass (recomendado)

## Ejemplo de uso

1. Editar archivos SCSS en `static/scss/`
2. Ejecutar `compile.bat` o `python compile_scss.py`
3. El CSS se actualiza automáticamente en `static/css/style.css`

