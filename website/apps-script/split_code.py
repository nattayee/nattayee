#!/usr/bin/env python3
"""Split Code.gs into files of at most MAX_LINES lines (apps-script/split/Code1.gs, Code2.gs, ...).

Some copy tools only hand over the first 100 lines of a file. Apps Script joins every .gs file of a
project into one program, so the server works the same when pasted as several short files.

Cuts are made only at blank lines followed by a top-level statement (a line that starts in column 0),
which in Code.gs is always the start of a new function, variable or comment block. Any file that uses
ACTIONS starts with `var ACTIONS = ACTIONS || {};`, so the files can load in any order.

    python3 website/apps-script/split_code.py
"""
import pathlib

MAX_LINES = 90
HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "Code.gs"
OUT = HERE / "split"
ACTIONS_LINE = "var ACTIONS = ACTIONS || {};"


def main():
    lines = SRC.read_text(encoding="utf-8").split("\n")
    while lines and (not lines[-1].strip() or lines[-1].startswith("// ----- สิ้นสุดไฟล์")):
        lines.pop()

    # Indexes where a new top-level statement begins after a blank line.
    starts = [0] + [i for i in range(1, len(lines))
                    if not lines[i - 1].strip() and lines[i][:1] not in ("", " ", "}", ")", "]")]

    chunks, begin = [], 0
    while begin < len(lines):
        limit = begin + MAX_LINES - 6  # room for header, ACTIONS line, blank lines and footer
        cut = max((s for s in starts if begin < s <= limit), default=None)
        if cut is None or len(lines) <= limit:
            cut = len(lines) if len(lines) <= limit else cut
        if cut is None:
            raise SystemExit(f"no safe cut between lines {begin + 1} and {limit + 1}; shorten that function")
        chunks.append(lines[begin:cut])
        begin = cut

    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("Code*.gs"):
        old.unlink()
    total = len(chunks)
    for n, chunk in enumerate(chunks, 1):
        body = [l for l in chunk]
        while body and not body[-1].strip():
            body.pop()
        head = [f"// Code{n}.gs — ส่วนที่ {n}/{total} ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code{total} ให้ครบ)"]
        if any(l.startswith("ACTIONS.") for l in body) and ACTIONS_LINE not in body:
            head.append(ACTIONS_LINE)
        foot = ["", f"// ----- จบ Code{n}.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----"]
        text = "\n".join(head + [""] + body + foot) + "\n"
        if len(text.split("\n")) - 1 > MAX_LINES:
            raise SystemExit(f"Code{n}.gs is longer than {MAX_LINES} lines")
        (OUT / f"Code{n}.gs").write_text(text, encoding="utf-8")
        print(f"split/Code{n}.gs  {len(text.splitlines())} lines")


if __name__ == "__main__":
    main()
