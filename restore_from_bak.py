from pathlib import Path

root = Path(r"C:\Users\Admin\Documents\GitHub\baldandbad.github.io")  # change folder if needed
count = 0

for bak in root.rglob("*.bak"):
    orig = bak.with_suffix(bak.suffix[:-4])  # remove .bak
    if orig.exists():
        orig.unlink()
    bak.rename(orig)
    print(f"Restored: {orig}")
    count += 1

print(f"Restored {count} files.")
