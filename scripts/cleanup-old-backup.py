#!/usr/bin/env python3
import shutil
import os

backup_dir = "/vercel/share/v0-project/backups/v1.0.6.67"

if os.path.exists(backup_dir):
    shutil.rmtree(backup_dir)
    print(f"Successfully deleted {backup_dir}")
else:
    print(f"{backup_dir} does not exist")
