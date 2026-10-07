#!/usr/bin/env python3
"""Bundle the website into apps-script/Index.html for a Google Apps Script web app.

Apps Script serves one HTML file, so styles, scripts and the hospital logos are inlined.
Run after changing any file in website/:

    python3 website/build_apps_script.py

then paste apps-script/Code.gs and apps-script/Index.html into the Apps Script project.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "apps-script" / "Index.html"
SCRIPTS = ["data.js", "auth.js", "chat.js", "dm.js", "quick.js", "menus.js", "status.js", "calendars.js", "notify.js", "app.js"]
IMAGES = ["assets/lpch-emblem.png", "assets/lpch-logo.png"]


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")

    for name in SCRIPTS:
        js = (ROOT / name).read_text(encoding="utf-8")
        if "</script" in js.lower():
            raise SystemExit(f"{name} contains '</script', which would end the inline script early")
        tag = f'<script src="{name}"></script>'
        if tag not in html:
            raise SystemExit(f"index.html no longer loads {name}")
        html = html.replace(tag, "<script>\n" + js + "\n</script>")

    for path in IMAGES:
        data = base64.b64encode((ROOT / path).read_bytes()).decode("ascii")
        html = html.replace(path, "data:image/png;base64," + data)

    # Apps Script sets the viewport through addMetaTag() in doGet; a favicon link is ignored there.
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(r'\s*<meta name="viewport"[^>]*>', "", html)

    # Literal attribute values only (skip ones built in JavaScript, which contain quotes or +).
    leftovers = re.findall(r'(?:src|href)="((?!https?:|data:|#|mailto:)[^"\'+]+)"', html)
    if leftovers:
        raise SystemExit(f"unresolved local references: {leftovers}")
    if "<?" in html:
        raise SystemExit("'<?' would be read as an Apps Script template tag")

    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT.parent)} ({len(html.encode('utf-8')) // 1024} KB)")


if __name__ == "__main__":
    main()
