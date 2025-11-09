#!/usr/bin/env python3
"""
convert_to_root_relative.py

Usage:
  # dry-run (default): just prints which files would be updated
  python convert_to_root_relative.py /path/to/site-root

  # actually write files and create .bak backups
  python convert_to_root_relative.py /path/to/site-root --commit

Dependencies:
  pip install beautifulsoup4 lxml
"""

from __future__ import annotations
import argparse
import os
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from bs4 import BeautifulSoup

# Extensions to process
VALID_EXTS = {'.html', '.htm'}

# Tag -> attributes to inspect
LINK_ATTRS = {
    'a': ['href'],
    'link': ['href'],
    'script': ['src'],
    'img': ['src', 'srcset'],
    'source': ['src', 'srcset'],
    'iframe': ['src'],
    'form': ['action'],
    'video': ['src', 'poster'],
    'audio': ['src'],
}

SKIP_PREFIXES = ('http://', 'https://', '//', 'mailto:', 'tel:', 'javascript:')

TEMPLATE_EXPR_RE = re.compile(r"\$\{([^}]+)\}")

def is_skippable(val: str | None) -> bool:
    if val is None:
        return True
    s = str(val).strip()
    if s == '' or s.startswith('#'):
        return True
    for p in SKIP_PREFIXES:
        if s.startswith(p):
            return True
    return False

def normalize_root_path(p: str) -> str:
    return '/' + os.path.normpath(str(p)).lstrip(os.path.sep).replace(os.path.sep, '/')

def rewrite_srcset(root_dir: Path, current_file: Path, srcset_val) -> str:
    if srcset_val is None:
        return srcset_val
    srcset_val = str(srcset_val)
    parts = [p.strip() for p in srcset_val.split(',') if p.strip()]
    out = []
    for part in parts:
        tokens = part.split()
        if not tokens:
            continue
        url_token = tokens[0]
        descriptor = ' '.join(tokens[1:])
        new_url = make_root_relative(root_dir, current_file, url_token)
        out.append(new_url + ((' ' + descriptor) if descriptor else ''))
    return ', '.join(out)

def rewrite_template_literals(root_dir: Path, current_file: Path, val: str) -> str:
    """Rewrite quoted string literals inside ${...} template expressions to root-relative paths."""
    if not isinstance(val, str) or '${' not in val:
        return val

    def replace_inner(m):
        inner = m.group(1)

        def repl_quote(qm):
            quote = qm.group(1)
            path = qm.group(2)
            # if the quoted token is skippable or already root-relative, leave it
            if is_skippable(path) or path.startswith('/'):
                return qm.group(0)
            try:
                new_path = make_root_relative(root_dir, current_file, path)
                return f"{quote}{new_path}{quote}"
            except Exception:
                # on any failure, return original
                return qm.group(0)

        # replace quoted substrings inside the template expression only
        # matches '...' or "..."
        new_inner = re.sub(r"(['\"])(.+?)\1", lambda mm: repl_quote(mm), inner)
        return "${" + new_inner + "}"

    return TEMPLATE_EXPR_RE.sub(replace_inner, val)

def make_root_relative(root_dir: Path, current_file: Path, val) -> str:
    """
    Resolve val relative to current_file and return a root-relative path (string starting with '/').
    Leaves absolute URLs, protocol-relative, mailto:, tel:, and fragments untouched.
    """
    if val is None:
        return val
    # Join list/tuple into a space-separated string (BS may return lists for some attributes)
    if isinstance(val, (list, tuple)):
        val = ' '.join(str(x) for x in val)
    val = str(val).strip()
    if val == '':
        return val

    if is_skippable(val):
        return val

    parsed = urlsplit(val)
    # If it has a scheme or netloc, leave as-is
    if parsed.scheme or parsed.netloc:
        return val

    path = parsed.path or ''
    # already root-relative
    if path.startswith('/'):
        new_path = normalize_root_path(path)
        # urlunsplit requires strings for all components; use empty strings for scheme/netloc
        return urlunsplit(('', '', new_path, parsed.query or '', parsed.fragment or ''))

    # resolve relative to the current file parent
    current_parent = current_file.parent
    try:
        resolved = (current_parent / path).resolve()
    except Exception:
        # fallback: build a normalized path string
        resolved = Path(os.path.normpath(str(current_parent / path)))

    try:
        root_resolved = root_dir.resolve()
        # compute relative path from root
        rel_str = os.path.relpath(str(resolved), str(root_resolved))
        rel = Path(rel_str)
    except Exception as e:
        # if relpath fails, warn and fallback to a normalized absolute-ish path under root
        print(f"[WARN] relpath failed for {resolved} relative to {root_dir}: {e}")
        rel = Path(os.path.normpath(str(resolved)))

    new_path = '/' + str(rel).replace(os.path.sep, '/')
    return urlunsplit(('', '', new_path, parsed.query or '', parsed.fragment or ''))

