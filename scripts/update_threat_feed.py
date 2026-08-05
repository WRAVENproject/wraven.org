#!/usr/bin/env python3
"""
WRAVEN threat feed updater.

Pulls the newest entries from the CISA Known Exploited Vulnerabilities (KEV)
catalog and rewrites the homepage threat feed between the
THREAT-FEED:START / THREAT-FEED:END markers in index.html.

No AI, no judgment calls — KEV is structured, curated data. Runs daily via
GitHub Actions (.github/workflows/threat-feed.yml) or manually:

    python3 scripts/update_threat_feed.py
"""

import json
import re
import sys
import urllib.error
import urllib.request
from html import escape
from pathlib import Path

KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
INDEX = Path(__file__).resolve().parent.parent / "index.html"
NUM_ENTRIES = 3

# CISA's CDN rejects the default python-urllib User-Agent, so set our own.
USER_AGENT = "wraven-threat-feed/1.0 (+https://wraven.org)"

START = "<!-- THREAT-FEED:START - rows below are auto-updated daily from the CISA KEV catalog. Do not edit by hand. -->"
END = "<!-- THREAT-FEED:END -->"

# The last-updated stamp is written by this same run, so it can never disagree
# with the rows. It carries the newest row's dateAdded, not the run date.
UPDATED_START = "<!-- FEED-UPDATED:START -->"
UPDATED_END = "<!-- FEED-UPDATED:END -->"

# (keyword in vulnerabilityName/shortDescription, type label, MITRE technique)
TYPE_RULES = [
    ("command injection", "INJECTION", "T1190"),
    ("sql injection", "INJECTION", "T1190"),
    ("injection", "INJECTION", "T1190"),
    ("authentication", "AUTH-BYPASS", "T1190"),
    ("authorization", "AUTH-BYPASS", "T1190"),
    ("access control", "AUTH-BYPASS", "T1190"),
    ("deserialization", "EXPLOIT", "T1190"),
    ("path traversal", "TRAVERSAL", "T1190"),
    ("directory traversal", "TRAVERSAL", "T1190"),
    ("ssrf", "SSRF", "T1190"),
    ("cross-site scripting", "XSS", "T1059.007"),
    ("xss", "XSS", "T1059.007"),
    ("privilege escalation", "PRIV-ESC", "T1068"),
    ("use-after-free", "MEM-CORRUPT", "T1203"),
    ("out-of-bounds", "MEM-CORRUPT", "T1203"),
    ("buffer overflow", "MEM-CORRUPT", "T1203"),
    ("memory corruption", "MEM-CORRUPT", "T1203"),
    ("type confusion", "MEM-CORRUPT", "T1203"),
    ("code execution", "EXPLOIT", "T1190"),
    ("phishing", "PHISHING", "T1566"),
]


def classify(vuln):
    text = (vuln.get("vulnerabilityName", "") + " " + vuln.get("shortDescription", "")).lower()
    for keyword, label, technique in TYPE_RULES:
        if keyword in text:
            return label, technique
    return "EXPLOIT", "T1190"


def severity(vuln):
    # Everything in KEV is exploited in the wild; ransomware-linked = critical.
    if vuln.get("knownRansomwareCampaignUse", "").lower() == "known":
        return "critical"
    text = vuln.get("vulnerabilityName", "").lower()
    if any(k in text for k in ("remote code execution", "authentication", "out-of-bounds", "deserialization")):
        return "critical"
    return "high"


def row(vuln):
    cve = vuln["cveID"]
    label, technique = classify(vuln)
    sev = severity(vuln)
    title = f'{vuln["vendorProject"]} {vuln["product"]}: {vuln["vulnerabilityName"]}'
    # Trim redundant vendor/product prefixes KEV often duplicates in the name
    name = vuln["vulnerabilityName"]
    prefix = f'{vuln["vendorProject"]} {vuln["product"]}'
    if name.lower().startswith(prefix.lower()):
        title = name
    if len(title) > 110:
        title = title[:107].rstrip() + "…"
    return f"""                    <a href="https://nvd.nist.gov/vuln/detail/{escape(cve)}" class="threat-row" data-severity="{sev}" target="_blank" rel="noopener noreferrer">
                        <div class="threat-indicator"></div>
                        <time class="threat-date">{escape(vuln["dateAdded"])}</time>
                        <span class="threat-type">{escape(label)}</span>
                        <span class="threat-title">{escape(title)}</span>
                        <div class="threat-meta-tags">
                            <span class="ttag">{escape(cve)}</span>
                            <span class="ttag">{escape(technique)}</span>
                        </div>
                    </a>"""


def fetch_kev():
    req = urllib.request.Request(KEV_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def main():
    try:
        data = fetch_kev()
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        # A transient network/parse failure should not fail the workflow or
        # clobber the existing feed. Leave index.html untouched and exit clean.
        print(f"Could not fetch KEV catalog ({e}); leaving threat feed unchanged.")
        return

    catalog = data.get("vulnerabilities")
    if not isinstance(catalog, list):
        sys.exit("ERROR: KEV response has no 'vulnerabilities' list; index.html left unchanged.")

    vulns = sorted(catalog, key=lambda v: (v["dateAdded"], v["cveID"]), reverse=True)
    newest = vulns[:NUM_ENTRIES]

    # An empty or truncated catalog must never overwrite a good feed with a
    # partial one. Fail the run and leave the previous rows in place.
    if len(newest) < NUM_ENTRIES:
        sys.exit(
            f"ERROR: KEV catalog returned {len(newest)} entries, expected {NUM_ENTRIES}; "
            "index.html left unchanged."
        )

    html = INDEX.read_text(encoding="utf-8")

    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    if not pattern.search(html):
        sys.exit("ERROR: threat feed markers not found in index.html")

    stamp_pattern = re.compile(re.escape(UPDATED_START) + r".*?" + re.escape(UPDATED_END), re.DOTALL)
    if not stamp_pattern.search(html):
        sys.exit("ERROR: feed-updated markers not found in index.html")

    block = START + "\n" + "\n".join(row(v) for v in newest) + "\n                    " + END
    updated = pattern.sub(lambda _: block, html)

    newest_date = escape(newest[0]["dateAdded"])
    stamp = (
        UPDATED_START
        + f'\n                        <time class="feed-updated" datetime="{newest_date}">Updated {newest_date}</time>\n'
        + "                        " + UPDATED_END
    )
    updated = stamp_pattern.sub(lambda _: stamp, updated)

    if updated == html:
        print("Feed already up to date — no changes.")
        return

    INDEX.write_text(updated, encoding="utf-8")
    print(f"Updated threat feed with: {', '.join(v['cveID'] for v in newest)} (as of {newest_date})")


if __name__ == "__main__":
    main()
