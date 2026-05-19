"""Lectura de plantillas Excel para importación masiva de buzones."""

from __future__ import annotations

import io
import re
from typing import List, Tuple

import polars as pl

EMAIL_COLUMN_ALIASES = ("correo", "email", "e-mail", "mail", "correo electronico", "correo electrónico")

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def _normalize_header(name: str) -> str:
    return name.strip().lower()


def _resolve_email_column(df: pl.DataFrame) -> str:
    normalized = {_normalize_header(c): c for c in df.columns}
    for alias in EMAIL_COLUMN_ALIASES:
        if alias in normalized:
            return normalized[alias]
    if len(df.columns) == 1:
        return df.columns[0]
    raise ValueError(
        "La plantilla debe incluir una columna llamada 'correo'. "
        f"Columnas encontradas: {', '.join(df.columns)}"
    )


def _read_excel_bytes(content: bytes) -> pl.DataFrame:
    buffer = io.BytesIO(content)
    try:
        return pl.read_excel(buffer)
    except Exception as exc:
        raise ValueError(f"No se pudo leer el archivo Excel: {exc}") from exc


def normalize_email_value(raw: str, default_domain: str) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if "@" not in value:
        value = f"{value}@{default_domain}"
    return value.lower()


def is_valid_email(email: str) -> bool:
    return _EMAIL_RE.match(email) is not None


def parse_emails_from_excel(content: bytes, default_domain: str) -> Tuple[List[str], List[str]]:
    """
    Devuelve (correos únicos válidos, errores de fila).
    """
    df = _read_excel_bytes(content)
    if df.is_empty():
        raise ValueError("El archivo Excel no contiene filas de datos")

    column = _resolve_email_column(df)
    series = df.get_column(column).cast(pl.Utf8, strict=False)

    emails: List[str] = []
    errors: List[str] = []
    seen: set[str] = set()

    for idx, cell in enumerate(series.to_list(), start=2):
        email = normalize_email_value(cell, default_domain)
        if not email:
            continue
        if not is_valid_email(email):
            errors.append(f"Fila {idx}: formato de correo inválido ({email})")
            continue
        if email in seen:
            errors.append(f"Fila {idx}: correo duplicado en el archivo ({email})")
            continue
        seen.add(email)
        emails.append(email)

    if not emails:
        raise ValueError("No se encontraron correos válidos en el archivo")

    return emails, errors


def build_import_template_bytes() -> bytes:
    df = pl.DataFrame(
        {
            "correo": [
                "usuario1@ejemplo.com",
                "usuario2",
            ]
        }
    )
    buffer = io.BytesIO()
    df.write_excel(buffer)
    return buffer.getvalue()
