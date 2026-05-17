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

# ---------------------------------------------------------------------------
# Paper Studio — agentic research paper authoring (additive; no existing
# table is touched). See backend/papers/ for the LangGraph pipeline.
# ---------------------------------------------------------------------------

class PaperProject(Base):
    __tablename__ = "paper_projects"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, default="Untitled Paper")
    topic = Column(String, default="")
    domain = Column(String, default="")
    paper_format = Column(String, default="")      # ieee_conference | acm_article | elsevier_journal | apa_thesis
    paper_type = Column(String, default="")        # experimental | survey | review | case_study
    citation_style = Column(String, default="")    # ieee | springer | acm | elsevier | apa
    journal_type = Column(String, default="")
    num_sections = Column(Integer, default=15)
    include_tables = Column(Boolean, default=True)
    include_figures = Column(Boolean, default=True)
    status = Column(String, default="intent")      # intent | template_ready | drafting | done
    template_json = Column(Text, nullable=True)    # JSON: ordered list of section specs
    intent_complete = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("PaperMessage", back_populates="project", cascade="all, delete-orphan")
    sections = relationship("PaperSection", back_populates="project", cascade="all, delete-orphan")
    assets = relationship("PaperAsset", back_populates="project", cascade="all, delete-orphan")
    audits = relationship("PaperAudit", back_populates="project", cascade="all, delete-orphan")


class PaperMessage(Base):
    __tablename__ = "paper_messages"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("paper_projects.id"))
    role = Column(String)            # user | assistant | system
    content = Column(Text)
    phase = Column(String, default="intake")  # intake | clarify | template | draft | edit
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("PaperProject", back_populates="messages")


class PaperSection(Base):
    __tablename__ = "paper_sections"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("paper_projects.id"))
    key = Column(String)             # abstract, introduction, methodology, ...
    title = Column(String)
    order = Column(Integer, default=0)
    body_md = Column(Text, default="")
    guidance_json = Column(Text, nullable=True)
    word_count = Column(Integer, default=0)
    version = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("PaperProject", back_populates="sections")


class PaperAsset(Base):
    __tablename__ = "paper_assets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("paper_projects.id"))
    kind = Column(String)            # figure | table | diagram | export
    label = Column(String, default="")
    caption = Column(String, default="")
    minio_key = Column(String)
    mime = Column(String, default="application/octet-stream")
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("PaperProject", back_populates="assets")


class PaperAudit(Base):
    __tablename__ = "paper_audits"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("paper_projects.id"))
    version = Column(Integer, default=1)             # per-project audit version
    overall_score = Column(Integer, default=0)        # 0-100
    publication_readiness = Column(Integer, default=0)
    novelty_score = Column(Integer, default=0)
    plagiarism_risk = Column(String, default="low")  # low | medium | high
    ai_detection_risk = Column(String, default="low")
    decision = Column(String, default="major_revision")
    json_report = Column(Text, nullable=True)         # full AuditReport as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("PaperProject", back_populates="audits")


# ---------------------------------------------------------------------------
# Verify-Paper edit layer
#
# Stores the user's edits to the rendered PDF canvas as a JSON blob keyed by
# the PDF.js text-run id (e.g. "p1_t42" -> { original, new, page }). Treated
# as the source of truth for "what the user sees" — the audit re-applies
# these on top of the original extracted sections at re-verify time, and the
# export endpoint can rebuild the document with these edits in place. No
# silent mutation of paper_sections from the AI flow.
# ---------------------------------------------------------------------------

class PaperEditLayer(Base):
    __tablename__ = "paper_edit_layers"
    project_id = Column(Integer, ForeignKey("paper_projects.id"), primary_key=True)
    edits_json = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
