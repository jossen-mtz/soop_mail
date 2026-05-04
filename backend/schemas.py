from pydantic import BaseModel, EmailStr, field_validator, ValidationInfo
from datetime import datetime
from typing import Optional, List
import re

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_\-]+$", v):
            raise ValueError("El nombre de usuario solo puede contener letras, números, guiones y guiones bajos")
        if len(v) < 3:
            raise ValueError("El nombre de usuario debe tener al menos 3 caracteres")
        return v

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v

class UserOut(UserBase):
    id: int
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class SoopMailUserBase(BaseModel):
    email: EmailStr
    uid: str
    gid: str
    home: str
    email_count: Optional[int] = 0
    new_emails: Optional[int] = 0
    storage_size: Optional[str] = "0 B"
    status: str = "active"
    department: Optional[str] = None

class SoopMailAlias(BaseModel):
    email: str
    destinations: List[str]
    is_dynamic: bool = False
    description: Optional[str] = None

class SoopMailAliasCreate(BaseModel):
    email: str
    destinations: List[str]
    is_dynamic: bool = False
    description: Optional[str] = None

class ForwardingRule(BaseModel):
    id: Optional[int] = None
    email: str
    target: str
    direction: str = "both" # incoming, outgoing, both
    active: bool = True

class SoopMailForward(BaseModel):
    source: str
    destinations: List[str]
    keep_local: bool = True
    description: Optional[str] = None

class MailingList(BaseModel):
    email: str
    members: List[str]
    is_dynamic: bool = True
    allowed_senders: List[str] = ["*"] # * means everyone
    subject: Optional[str] = None
    body: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class AutoResponderBase(BaseModel):
    email: EmailStr
    active: bool = False
    subject: Optional[str] = None
    body: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class AutoResponderUpdate(BaseModel):
    active: Optional[bool] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class AutoResponderOut(AutoResponderBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class SoopMailUserCreate(BaseModel):
    email: EmailStr
    password: str
    password_confirm: str
    status: str = "active"
    department: Optional[str] = None
    restart_soop_mail: bool = True

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info: ValidationInfo) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Las contraseñas no coinciden")
        return v

class SoopMailUserUpdate(BaseModel):
    password: Optional[str] = None
    password_confirm: Optional[str] = None
    status: Optional[str] = None
    department: Optional[str] = None
    restart_soop_mail: bool = True

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is not None and "password" in info.data and v != info.data["password"]:
            raise ValueError("Las contraseñas no coinciden")
        return v

class UserPasswordChange(BaseModel):
    current_password: str
    password_confirm: Optional[str] = None # For compatibility if needed
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La nueva contraseña debe tener al menos 8 caracteres")
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info: ValidationInfo) -> str:
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("La confirmación de contraseña no coincide")
        return v

class AuditLogOut(BaseModel):

    id: int
    user_id: Optional[int]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    ip_address: Optional[str]
    details: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class SystemStatus(BaseModel):
    status: str
    service_active: bool
    details: dict

class TrafficHistory(BaseModel):
    date: str
    sent: int
    received: int
    total: int

class TrafficStatsSummary(BaseModel):
    total_sent: int
    total_received: int
    days_analyzed: int
    avg_sent: float
    avg_received: float
    peak_day_total: int

class TrafficStatsResponse(BaseModel):
    history: List[TrafficHistory]
    summary: TrafficStatsSummary
