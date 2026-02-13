from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./antigravity.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="user") # "admin" or "user"
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    search_limit = Column(Integer, default=10) # Default search limit
    search_used = Column(Integer, default=0)
    created_by = Column(String, default="self") # admin_email or "self"
    created_at = Column(DateTime, default=datetime.utcnow)

    logs = relationship("AgentLog", back_populates="owner")
    limit_requests = relationship("LimitRequest", back_populates="user")
    notifications = relationship("Notification", back_populates="user")

class AgentLog(Base):
    __tablename__ = "agent_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    query = Column(String)
    execution_time = Column(String)
    used_web_search = Column(Boolean, default=False)
    response = Column(Text) # Stored as JSON string or text
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="logs")

class LimitRequest(Base):
    __tablename__ = "limit_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    request_type = Column(String, default="limit") # limit, password_reset
    requested_limit = Column(Integer, nullable=True)
    current_limit = Column(Integer, nullable=True)
    reason = Column(String)
    status = Column(String, default="pending") # pending, approved, rejected
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="limit_requests")

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # null means for admins
    message = Column(String)
    title = Column(String)
    type = Column(String) # info, success, warning, request
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")

class VerificationCode(Base):
    __tablename__ = "verification_codes"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    code = Column(String)
    type = Column(String) # "signup", "reset", "invite"
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
