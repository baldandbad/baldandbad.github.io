import re
from pathlib import Path

root = Path(r"C:\Users\Admin\Documents\GitHub\baldandbad.github.io")

pattern = re.compile(r'(?<=["\'])(/en/)(?=[^"\'>]+?\.(?:jpg|jpeg|png|gif|svg|webp|js|css|ico|html|htm))')

count = 0
for file in root.rglob("*.htm*"):
    text = file.read_text(encoding="utf-8")
    new = pattern.sub("/", text)
    if new != text:
        file.write_text(new, encoding="utf-8")
        print(f"Fixed: {file}")
        count += 1

print(f"Done. Updated {count} files.")
