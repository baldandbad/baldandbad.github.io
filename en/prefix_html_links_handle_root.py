#!/usr/bin/env python3
"""
prefix_html_links_handle_root.py

Add a prefix (e.g. /en) to HTML page links in <a href=""> and <link href="">.

Usage (dry-run):
  python prefix_html_links_handle_root.py "C:\path\to\folder" --prefix /en/

Apply (create .bak backups):
  python prefix_html_links_handle_root.py "C:\path\to\folder" --prefix /en/ --commit

Notes:
 - Only touches hrefs that end with .html/.htm (or end with '/' or have no dot in last segment if you set --allow-pretty).
 - Will not double-prefix if href already starts with the given prefix.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit
from bs4 import BeautifulSoup

SKIP_STARTS = ('http://', 'https://', '//', 'mailto:', 'tel:', 'javascript:', '#')
HTML_SUFFIXES = ('.html', '.htm')

def is_external_or_fragment(href: str | None) -> bool:
    if href is None:
        return True
    s = str(href).strip()
    if s == '':
        return True
    for p in SKIP_STARTS:
        if s.lower().startswith(p):
            return True
    # treat Windows absolute paths as external
    if len(s) > 1 and s[1:2] == ':' and s[0].isalpha():
        return True
    return False

def ensure_prefix_for_html(root_dir: Path, current_file: Path, href: str, prefix: str, allow_pretty: bool) -> str:
    """
    Return possibly-updated href:
    - If href already starts with prefix (prefix can be '/en' or '/en/'), return it unchanged.
    - If href is external/fragment, return unchanged.
    - If href is root-relative (starts with '/'): if it points to .html/.htm or (allow_pretty True and directory/no-ext), prefix it.
    - If href is relative (no leading '/'): resolve it relative to current_file and return prefix + resolved path.
    """
    if href is None:
        return href
    s = str(href).strip()
    if s == '':
        return s

    # normalize prefix (no trailing slash except single '/')
    pref = prefix.rstrip('/')
    if pref == '':
        pref = '/'

    # if already prefixed with /en or /en/ do nothing
    if pref != '/' and (s.startswith(pref + '/') or s == pref):
        return s

    if is_external_or_fragment(s):
        return s

    parsed = urlsplit(s)
    path = parsed.path or ''
    # already root-relative
    if path.startswith('/'):
        last = PurePosixPath(path).name
        suffix = PurePosixPath(last).suffix.lower()
        is_html = suffix in HTML_SUFFIXES
        is_dir = last == ''
        no_ext = '.' not in last
        if is_html or is_dir or (allow_pretty and no_ext):
            # join prefix and path without double slashes
            if pref == '/':
                new_path = path
            else:
                new_path = '/' + '/'.join([pref.lstrip('/').rstrip('/'), path.lstrip('/')])
            new_path = os.path.normpath(new_path).replace(os.path.sep, '/')
            return urlunsplit(('', '', new_path, parsed.query or '', parsed.fragment or ''))
        else:
            return s

    # relative path (doesn't start with '/'): resolve against current file
    try:
        resolved = (current_file.parent / path).resolve()
    except Exception:
        resolved = Path(os.path.normpath(str(current_file.parent / path)))
    try:
        rel_to_root = os.path.relpath(str(resolved), str(root_dir.resolve()))
    except Exception:
        rel_to_root = str(resolved)
    rel_posix = PurePosixPath(rel_to_root).as_posix().lstrip('/')

    if pref == '/':
        new_path = '/' + rel_posix
    else:
        new_path = '/' + '/'.join([pref.lstrip('/').rstrip('/'), rel_posix])
    new_path = os.path.normpath(new_path).replace(os.path.sep, '/')
    return urlunsplit(('', '', new_path, parsed.query or '', parsed.fragment or ''))

def process_file(root_dir: Path, file_path: Path, prefix: str, allow_pretty: bool, dry_run: bool) -> bool:
    changed = False
    try:
        text = file_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"[ERROR] cannot read {file_path}: {e}")
        return False

    soup = BeautifulSoup(text, 'html.parser')

    for node in soup.find_all(['a', 'link']):
        if not node.has_attr('href'):
            continue
        orig = node.get('href')
        if orig is None:
            continue
        new = ensure_prefix_for_html(root_dir, file_path, orig, prefix, allow_pretty)
        if new != orig:
            node['href'] = new
            changed = True

    if changed:
        if dry_run:
            print(f"[DRY-RUN] Would update: {file_path}")
        else:
            bak = file_path.with_suffix(file_path.suffix + '.bak')
            try:
                if not bak.exists():
                    file_path.rename(bak)
                file_path.write_text(str(soup), encoding='utf-8')
                print(f"[UPDATED] {file_path} (backup {bak.name})")
            except Exception as e:
                print(f"[ERROR] writing {file_path}: {e}")
                if bak.exists() and not file_path.exists():
                    bak.rename(file_path)
                    print(f"[INFO] restored {file_path} from backup")
    return changed

def main():
    p = argparse.ArgumentParser()
    p.add_argument('root', help='folder to scan (e.g. C:\\path\\to\\en)')
    p.add_argument('--prefix', required=True, help='prefix to add (e.g. /en/ or /en)')
    p.add_argument('--commit', action='store_true', help='apply changes (dry-run by default)')
    p.add_argument('--exts', default='.html,.htm', help='comma-separated extensions to scan')
    p.add_argument('--allow-pretty', action='store_true', help='also prefix pretty URLs with no extension or directory links')
    args = p.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        raise SystemExit("root not found: " + str(root))
    exts = { (e if e.startswith('.') else '.'+e).lower() for e in args.exts.split(',') }
    dry = not args.commit
    prefix = args.prefix

    total = changed = 0
    for pth in root.rglob('*'):
        if not pth.is_file(): continue
        if pth.suffix.lower() not in exts: continue
        total += 1
        try:
            if process_file(root, pth, prefix, args.allow_pretty, dry):
                changed += 1
        except Exception as e:
            print(f"[ERROR] {pth}: {e}")

    print(("DRY-RUN" if dry else "COMMIT") + f": scanned {total} files, changed {changed} files.")

if __name__ == '__main__':
    main()
