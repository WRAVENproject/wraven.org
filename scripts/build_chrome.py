#!/usr/bin/env python3
"""Copy the shared head, header, and footer into every redesigned page.

Each page holds three marker pairs:
  <!-- CHROME:HEAD:START --> ... <!-- CHROME:HEAD:END -->
  <!-- CHROME:HEADER:START --> ... <!-- CHROME:HEADER:END -->
  <!-- CHROME:FOOTER:START --> ... <!-- CHROME:FOOTER:END -->
The script replaces the text between each pair with the matching file in
scripts/chrome/. It also marks the current page in the main nav.
Run it after you edit a file in scripts/chrome/:  python3 scripts/build_chrome.py
"""
import hashlib
import pathlib
import re
import json
import html as html_lib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = ROOT / "scripts" / "chrome"

# Page file -> the nav href that is the current page (None for no match).
PAGES = {
    "index.html": None,
    "join/index.html": "/join/",
    "work-with-us/index.html": "/work-with-us/",
    "research/index.html": "/research/",
    "partners/index.html": "/work-with-us/",
    "ethics_agreement/index.html": "/ethics_agreement/",
    "code_of_conduct/index.html": "/ethics_agreement/",
    "disclosure/index.html": "/ethics_agreement/",
    "privacy/index.html": None,
    "404.html": None,
}


def block(name, text):
    return f"<!-- CHROME:{name}:START -->\n{text.rstrip()}\n    <!-- CHROME:{name}:END -->"


def short_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def social_tags(html):
    """Open Graph and Twitter tags that the page does not set itself.
    Values come from the page's own title, description, and canonical URL."""
    head = re.sub(r"<!-- CHROME:HEAD:START -->.*?<!-- CHROME:HEAD:END -->", "", html.split("</head>")[0], flags=re.S)
    def meta(pattern):
        m = re.search(pattern, head, re.S)
        return m.group(1).strip() if m else None
    title = meta(r"<title>(.*?)</title>")
    desc = meta(r'<meta name="description" content="([^"]*)"')
    url = meta(r'<link rel="canonical" href="([^"]*)"')
    tags = []
    if title and 'property="og:title"' not in head:
        tags.append(f'<meta property="og:title" content="{title}">')
    if desc and 'property="og:description"' not in head:
        tags.append(f'<meta property="og:description" content="{desc}">')
    if url and 'property="og:url"' not in head:
        tags.append(f'<meta property="og:url" content="{url}">')
    if 'property="og:type"' not in head:
        tags.append('<meta property="og:type" content="website">')
    if 'property="og:image"' not in head:
        tags.append('<meta property="og:image" content="https://wraven.org/imgs/og-2026.png">')
    if 'name="twitter:card"' not in head:
        tags.append('<meta name="twitter:card" content="summary_large_image">')
    if 'property="og:site_name"' not in head:
        tags.append('<meta property="og:site_name" content="WRAVEN">')
    if 'property="og:locale"' not in head:
        tags.append('<meta property="og:locale" content="en_US">')
    if "og-2026.png" in "".join(tags) + head and 'property="og:image:alt"' not in head:
        tags.append('<meta property="og:image:width" content="1200">')
        tags.append('<meta property="og:image:height" content="630">')
        tags.append('<meta property="og:image:alt" content="The WRAVEN raven and wordmark on a dark background.">')
    return "\n".join("    " + t for t in tags)


# Short names for the breadcrumb trail in search results.
CRUMBS = {
    "join/index.html": "Join",
    "work-with-us/index.html": "Work with us",
    "research/index.html": "Research",
    "partners/index.html": "Supporters",
    "ethics_agreement/index.html": "Ethics agreement",
    "code_of_conduct/index.html": "Code of conduct",
    "disclosure/index.html": "Vulnerability disclosure",
    "privacy/index.html": "Privacy",
}


def plain(fragment):
    text = re.sub(r"<[^>]+>", "", fragment)
    return " ".join(html_lib.unescape(text).split())


def structured_data(rel, html):
    """schema.org JSON-LD: a breadcrumb trail on inner pages, and FAQPage
    data for every page that has a .faq block of <details> questions."""
    blocks = []
    url = re.search(r'<link rel="canonical" href="([^"]*)"', html)
    if rel in CRUMBS and url:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "WRAVEN", "item": "https://wraven.org/"},
                {"@type": "ListItem", "position": 2, "name": CRUMBS[rel], "item": url.group(1)},
            ],
        })
    faqs = re.findall(r"<details[^>]*>\s*<summary>(.*?)</summary>\s*(.*?)</details>", html, re.S)
    if faqs:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": plain(q), "acceptedAnswer": {"@type": "Answer", "text": plain(a)}}
                for q, a in faqs
            ],
        })
    return "\n".join(
        '    <script type="application/ld+json">' + json.dumps(b, ensure_ascii=False).replace("<", "\\u003c") + "</script>" for b in blocks
    )


def main():
    parts = {n: (CHROME / f"{n.lower()}.html").read_text(encoding="utf-8") for n in ("HEAD", "HEADER", "FOOTER")}
    # Versioned asset URLs, so a browser never pairs new HTML with an old cached stylesheet.
    parts["HEAD"] = parts["HEAD"].replace("{CSS_HASH}", short_hash(ROOT / "assets" / "site.css"))
    parts["HEAD"] = parts["HEAD"].replace("{JS_HASH}", short_hash(ROOT / "assets" / "site.js"))
    missing = []
    for rel, current in PAGES.items():
        path = ROOT / rel
        if not path.exists():
            missing.append(rel)
            continue
        html = path.read_text(encoding="utf-8")
        if "<!-- CHROME:HEAD:START -->" not in html:
            missing.append(rel + " (no markers yet)")
            continue
        for name, text in parts.items():
            if name == "HEAD":
                text = text.replace("{SOCIAL}", "\n".join(x for x in (social_tags(html), structured_data(rel, html)) if x))
            if name == "HEADER" and current:
                # "page" when the link is this page, "true" when it is the section this page belongs to.
                own = "/" + rel.replace("index.html", "")
                kind = "page" if own == current else "true"
                text = text.replace(f'<a href="{current}">', f'<a href="{current}" aria-current="{kind}">', 1)
            pattern = re.compile(rf"<!-- CHROME:{name}:START -->.*?<!-- CHROME:{name}:END -->", re.S)
            if not pattern.search(html):
                sys.exit(f"ERROR: {rel} has no CHROME:{name} markers")
            html = pattern.sub(lambda _: block(name, text), html)
        path.write_text(html, encoding="utf-8")
        print(f"updated {rel}")
    if missing:
        print("skipped:", ", ".join(missing))


if __name__ == "__main__":
    main()