def process_file(root_dir: Path, file_path: Path, dry_run: bool = True) -> bool:
    changed = False
    try:
        text = file_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"[ERROR] Could not read {file_path}: {e}")
        return False

    soup = BeautifulSoup(text, 'lxml')

    for tag, attrs in LINK_ATTRS.items():
        for node in soup.find_all(tag):
            for attr in attrs:
                if not node.has_attr(attr):
                    continue
                orig = node.get(attr)
                if orig is None:
                    continue

                # handle srcset specially
                if attr == 'srcset':
                    try:
                        new = rewrite_srcset(root_dir, file_path, orig)
                    except Exception as e:
                        print(f"[ERROR] Failed to rewrite srcset on {file_path} attr={attr} orig_type={type(orig)}: {e}")
                        continue
                else:
                    # if attribute contains a template expression, rewrite quoted literals inside it
                    if isinstance(orig, str) and '${' in orig:
                        try:
                            new = rewrite_template_literals(root_dir, file_path, orig)
                            # if rewriting template literals didn't change anything, fall back to normal resolution
                            if new == orig:
                                new = make_root_relative(root_dir, file_path, orig)
                        except Exception as e:
                            print(f"[ERROR] rewrite_template_literals failed on {file_path} attr={attr} orig_type={type(orig)}: {e}")
                            try:
                                new = make_root_relative(root_dir, file_path, orig)
                            except Exception as e2:
                                print(f"[ERROR] make_root_relative also failed on {file_path}: {e2}")
                                continue
                    else:
                        try:
                            new = make_root_relative(root_dir, file_path, orig)
                        except Exception as e:
                            print(f"[ERROR] Failed to rewrite {attr} on {file_path} orig_type={type(orig)}: {e}")
                            continue

                # If BeautifulSoup stored attribute as non-str (e.g., list), compare text forms
                if new != orig:
                    node[attr] = new
                    changed = True

    if changed:
        if dry_run:
            print(f"[DRY-RUN] Would update: {file_path}")
        else:
            backup = file_path.with_suffix(file_path.suffix + '.bak')
            try:
                if not backup.exists():
                    file_path.rename(backup)
                # write out updated HTML
                file_path.write_text(str(soup), encoding='utf-8')
                print(f"[UPDATED] {file_path} (backup created: {backup.name})")
            except Exception as e:
                print(f"[ERROR] Failed to write update for {file_path}: {e}")
                # Attempt to restore backup if rename succeeded but write failed
                if backup.exists() and not file_path.exists():
                    backup.rename(file_path)
                    print(f"[INFO] Restored original from {backup.name}")
    return changed

def main():
    parser = argparse.ArgumentParser(description="Convert relative links in HTML to root-relative.")
    parser.add_argument('root', help='site root directory to walk')
    parser.add_argument('--commit', action='store_true', help='actually modify files (default: dry-run)')
    parser.add_argument('--exts', default='.html,.htm', help='comma-separated file extensions to process')
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit('Root must be a directory')

    exts = {e if e.startswith('.') else '.' + e for e in args.exts.split(',')}

    dry = not args.commit

    for p in root.rglob('*'):
        if p.suffix.lower() in exts and p.is_file():
            try:
                process_file(root, p, dry_run=dry)
            except Exception as e:
                print('ERROR processing', p, e)

if __name__ == '__main__':
    main()
