import sqlite3
import os

db_path = 'antigravity.db'
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add is_verified to users
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'is_verified' not in columns:
            print("Adding is_verified column to users table...")
            cursor.execute("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0")
            
        # Create verification_codes table
        print("Creating verification_codes table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS verification_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR,
                code VARCHAR,
                type VARCHAR,
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Update existing users to be verified (optional, but prevents breaking existing accounts)
        cursor.execute("UPDATE users SET is_verified = 1 WHERE is_verified IS NULL OR is_verified = 0")
        
        conn.commit()
        conn.close()
        print("Migration successful")
    except Exception as e:
        print(f"Error during migration: {e}")
else:
    print(f"Database {db_path} not found.")
