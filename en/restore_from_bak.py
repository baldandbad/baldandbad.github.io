from pathlib import Path
import os
import sys

# --- Configuration ---
# 1. Change this to the folder containing your backups
root = Path(r"C:\Users\Admin\Documents\GitHub\baldandbad.github.io")

# 2. Set the EXACT backup suffix you want to restore from (e.g., '.bak1', '.bak2', etc.)
# If you just want to restore from the standard '.bak', use TARGET_BACKUP_SUFFIX = ".bak"
TARGET_BACKUP_SUFFIX = ".bak1" 
# ---------------------

count = 0

print(f"Searching for files ending in {TARGET_BACKUP_SUFFIX} in: {root}")

# Use rglob to find all files ending with the target suffix in the root folder and subfolders
# If you only want the current folder, change root.rglob to root.glob
for bak in root.rglob(f"*{TARGET_BACKUP_SUFFIX}"):
    if bak.is_file():
        # Calculate the original filename by removing the target suffix
        original_name = bak.name.removesuffix(TARGET_BACKUP_SUFFIX)
        orig = bak.with_name(original_name)

        try:
            # 1. Delete the current original file (if it exists)
            if orig.exists():
                orig.unlink()
            
            # 2. Rename the backup file to the original filename, effectively restoring it
            bak.rename(orig)
            print(f"Restored: {orig.name} (from {bak.name})")
            count += 1
        except Exception as e:
            print(f"[ERROR] Could not restore {bak.name}: {e}")

print(f"Restored {count} files ending in {TARGET_BACKUP_SUFFIX}.")