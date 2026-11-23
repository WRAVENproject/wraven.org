# wraven.org

This is the source for [wraven.org](https://wraven.org), the website of WRAVEN. WRAVEN is a student cybersecurity research group at Western Michigan University.

## How the site works

- The site is static HTML, CSS, and JavaScript. It has no framework and no build step for content.
- GitHub Pages hosts the site. Cloudflare is in front of it.
- `scripts/build_chrome.py` puts the shared head, header, and footer into each page. It also adds the social tags and the structured data for search engines. Run it after you change a page, `assets/site.css`, `assets/site.js`, or a file in `scripts/chrome/`.
- `worker/` is a Cloudflare Worker for the contact form on `/work-with-us/`. Read `worker/README.md` before you change it.

## Automatic updates

- `.github/workflows/threat-feed.yml` runs every day. It adds new entries from the CISA Known Exploited Vulnerabilities catalog to the home page.
- `.github/workflows/research-feed.yml` runs every Monday. It copies new posts from [blog.wraven.org](https://blog.wraven.org) to `/research/`.

## Run it locally

```bash
git clone https://github.com/WRAVENproject/wraven.org.git
cd wraven.org
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The contact form needs the Worker. To run the site and the Worker together, run `npx wrangler dev` in `worker/`.

## Security

- Disclosure policy: [wraven.org/disclosure](https://wraven.org/disclosure/) and `/.well-known/security.txt`
- PGP key: `keys/wraven.asc`
- The site has no trackers and no analytics.

## Contact

- Email: contact@wraven.org
- Discord: [wraven.org/discord](https://wraven.org/discord/)
- ExperienceWMU: [experiencewmu.wmich.edu/organization/wraven](https://experiencewmu.wmich.edu/organization/wraven)

If you are not a member and want to help, write to us or ask on Discord.
