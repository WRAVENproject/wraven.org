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
# The homepage shows the newest posts too, between its own markers.
HOME = Path(__file__).resolve().parent.parent / "index.html"
HOME_START = "<!-- HOME-RESEARCH:START - the newest posts, written by scripts/update_research.py. Do not edit by hand. -->"
HOME_END = "<!-- HOME-RESEARCH:END -->"
HOME_COUNT = 4
MAX_CARDS = 24
USER_AGENT = "wraven-research-mirror/1.0 (+https://wraven.org)"

START = "<!-- RESEARCH-FEED:START - cards below are auto-updated weekly from beehiiv. Do not edit by hand. -->"
END = "<!-- RESEARCH-FEED:END -->"

# Display name -> slug. First match (in this order) becomes a card's tag label.
RESEARCH_TAGS = ["Research Paper", "APT Report", "Malware Report", "Red Team"]


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


RESEARCH_SLUGS = [slugify(t) for t in RESEARCH_TAGS]
# Labels shown on the site. The blog's "APT Report" tag also covers crime
# groups such as Scattered Spider, so the site says "Threat report".
TAG_DISPLAY = {
    "research-paper": "Research paper",
    "apt-report": "Threat report",
    "malware-report": "Malware report",
    "red-team": "Red team",
}


def tag_slugs(post):
    """content_tags can be a list of strings or of {display, slug} objects."""
    slugs = []
    for tag in post.get("content_tags") or []:
        if isinstance(tag, dict):
            slugs.append(tag.get("slug") or slugify(tag.get("display", "")))
        else:
            slugs.append(slugify(str(tag)))
    return slugs


# Posts that stay on the blog but are not shown in the /research/ mirror.
# Match on the URL slug, so a title edit does not bring a post back.
EXCLUDED_SLUGS = {
    "disrupting-a-phishing-operation-technical-breakdown",
}


def is_excluded(post):
    url = post_url(post)
    return any(url.rstrip("/").endswith("/p/" + slug) for slug in EXCLUDED_SLUGS)


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

def post_datetime(post):
    value = post.get("publish_date") or post.get("displayed_date") or post.get("scheduled_at")
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, OSError, OverflowError):
        return None


def home_item(post):
    url = post_url(post)
    slug = post_slug(post)
    title = TITLES.get(slug) or post.get("title", "").strip()
    desc = SUBTITLES.get(slug) or trim(post.get("subtitle") or post.get("preview_text") or "", 90)
    dt = post_datetime(post)
    month = dt.strftime("%Y-%m") if dt else ""
    label = dt.strftime("%b %Y") if dt else ""
    return (f'                    <li><time datetime="{month}">{escape(label)}</time>'
            f'<span><a href="{escape(url, quote=True)}">{escape(title)}</a><span class="desc">{escape(desc)}</span></span>'
            f'<span class="kind">{escape(display_tag(post))}</span></li>')


def update_home(research):
    html = HOME.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(HOME_START) + r".*?" + re.escape(HOME_END), re.DOTALL)
    if not pattern.search(html):
        print("Homepage research markers not found; leaving index.html unchanged.")
        return
    block = HOME_START + "\n" + "\n".join(home_item(p) for p in research[:HOME_COUNT]) + "\n                    " + HOME_END
    updated = pattern.sub(lambda _: block, html)
    if updated != html:
        HOME.write_text(updated, encoding="utf-8")
        print("Updated the homepage research list.")


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
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
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


# Plain titles and subtitles for the site, keyed by the post's URL slug. The
# blog keeps its own text. A post that is not listed here uses the blog's
# title and subtitle. Add a line here when a new post's subtitle needs work.
TITLES = {
    "wraven-threat-report-loki-c2": "WRAVEN Threat Report: Loki C2",
    "lazarus-group-apt-update": "Lazarus Group: APT Update",
    "the-ransomware-boom-isn-t-slowing-down-here-s-who-s-getting-hit-84ee": "The Ransomware Boom Isn't Slowing Down",
}
SUBTITLES = {
    "the-phone-is-the-payload": "Silent Ransom Group's callback extortion against law firms",
    "wraven-intel-brief-stryker-attack": "The Stryker incident and Iran-linked Handala activity",
    "qilin-a-look-inside-a-modern-ransomware-operation": "How a ransomware-as-a-service group runs",
    "the-ransomware-boom-isn-t-slowing-down-here-s-who-s-getting-hit-84ee": "Which organizations ransomware groups hit in 2025, and how Michigan is affected",
    "iranian-cyber-actors-escalate-targeting-of-u-s-networks": "Iran-aligned activity against U.S. networks",
    "scattered-spider-tactics-targets-and-wraven-s-ongoing-threat-intel-tracking": "How a small crew pulls off multi-million dollar breaches",
    "red-team-corner-phishing": "What makes a phishing lure believable, from a red team's view",
    "wraven-threat-report-loki-c2": "How the Loki C2 red-team tool hides inside signed Electron apps",
    "lazarus-investigation": "A multi-month investigation of the North Korean group",
    "lazarus-group-apt-update": "Recent activity of the North Korean group",
    "applejeus-malware-report": "Malware that the Lazarus Group spreads through fake trading apps",
    "malware-report-ghostspider": "A backdoor used by the Chinese group Salt Typhoon",
}


def post_slug(post):
    return post_url(post).rstrip("/").rsplit("/p/", 1)[-1]


def card(post):
    url = post_url(post)
    slug = post_slug(post)
    tag = display_tag(post)
    title = TITLES.get(slug) or post.get("title", "").strip()
    desc = SUBTITLES.get(slug) or trim(post.get("subtitle") or post.get("preview_text") or "")
    date = post_date(post)
    # The title comes first in the source, so a screen reader hears it first.
    # The stylesheet places the date on the left.
    return f"""                <a href="{escape(url, quote=True)}" class="research-card">
                    <h3 class="research-title">{escape(title)}</h3>
                    <p class="research-desc">{escape(desc)}</p>
                    <span class="research-meta">{escape(date)}</span>
                    <span class="research-tag">{escape(tag)}</span>
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
        and not is_excluded(p)
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

    update_home(research)

    if updated == html:
        print("Research mirror already up to date — no changes.")
        return

    PAGE.write_text(updated, encoding="utf-8")
    print(f"Updated research mirror with {len(research)} posts.")


if __name__ == "__main__":
    main()
