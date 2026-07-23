#!/usr/bin/env python3
"""
WRAVEN research mirror updater.

Pulls published posts from the WRAVEN beehiiv publication, keeps the ones
tagged as substantive research (APT reports, research papers, malware
reports, red-team work), and rewrites the card grid on /research/ between
the RESEARCH-FEED:START / RESEARCH-FEED:END markers.

The filter is structured data from beehiiv content tags, not a judgment
call, so the page stays on-topic without any editorial step.

Runs weekly via GitHub Actions (.github/workflows/research-feed.yml) or
manually. Requires a beehiiv API key in the environment:

    BEEHIIV_API_KEY=... python3 scripts/update_research.py

Without the key the script exits cleanly and leaves the page untouched, so
a scheduled run before the secret is configured does not fail or wipe the
seeded cards.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html import escape
from pathlib import Path

PUBLICATION_ID = os.environ.get("BEEHIIV_PUBLICATION_ID", "pub_ec6a0878-0aa7-484d-992b-554fb80ef3fa")
API_BASE = "https://api.beehiiv.com/v2"
PAGE = Path(__file__).resolve().parent.parent / "research" / "index.html"
MAX_CARDS = 24
USER_AGENT = "wraven-research-mirror/1.0 (+https://wraven.org)"

START = "<!-- RESEARCH-FEED:START - cards below are auto-updated weekly from beehiiv. Do not edit by hand. -->"
END = "<!-- RESEARCH-FEED:END -->"

# Display name -> slug. First match (in this order) becomes a card's tag label.
RESEARCH_TAGS = ["Research Paper", "APT Report", "Malware Report", "Red Team"]


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


RESEARCH_SLUGS = [slugify(t) for t in RESEARCH_TAGS]
TAG_DISPLAY = dict(zip(RESEARCH_SLUGS, RESEARCH_TAGS))


def tag_slugs(post):
    """content_tags can be a list of strings or of {display, slug} objects."""
    slugs = []
    for tag in post.get("content_tags") or []:
        if isinstance(tag, dict):
            slugs.append(tag.get("slug") or slugify(tag.get("display", "")))
        else:
            slugs.append(slugify(str(tag)))
    return slugs


def is_research(post):
    return any(s in RESEARCH_SLUGS for s in tag_slugs(post))


def display_tag(post):
    slugs = set(tag_slugs(post))
    for slug in RESEARCH_SLUGS:  # priority order
        if slug in slugs:
            return TAG_DISPLAY[slug]
    return "Research"


def post_url(post):
    url = post.get("web_url") or post.get("url") or ""
    return url if re.match(r"^https?://", url) else ""

def post_date(post):
    """publish_date is a unix epoch (REST) or an ISO string; format 'Mon YYYY'."""
    value = post.get("publish_date") or post.get("displayed_date") or post.get("scheduled_at")
    if value is None:
        return ""
    try:
        if isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value, tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, OSError, OverflowError):
        return ""
    return dt.strftime("%b %Y")


def sort_key(post):
    value = post.get("publish_date") or post.get("displayed_date") or post.get("scheduled_at") or 0
    if isinstance(value, (int, float)):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, OSError, OverflowError):
        return 0


def trim(text, limit=200):
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:")
    return cut + "…"


def card(post):
    url = post_url(post)
    tag = display_tag(post)
    title = post.get("title", "").strip()
    desc = trim(post.get("subtitle") or post.get("preview_text") or "")
    date = post_date(post)
    return f"""                <a href="{escape(url, quote=True)}" class="research-card" target="_blank" rel="noopener noreferrer">
                    <span class="research-tag">{escape(tag)}</span>
                    <h3 class="research-title">{escape(title)}</h3>
                    <p class="research-desc">{escape(desc)}</p>
                    <span class="research-meta">{escape(date)}</span>
                </a>"""


def fetch_posts(api_key):
    posts = []
    page = 1
    while True:
        params = (
            f"?status=confirmed&limit=100&page={page}"
            "&order_by=publish_date&direction=desc"
        )
        url = f"{API_BASE}/publications/{PUBLICATION_ID}/posts{params}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        posts.extend(payload.get("data", []))
        total_pages = (payload.get("total_pages") or payload.get("total_results_pages") or 1)
        if page >= total_pages:
            break
        page += 1
    return posts


def main():
    api_key = os.environ.get("BEEHIIV_API_KEY")
    if not api_key:
        print("BEEHIIV_API_KEY not set; leaving /research/ unchanged.")
        return

    try:
        posts = fetch_posts(api_key)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"Could not fetch beehiiv posts ({e}); leaving /research/ unchanged.")
        return

    research = [
        p for p in posts
        if is_research(p)
        and not p.get("hidden_from_feed")
        and not p.get("hide_from_feed")
        and post_url(p)
    ]
    research.sort(key=sort_key, reverse=True)
    research = research[:MAX_CARDS]

    if not research:
        print("No research-tagged posts returned; leaving /research/ unchanged.")
        return

    html = PAGE.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    if not pattern.search(html):
        sys.exit("ERROR: research feed markers not found in research/index.html")

    block = START + "\n" + "\n".join(card(p) for p in research) + "\n                " + END
    updated = pattern.sub(lambda _: block, html)

    if updated == html:
        print("Research mirror already up to date — no changes.")
        return

    PAGE.write_text(updated, encoding="utf-8")
    print(f"Updated research mirror with {len(research)} posts.")


if __name__ == "__main__":
    main()
