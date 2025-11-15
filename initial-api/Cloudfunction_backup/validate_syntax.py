"""
Simple syntax validation for the Cloud Function
"""
import ast
import os

def validate_python_syntax():
    """Validate that main.py has valid Python syntax"""
    
    print("=== Validating Python Syntax ===")
    
    try:
        with open('main.py', 'r') as f:
            source_code = f.read()
        
        # Parse the AST to check for syntax errors
        ast.parse(source_code)
        print("[PASS] main.py has valid Python syntax")
        
        # Check for required function
        tree = ast.parse(source_code)
        functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
        
        if 'get_signed_url' in functions:
            print("[PASS] get_signed_url function found")
        else:
            print("[FAIL] get_signed_url function not found")
            return False
            
        return True
        
    except SyntaxError as e:
        print(f"[FAIL] Syntax error in main.py: {e}")
        return False
    except FileNotFoundError:
        print("[FAIL] main.py not found")
        return False

def validate_file_contents():
    """Validate key content in files"""
    
    print("\n=== Validating File Contents ===")
    
    # Check main.py for key components
    try:
        with open('main.py', 'r') as f:
            main_content = f.read()
        
        key_elements = [
            'from google.cloud import storage',
            'def get_signed_url',
            'OPTIONS',
            'Access-Control-Allow-Origin',
            'BUCKET_NAME',
            'generate_signed_url'
        ]
        
        for element in key_elements:
            if element in main_content:
                print(f"[PASS] Found: {element}")
            else:
                print(f"[FAIL] Missing: {element}")
                return False
        
        return True
        
    except FileNotFoundError:
        print("[FAIL] main.py not found")
        return False

if __name__ == "__main__":
    print("Cloud Function Syntax Validation")
    print("=" * 40)
    
    # Change to script directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    syntax_valid = validate_python_syntax()
    content_valid = validate_file_contents()
    
    print("\n" + "=" * 40)
    if syntax_valid and content_valid:
        print("[SUCCESS] All syntax validations passed")
        print("[READY] Function structure is correct")
        print("\nYour Google Cloud Function is ready for deployment!")
        print("Run: bash deploy-function.sh")
    else:
        print("[ERROR] Some validations failed")
        print("Please check the errors above")