import sqlite3
import os

db_path = 'antigravity.db'
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(limit_requests)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'request_type' not in columns:
            print("Adding request_type column to limit_requests table...")
            cursor.execute("ALTER TABLE limit_requests ADD COLUMN request_type VARCHAR DEFAULT 'limit'")
            conn.commit()
            print("Column added successfully.")
        else:
            print("Column 'request_type' already exists.")
            
        conn.close()
    except Exception as e:
        print(f"Error during migration: {e}")
else:
    print(f"Database {db_path} not found.")
