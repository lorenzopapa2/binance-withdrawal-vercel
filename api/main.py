import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.index import app

# This is the main entry point for Vercel
application = app

if __name__ == "__main__":
    app.run(debug=True, port=8889)