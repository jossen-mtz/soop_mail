from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

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

class SoopMailUserCreate(BaseModel):
    email: EmailStr
    password: str
    password_confirm: str
    restart_soop_mail: bool = True

class SoopMailUserUpdate(BaseModel):
    password: str
    password_confirm: str
    restart_soop_mail: bool = True

class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

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
