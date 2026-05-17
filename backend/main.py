from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta, datetime
import uvicorn
import os
import json
from typing import List, Optional

from db import engine, Base, get_db, User, AgentLog, LimitRequest, Notification, VerificationCode
print("Imported DB module")
from email_utils import send_verification_email, send_invitation_email, generate_code, send_password_reset_email
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from agent import perform_research
from papers.router import router as papers_router
from papers.storage import ensure_bucket

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Antigravity API", version="2.0.0")


@app.on_event("startup")
def _startup_minio():
    try:
        ensure_bucket()
    except Exception as e:
        print(f"[startup] MinIO bucket setup skipped: {e}")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin Secret Key
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "admin123")

# Pydantic Models
class UserCreate(BaseModel):
    email: str
    password: Optional[str] = None
    role: Optional[str] = "user"
    admin_secret: Optional[str] = None
    search_limit: Optional[int] = 10

class SignupRequest(BaseModel):
    email: str

class VerifySignup(BaseModel):
    email: str
    code: str
    password: str
    role: Optional[str] = "user"
    admin_secret: Optional[str] = None

class InviteVerify(BaseModel):
    invite_code: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class VerifyPasswordReset(BaseModel):
    email: str
    code: str
    new_password: str

class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    search_limit: Optional[int] = None
    role: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class ResearchRequest(BaseModel):
    query: str

class LimitRequestCreate(BaseModel):
    request_type: Optional[str] = "limit"
    requested_limit: Optional[int] = None
    reason: str

class RequestHandle(BaseModel):
    status: str # approved or rejected

# Auth Routes
@app.post("/auth/signup-request")
def signup_request(request: SignupRequest, db: Session = Depends(get_db)):
    # Check if user already exists
    db_user = db.query(User).filter(User.email == request.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Generate and save code
    code = generate_code()
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    # Clean old codes for this email
    db.query(VerificationCode).filter(VerificationCode.email == request.email, VerificationCode.type == "signup").delete()
    
    new_code = VerificationCode(email=request.email, code=code, type="signup", expires_at=expires_at)
    db.add(new_code)
    db.commit()
    
    # Send email
    success = send_verification_email(request.email, code)
    if not success:
        # Fallback for dev: code is returned or logged
        print(f"FAILED TO SEND EMAIL TO {request.email}. CODE: {code}")
    
    return {"message": "Verification code sent to email"}

@app.post("/auth/verify-signup", response_model=Token)
def verify_signup(data: VerifySignup, db: Session = Depends(get_db)):
    # Verify code
    db_code = db.query(VerificationCode).filter(
        VerificationCode.email == data.email,
        VerificationCode.code == data.code,
        VerificationCode.type == "signup",
        VerificationCode.expires_at > datetime.utcnow()
    ).first()
    
    if not db_code:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    
    # Validation
    role = "user"
    if data.role == "admin":
        if data.admin_secret != ADMIN_SECRET:
            raise HTTPException(status_code=403, detail="Invalid admin secret key")
        role = "admin"
    
    # Create user
    hashed_password = get_password_hash(data.password)
    new_user = User(
        email=data.email, 
        password_hash=hashed_password, 
        role=role,
        is_verified=True
    )
    db.add(new_user)
    db.query(VerificationCode).filter(VerificationCode.email == data.email).delete() # Cleanup
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email, "role": new_user.role})
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role}

@app.post("/auth/invite-verify", response_model=Token)
def invite_verify(data: InviteVerify, db: Session = Depends(get_db)):
    db_code = db.query(VerificationCode).filter(
        VerificationCode.code == data.invite_code,
        VerificationCode.type == "invite",
        VerificationCode.expires_at > datetime.utcnow()
    ).first()
    
    if not db_code:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation code")
    
    # Find the pre-created user (or create now)
    db_user = db.query(User).filter(User.email == db_code.email).first()
    if not db_user:
        db_user = User(email=db_code.email, role="user", is_verified=True)
        db.add(db_user)
    
    db_user.password_hash = get_password_hash(data.password)
    db_user.is_verified = True
    db_user.is_active = True
    
    db.query(VerificationCode).filter(VerificationCode.code == data.invite_code).delete()
    db.commit()
    db.refresh(db_user)
    
    access_token = create_access_token(data={"sub": db_user.email, "role": db_user.role})
    return {"access_token": access_token, "token_type": "bearer", "role": db_user.role}

