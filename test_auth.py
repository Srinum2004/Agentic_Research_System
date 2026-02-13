from backend.auth import get_password_hash, verify_password
import sys

try:
    print("Testing password hashing...")
    long_password = "a" * 100 # 100 chars
    print(f"Password length: {len(long_password)}")
    
    hashed = get_password_hash(long_password)
    print(f"Hash success: {hashed[:10]}...")
    
    verify = verify_password(long_password, hashed)
    print(f"Verify success: {verify}")
    
    print("ALL TESTS PASSED")
except Exception as e:
    print(f"TEST FAILED: {e}")
    import traceback
    traceback.print_exc()
