#!/usr/bin/env python3
"""
Complete v1.0.6.68 backup - copy all 12 module files
"""
import shutil
import os

source_dir = "/vercel/share/v0-project/dice-link-companion"
backup_dir = "/vercel/share/v0-project/backups/v1.0.6.68"

# Create backup directory
os.makedirs(backup_dir, exist_ok=True)

# List of all 12 module files to backup
files_to_backup = [
    "approval.js",
    "chat.js",
    "dialog-mirroring.js",
    "dice-parsing.js",
    "en.json",
    "main.css",
    "main.mjs",
    "mode-application.js",
    "module.json",
    "settings.js",
    "socket.js"
]

for file in files_to_backup:
    source_path = os.path.join(source_dir, file)
    if file == "module.json":
        dest_path = os.path.join(backup_dir, "module.json.backup")
    else:
        dest_path = os.path.join(backup_dir, file)
    
    if os.path.exists(source_path):
        shutil.copy2(source_path, dest_path)
        print(f"✓ Backed up: {file}")
    else:
        print(f"✗ Not found: {file}")

print(f"\nBackup complete: {len(files_to_backup)} files backed up to {backup_dir}")
