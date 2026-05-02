import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import config

# MySQL URL: mysql+pymysql://user:password@host:port/dbname
SQLALCHEMY_DATABASE_URL = config.DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # pool_pre_ping is useful for MySQL to handle disconnected sessions
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