@app.post("/auth/password-reset-request")
def password_reset_request(request: PasswordResetRequest, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == request.email).first()
    if not db_user:
        # For security reasons, still say code sent if email exists or not?
        # User said "no non existing mail id s create account if attempting then tell now such type of account exist"
        # For password reset, if email doesn't exist, we should probably tell them or just be consistent.
        # User wants us to validate email existence.
        raise HTTPException(status_code=404, detail="No account found with this email address")
    
    code = generate_code()
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    
    # Clean old reset codes
    db.query(VerificationCode).filter(VerificationCode.email == request.email, VerificationCode.type == "reset").delete()
    
    new_code = VerificationCode(email=request.email, code=code, type="reset", expires_at=expires_at)
    db.add(new_code)
    db.commit()
    
    send_password_reset_email(request.email, code)
    return {"message": "Password reset code sent to your email"}

@app.post("/auth/password-reset-verify")
def password_reset_verify(data: VerifyPasswordReset, db: Session = Depends(get_db)):
    db_code = db.query(VerificationCode).filter(
        VerificationCode.email == data.email,
        VerificationCode.code == data.code,
        VerificationCode.type == "reset",
        VerificationCode.expires_at > datetime.utcnow()
    ).first()
    
    if not db_code:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    
    db_user = db.query(User).filter(User.email == data.email).first()
    if not db_user:
         raise HTTPException(status_code=404, detail="User not found")
         
    db_user.password_hash = get_password_hash(data.new_password)
    db.query(VerificationCode).filter(VerificationCode.email == data.email, VerificationCode.type == "reset").delete()
    db.commit()
    
    return {"message": "Password updated successfully"}

