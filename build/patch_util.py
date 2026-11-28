import sys
def patch(path, pairs):
    s = open(path).read()
    for old, new in pairs:
        c = s.count(old)
        if c != 1:
            sys.exit(f"patch failed ({c} matches) for:\n{old[:200]}")
        s = s.replace(old, new)
    open(path, 'w').write(s)
