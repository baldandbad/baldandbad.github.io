#!/usr/bin/env python3
"""
bulk_replace.py

Usage (dry-run by default):
  python bulk_replace.py /path/to/site -m mapping.csv

Apply changes (write files and create backups):
  python bulk_replace.py /path/to/site -m mapping.csv --commit

Options:
  -m, --mapping   CSV file with two columns: old,new
                  (quote fields if they contain commas)
  --regex         Treat left-hand side (old) as a regular expression
  --ignore-case   Case-insensitive matching
  --whole-word    Match whole words only (adds word boundaries for non-regex mode)
  --exts          Comma-separated extensions to process (default: .html,.htm,.md)
  --commit        Write changes (default is dry-run)
  --backup-dir    Directory to copy backups to instead of creating .bak next to files
  --preview-lines How many lines of unified diff to show per file (default: 20)
  --min-changes   Only show/save files with >= this many total replacements (default: 1)
  -h, --help

Mapping CSV format:
  old,new
  "Find this","Replace with that"
  images/use_img/post_author.jpg,/images/use_img/post_author.jpg

Notes:
 - Always run without --commit first to verify changes.
 - Backups: by default creates file.ext.bak next to each changed file (won't overwrite an existing .bak).
"""

from __future__ import annotations
import argparse
import csv
import os
import re
import shutil
from pathlib import Path
from typing import List, Tuple
import difflib
import sys

def load_mappings(csv_path: Path) -> List[Tuple[str,str]]:
    mappings = []
    with csv_path.open(newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row or len(row) < 2:
                continue
            old = row[0]
            new = row[1]
            mappings.append((old, new))
    return mappings

def build_replacements(mappings, regex_mode, ignore_case, whole_word):
    compiled = []
    flags = re.MULTILINE
    if ignore_case:
        flags |= re.IGNORECASE
    for old, new in mappings:
        if regex_mode:
            try:
                pat = re.compile(old, flags)
            except re.error as e:
                raise SystemExit(f"Invalid regex pattern '{old}': {e}")
        else:
            esc = re.escape(old)
            if whole_word:
                esc = r'\b' + esc + r'\b'
            pat = re.compile(esc, flags)
        compiled.append((pat, new))
    return compiled

def process_file(path: Path, repls, dry_run: bool, backup_dir: Path|None, preview_lines: int, min_changes:int) -> Tuple[int,str]:
    try:
        text = text = path.read_text(encoding='utf-8', newline='')
    except Exception as e:
        print(f"[ERROR] Cannot read {path}: {e}")
        return 0, ""

    original = text
    total_changes = 0
    for pat, new in repls:
        new_text, n = pat.subn(new, text)
        if n:
            total_changes += n
            text = new_text

    if total_changes < min_changes:
        return 0, ""

    diff_text = ""
    if text != original:
        # show a short unified diff
        orig_lines = original.splitlines(keepends=True)
        new_lines = text.splitlines(keepends=True)
        ud = difflib.unified_diff(orig_lines, new_lines, fromfile=str(path), tofile=str(path)+" (new)")
        diff_lines = []
        for i, line in enumerate(ud):
            if i >= preview_lines:
                break
            diff_lines.append(line.rstrip('\n'))
        diff_text = "\n".join(diff_lines)

        if not dry_run:
            # create backup
            if backup_dir:
                backup_dir.mkdir(parents=True, exist_ok=True)
                dest = backup_dir / (path.name + ".bak")
                shutil.copy2(path, dest)
            else:
                bak = path.with_suffix(path.suffix + ".bak")
                if not bak.exists():
                    shutil.copy2(path, bak)
                else:
                    # create numbered bak if one exists already
                    i = 1
                    while True:
                        bakn = path.with_suffix(path.suffix + f".bak{i}")
                        if not bakn.exists():
                            shutil.copy2(path, bakn)
                            break
                        i += 1
            # write new content
            path.write_text(text, encoding='utf-8')
    return total_changes, diff_text

def parse_exts(exts_str):
    items = [x.strip() for x in exts_str.split(',') if x.strip()]
    out = []
    for it in items:
        if not it.startswith('.'):
            it = '.' + it
        out.append(it.lower())
    return set(out)

def main():
    p = argparse.ArgumentParser(description="Bulk find-and-replace across files using a mapping CSV.")
    p.add_argument('root', help='root folder to walk')
    p.add_argument('-m','--mapping', required=True, help='mapping CSV file (old,new)')
    p.add_argument('--regex', action='store_true', help='treat left-hand side as regex')
    p.add_argument('--ignore-case', action='store_true', help='case-insensitive matching')
    p.add_argument('--whole-word', action='store_true', help='match whole words only (non-regex mode)')
    p.add_argument('--exts', default='.html,.htm,.md', help='comma-separated extensions to process (default: .html,.htm,.md)')
    p.add_argument('--commit', action='store_true', help='write changes (default is dry-run)')
    p.add_argument('--backup-dir', help='directory to copy backups to (instead of .bak files next to originals)')
    p.add_argument('--preview-lines', type=int, default=20, help='lines of unified diff to show per file (default 20)')
    p.add_argument('--min-changes', type=int, default=1, help='only show/save files with at least this many replacements (default 1)')
    args = p.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit("root must be a directory")

    mapping_csv = Path(args.mapping)
    if not mapping_csv.exists():
        raise SystemExit("mapping CSV not found: " + str(mapping_csv))

    mappings = load_mappings(mapping_csv)
    if not mappings:
        raise SystemExit("no mappings found in mapping CSV")

    exts = parse_exts(args.exts)
    repls = build_replacements(mappings, args.regex, args.ignore_case, args.whole_word)

    backup_dir = Path(args.backup_dir).resolve() if args.backup_dir else None
    if backup_dir:
        backup_dir.mkdir(parents=True, exist_ok=True)

    dry_run = not args.commit

    total_files = 0
    total_changed_files = 0
    total_replacements = 0

    for fp in root.rglob('*'):
        if fp.is_file() and fp.suffix.lower() in exts:
            total_files += 1
            changes, diff_text = process_file(fp, repls, dry_run, backup_dir, args.preview_lines, args.min_changes)
            if changes:
                total_changed_files += 1
                total_replacements += changes
                mode = "DRY" if dry_run else "COMMITTED"
                print(f"[{mode}] {fp} -> replacements: {changes}")
                if diff_text:
                    print(diff_text)
                    print("-" * 72)

    print(f"Scanned {total_files} files, changed {total_changed_files} files, total replacements: {total_replacements}")
    if dry_run:
        print("Dry-run mode: no files were modified. Re-run with --commit to apply changes.")

if __name__ == '__main__':
    main()
