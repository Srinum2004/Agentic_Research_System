import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import random
import string
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER)

def generate_code(length=6):
    return ''.join(random.choices(string.digits, k=length))

def send_email(subject, recipient, body_html):
    if not SMTP_USER or not SMTP_PASS:
        print("SMTP Credentials not found. Email not sent.")
        print(f"DEBUG EMAIL to {recipient}: {subject}")
        print(f"BODY: {body_html}")
        return False
    
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_FROM
        msg['To'] = recipient
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body_html, 'html'))
        
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def send_verification_email(email, code):
    subject = "Antigravity - Your Verification Code"
    body = f"""
    <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #6366f1;">Antigravity Account Verification</h2>
        <p>You requested an account verification code. Please use the code below to complete your registration:</p>
        <div style="background: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #0f121a;">{code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 15 minutes. If you did not request this code, please ignore this email.</p>
    </div>
    """
    return send_email(subject, email, body)

def send_invitation_email(email, invite_code):
    subject = "Antigravity - WorkSpace Invitation"
    # Note: In a real app, this would be a URL like http://localhost:5173/invite?code=...
    # For now, we'll tell them to use the code.
    body = f"""
    <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #6366f1;">Welcome to Antigravity</h2>
        <p>An administrator has invited you to join the Antigravity research platform.</p>
        <p>To join, please visit the activation link below and enter your invitation code:</p>
        <div style="margin: 30px 0; text-align: center;">
            <a href="http://localhost:5173/invite" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Activate Account</a>
        </div>
        <p>Your Invitation Code: <strong>{invite_code}</strong></p>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Welcome aboard!</p>
    </div>
    """
    return send_email(subject, email, body)

def send_password_reset_email(email, code):
    subject = "Antigravity - Password Reset Code"
    body = f"""
    <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #6366f1;">Password Reset Request</h2>
        <p>You requested to reset your password. Please use the verification code below to set a new password:</p>
        <div style="background: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #0f121a;">{code}</span>
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 15 minutes. If you did not request this, please secure your account.</p>
    </div>
    """
    return send_email(subject, email, body)