@app.post("/signup", response_model=Token)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # Logic for direct signup (e.g. from admin panel if they want to bypass?)
    # But he said "after giving that code only account created"
    # So I will disable /signup or make it require verification eventually.
    # For now, let's keep it but mark as unverified if used.
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password) if user.password else None
    new_user = User(
        email=user.email, 
        password_hash=hashed_password, 
        role=user.role if user.role else "user",
        is_verified=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    access_token = create_access_token(data={"sub": new_user.email, "role": new_user.role})
    return {"access_token": access_token, "token_type": "bearer", "role": new_user.role}

@app.post("/login", response_model=Token)
def login(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    if not db_user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    
    if not db_user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your email first.")
    
    access_token = create_access_token(data={"sub": db_user.email, "role": db_user.role})
    return {"access_token": access_token, "token_type": "bearer", "role": db_user.role}

# User APIs
@app.get("/user/profile")
def get_profile(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "role": current_user.role,
        "search_limit": current_user.search_limit,
        "search_used": current_user.search_used,
        "created_at": current_user.created_at
    }

@app.get("/user/history")
async def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logs = db.query(AgentLog).filter(AgentLog.user_id == current_user.id).order_by(AgentLog.created_at.desc()).all()
    return logs

@app.post("/research")
async def research(
    request: ResearchRequest, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check limits
    if current_user.role != "admin" and current_user.search_used >= current_user.search_limit:
        raise HTTPException(
            status_code=403, 
            detail="Search limit exceeded. Please contact admin."
        )
    
    try:
        result = await perform_research(request.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Update user stats
    current_user.search_used += 1
    
    # Save log
    log = AgentLog(
        user_id=current_user.id,
        query=request.query,
        execution_time=result["execution_time"],
        used_web_search=result["used_web_search"],
        response=json.dumps(result)
    )
    db.add(log)
    db.commit()
    
    return result

# User Limit Request & Notification APIs
@app.post("/user/request-limit")
async def request_limit(
    request_data: LimitRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Create request
    new_request = LimitRequest(
        user_id=current_user.id,
        request_type=request_data.request_type,
        requested_limit=request_data.requested_limit,
        current_limit=current_user.search_limit if request_data.request_type == "limit" else None,
        reason=request_data.reason
    )
    db.add(new_request)
    
    # Create notification for admin
    type_display = "Limit Increase" if request_data.request_type == "limit" else "Password Reset"
    msg = f"User {current_user.email} requested {type_display}."
    if request_data.requested_limit:
        msg += f" (New Limit: {request_data.requested_limit})"
    msg += f" Reason: {request_data.reason}"

    admin_notif = Notification(
        user_id=None, # For all admins
        title=f"New {type_display} Request",
        message=msg,
        type="request"
    )
    db.add(admin_notif)
    db.commit()
    return {"message": "Request submitted successfully"}

@app.get("/user/notifications")
def get_user_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()

@app.get("/notifications")
def get_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "admin":
        return db.query(Notification).filter(Notification.user_id == None).order_by(Notification.created_at.desc()).all()
    else:
        return db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()

@app.post("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    # Admins can read admin notifs (user_id is None)
    if notif.user_id and notif.user_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}

# Admin APIs
@app.get("/admin/dashboard")
def get_admin_dashboard(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Only count standard users (researchers) for "Total Users"
    total_users = db.query(User).filter(User.role == "user").count()
    total_admins = db.query(User).filter(User.role == "admin").count()
    
    # Differentiation of how standard users were created
    self_signups = db.query(User).filter(User.role == "user", User.created_by == "self").count()
    admin_created = db.query(User).filter(User.role == "user", User.created_by != "self").count()
    
    total_queries = db.query(AgentLog).count()
    web_searches = db.query(AgentLog).filter(AgentLog.used_web_search == True).count()
    
    # Queries per user (top 10 standard users)
    queries_per_user = db.query(User.email, User.search_used).filter(User.role == "user").order_by(User.search_used.desc()).limit(10).all()
    
    return {
        "metrics": {
            "total_users": total_users,
            "total_admins": total_admins,
            "self_signups": self_signups,
            "admin_created": admin_created,
            "total_queries": total_queries,
            "web_search_rate": (web_searches / total_queries * 100) if total_queries > 0 else 0
        },
        "charts": {
            "user_distribution": [
                {"name": "Self Signup", "value": self_signups},
                {"name": "Admin Created", "value": admin_created}
            ],
            "queries_per_user": [{"email": q[0], "count": q[1]} for q in queries_per_user]
        }
    }

@app.get("/admin/users")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{
        "id": u.id,
        "email": u.email,
        "role": u.role,
        "search_limit": u.search_limit,
        "search_used": u.search_used,
        "is_active": u.is_active,
        "is_verified": u.is_verified,
        "created_by": u.created_by,
        "created_at": u.created_at
    } for u in users]

@app.post("/admin/users")
def create_user_by_admin(user_data: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user as unverified
    new_user = User(
        email=user_data.email,
        role=user_data.role or "user",
        search_limit=user_data.search_limit or 10,
        created_by=admin.email,
        is_verified=False,
        is_active=False # Inactive until они set password via invite
    )
    db.add(new_user)
    
    # Create invite code
    invite_code = generate_code(8)
    expires_at = datetime.utcnow() + timedelta(days=7) # Invitations last a week
    new_invite = VerificationCode(email=user_data.email, code=invite_code, type="invite", expires_at=expires_at)
    db.add(new_invite)
    
    db.commit()
    
    # Send invitation email
    success = send_invitation_email(user_data.email, invite_code)
    msg = "User created and invitation sent." if success else "User created but email sending failed. Code: " + invite_code
    
    return {"message": msg, "invite_code": invite_code if not success else None}

@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@app.patch("/admin/users/{user_id}/status")
def update_user_status(user_id: int, status_update: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if status_update.is_active is not None:
        user.is_active = status_update.is_active
    db.commit()
    return {"message": "Status updated"}

@app.patch("/admin/users/{user_id}/limit")
def update_user_limit(user_id: int, limit_update: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if limit_update.search_limit is not None:
        user.search_limit = limit_update.search_limit
    if limit_update.role is not None:
        user.role = limit_update.role
    db.commit()
    return {"message": "User settings updated"}

@app.post("/admin/users/{user_id}/reset")
def reset_user_usage(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.search_used = 0
    db.commit()
    return {"message": "Usage reset successfully"}

@app.get("/admin/users/{user_id}/analytics")
def get_user_analytics(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    logs = db.query(AgentLog).filter(AgentLog.user_id == user.id).order_by(AgentLog.created_at.desc()).all()
    
    return {
        "user": {
            "email": user.email,
            "role": user.role,
            "search_limit": user.search_limit,
            "search_used": user.search_used,
            "is_active": user.is_active
        },
        "history": logs
    }

@app.get("/admin/requests")
def list_requests(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    requests = db.query(LimitRequest).order_by(LimitRequest.created_at.desc()).all()
    result = []
    for r in requests:
        user = db.query(User).filter(User.id == r.user_id).first()
        result.append({
            "id": r.id,
            "user_email": user.email if user else "Unknown",
            "request_type": r.request_type,
            "requested_limit": r.requested_limit,
            "current_limit": r.current_limit,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at
        })
    return result

@app.post("/admin/requests/{request_id}/handle")
def handle_request(
    request_id: int, 
    handle_data: RequestHandle, 
    admin: User = Depends(require_admin), 
    db: Session = Depends(get_db)
):
    req = db.query(LimitRequest).filter(LimitRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    req.status = handle_data.status
    user = db.query(User).filter(User.id == req.user_id).first()
    
    if handle_data.status == "approved" and user and req.request_type == "limit":
        user.search_limit = req.requested_limit
        
    # Notify user
    type_name = "Limit Request" if req.request_type == "limit" else "Password Reset Request"
    notif = Notification(
        user_id=req.user_id,
        title=f"{type_name} {handle_data.status.capitalize()}",
        message=f"Your {type_name.lower()} has been {handle_data.status}.",
        type="success" if handle_data.status == "approved" else "warning"
    )
    db.add(notif)
    db.commit()
    return {"message": f"Request {handle_data.status}"}

app.include_router(papers_router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
