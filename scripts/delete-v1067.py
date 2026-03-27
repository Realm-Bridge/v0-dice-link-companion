import shutil
import os

backup_dir = "/vercel/share/v0-project/backups/v1.0.6.67"

try:
    if os.path.exists(backup_dir):
        shutil.rmtree(backup_dir)
        print(f"Successfully deleted directory: {backup_dir}")
    else:
        print(f"Directory does not exist: {backup_dir}")
except Exception as e:
    print(f"Error deleting directory: {e}")
