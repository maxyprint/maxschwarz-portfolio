#!/usr/bin/env python3
"""Generiert die crawlbare Ebene der Seite aus projects.json + seo.json.

Erzeugt:
  projekte/<slug>/index.html   eine echte Seite pro Projekt
  projekte/index.html          Übersicht
  leistungen/index.html        Landingpage für die Leistungs-Keywords
  sitemap.xml
  robots.txt
  _seo-head.html               Snippet (Meta + JSON-LD) für index.html
  _seo-footer.html             Snippet (Footer-Links) für index.html

Die Desktop-Oberfläche (index.html/app.js) bleibt unberührt; die Snippets
werden dort einmalig zwischen den Markern SEO-HEAD / SEO-FOOTER eingesetzt.

Aufruf:  python3 scripts/build-seo.py
"""

import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rd(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return json.load(f)


def wr(relpath, text):
    path = os.path.join(ROOT, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("  ", relpath)


def e(s):
    return html.escape(str(s or ""), quote=True)


DATA = rd("projects.json")
SEO = rd("seo.json")
SITE = SEO["site"]
PSEO = SEO["projects"]
BASE = SITE["url"].rstrip("/")

PROJECTS = [p for p in DATA["projects"] if p.get("slug") and p.get("items")]
MISSING = [p["slug"] for p in PROJECTS if p["slug"] not in PSEO]
if MISSING:
    raise SystemExit("seo.json fehlen Einträge für: " + ", ".join(MISSING))


def head(title, desc, canonical, og_image, extra_ld=""):
    """Gemeinsamer <head> für alle generierten Seiten."""
    img = BASE + "/" + og_image.lstrip("/")
    return f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(SITE['name'])}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="{e(img)}">
<meta property="og:locale" content="de_AT">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="{'../' * canonical.count('/', len(BASE) + 1)}seo.css">
{extra_ld}</head>
<body class="seopage">
"""


def ld(obj):
    return (
        '<script type="application/ld+json">'
        + json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        + "</script>\n"
    )


def person_ld():
    return {
        "@type": "Person",
        "@id": BASE + "/#person",
        "name": SITE["name"],
        "jobTitle": SITE["jobTitle"],
        "url": BASE + "/",
        "email": "mailto:" + SITE["email"],
        "sameAs": [SITE["instagram"]],
        "address": {
            "@type": "PostalAddress",
            "addressLocality": SITE["city"],
            "addressCountry": SITE["country"],
        },
    }


def service_ld():
    return {
        "@type": "ProfessionalService",
        "@id": BASE + "/#service",
        "name": SITE["name"] + " — Grafikdesign",
        "description": SITE["description"],
        "url": BASE + "/",
        "image": BASE + "/" + SITE["ogImage"],
        "email": "mailto:" + SITE["email"],
        "founder": {"@id": BASE + "/#person"},
        "areaServed": [
            {"@type": "City", "name": SITE["city"]},
            {"@type": "Country", "name": "Österreich"},
            {"@type": "Country", "name": "Deutschland"},
            {"@type": "Country", "name": "Schweiz"},
        ],
        "address": {
            "@type": "PostalAddress",
            "addressLocality": SITE["city"],
            "addressCountry": SITE["country"],
        },
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Leistungen",
            "itemListElement": [
                {
                    "@type": "Offer",
                    "itemOffered": {
                        "@type": "Service",
                        "name": s["name"],
                        "description": s["text"],
                    },
                }
                for s in SITE["services"]
            ],
        },
    }


def crumbs(items):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u}
            for i, (n, u) in enumerate(items)
        ],
    }


def alt_for(project, item):
    """Alt-Text: was zu sehen ist, nicht der rohe Dateiname."""
    fmt = item.get("format") or "Grafik"
    stem = re.sub(r"\.[a-z0-9]+$", "", item["name"].split("/")[-1])
    return f"{fmt} — {stem} ({PSEO[project['slug']]['title']})"


def nav(prefix=""):
    return (
        '<nav class="seonav" aria-label="Seiten">'
        f'<a href="{prefix}">Start</a>'
        f'<a href="{prefix}leistungen/">Leistungen</a>'
        f'<a href="{prefix}projekte/">Projekte</a>'
        f'<a href="mailto:{e(SITE["email"])}">Kontakt</a>'
        "</nav>\n"
    )


def footer(prefix=""):
    return (
        '<footer class="seofoot">'
        f"<p>{e(SITE['name'])} — {e(SITE['jobTitle'])}, {e(SITE['city'])}. "
        f'<a href="mailto:{e(SITE["email"])}">{e(SITE["email"])}</a> · '
        f'<a href="{e(SITE["instagram"])}" rel="me">Instagram</a></p>'
        f'<p><a href="{prefix}">Zurück zum Desktop-Portfolio</a></p>'
        "</footer>\n</body>\n</html>\n"
    )


# ---------------------------------------------------------------- Projektseiten

print("Projektseiten:")
for p in PROJECTS:
    s = PSEO[p["slug"]]
    url = f"{BASE}/projekte/{p['slug']}/"
    cov = p.get("cover") or {}
    cover = cov.get("file") or cov.get("thumb") or p["items"][0]["file"]
    work = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CreativeWork",
                "name": s["title"],
                "description": s["description"],
                "url": url,
                "creator": {"@id": BASE + "/#person"},
                "genre": s["leistung"],
                "image": [BASE + "/" + i["file"] for i in p["items"][:6]],
            },
            person_ld(),
            crumbs(
                [
                    ("Start", BASE + "/"),
                    ("Projekte", BASE + "/projekte/"),
                    (s["title"], url),
                ]
            ),
        ],
    }

    media = []
    for item in p["items"]:
        src = "../../" + item["file"]
        if item["type"] == "video":
            media.append(
                f'<figure><video src="{e(src)}" controls preload="metadata" '
                f'playsinline></video><figcaption>{e(alt_for(p, item))}</figcaption></figure>'
            )
        else:
            w, h = item.get("width"), item.get("height")
            dim = f' width="{w}" height="{h}"' if w and h else ""
            media.append(
                f'<figure><img src="{e(src)}" alt="{e(alt_for(p, item))}"{dim} '
                f'loading="lazy" decoding="async"><figcaption>'
                f'{e(item.get("format") or "Grafik")}</figcaption></figure>'
            )

    page = (
        head(
            f"{s['title']} — {SITE['name']}",
            s["description"],
            url,
            cover,
            ld(work),
        )
        + nav("../../")
        + "<main>\n"
        + f"<h1>{e(s['title'])}</h1>\n"
        + f'<p class="lead">{e(s["description"])}</p>\n'
        + f'<p class="meta"><strong>Leistung:</strong> {e(s["leistung"])} · '
        + f"<strong>Umfang:</strong> {len(p['items'])} Arbeiten · "
        + f"<strong>Gestaltung:</strong> {e(SITE['name'])}, {e(SITE['city'])}</p>\n"
        + '<div class="gallery">\n'
        + "\n".join(media)
        + "\n</div>\n"
        + '<p class="cta">Ähnliches Projekt geplant? '
        + f'<a href="mailto:{e(SITE["email"])}">Anfrage schreiben</a> oder '
        + '<a href="../../leistungen/">Leistungen ansehen</a>.</p>\n'
        + "</main>\n"
        + footer("../../")
    )
    wr(f"projekte/{p['slug']}/index.html", page)

# ------------------------------------------------------------ Projektübersicht

by_leistung = {}
for p in PROJECTS:
    by_leistung.setdefault(PSEO[p["slug"]]["leistung"], []).append(p)

url = BASE + "/projekte/"
items_ld = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "CollectionPage",
            "name": "Projekte",
            "url": url,
            "description": "Alle Design-Projekte von Max Schwarz: Cover-Artwork, Event-Poster, Social-Media-Design, Motion Design, Sticker und Logos.",
        },
        crumbs([("Start", BASE + "/"), ("Projekte", url)]),
    ],
}
body = []
for leistung, group in sorted(by_leistung.items()):
    body.append(f"<h2>{e(leistung)}</h2>\n<ul class='projectlist'>")
    for p in group:
        s = PSEO[p["slug"]]
        body.append(
            f'<li><a href="{e(p["slug"])}/"><strong>{e(s["title"])}</strong>'
            f'<span>{e(s["description"])}</span></a></li>'
        )
    body.append("</ul>")

wr(
    "projekte/index.html",
    head(
        "Projekte — Grafikdesign & Artwork von Max Schwarz, Wien",
        "Alle Projekte: Album- und EP-Cover, Event-Poster und Club-Flyer, Instagram-Design, Motion Design, Sticker und Logos — gestaltet in Wien.",
        url,
        SITE["ogImage"],
        ld(items_ld),
    )
    + nav("../")
    + "<main>\n<h1>Projekte</h1>\n"
    + f"<p class=\"lead\">{len(PROJECTS)} Arbeiten aus Musik, Nachtleben und Print — "
    + "nach Leistung gruppiert.</p>\n"
    + "\n".join(body)
    + "\n</main>\n"
    + footer("../"),
)

# --------------------------------------------------------------- Leistungsseite

url = BASE + "/leistungen/"
serv_ld = {
    "@context": "https://schema.org",
    "@graph": [
        service_ld(),
        person_ld(),
        crumbs([("Start", BASE + "/"), ("Leistungen", url)]),
    ],
}
blocks = []
for s in SITE["services"]:
    rel = [p for p in PROJECTS if PSEO[p["slug"]]["leistung"].split(" &")[0] in s["name"]]
    links = "".join(
        f'<a href="../projekte/{e(p["slug"])}/">{e(PSEO[p["slug"]]["title"])}</a>'
        for p in rel[:4]
    )
    blocks.append(
        f'<section class="service"><h2>{e(s["name"])}</h2><p>{e(s["text"])}</p>'
        + (f'<p class="refs">Beispiele: {links}</p>' if links else "")
        + "</section>"
    )

wr(
    "leistungen/index.html",
    head(
        "Leistungen — Grafikdesign, Cover-Artwork & Motion Design in Wien",
        "Grafikdesign in Wien: Album-Cover, Event-Poster und Club-Flyer, Social-Media-Design, Motion Design, Sticker und Logos für DJs, Bands, Labels und Veranstalter.",
        url,
        SITE["ogImage"],
        ld(serv_ld),
    )
    + nav("../")
    + "<main>\n<h1>Grafikdesign für Musik, Clubs und Events — aus Wien</h1>\n"
    + "".join(f'<p class="lead">{e(t)}</p>\n' for t in SITE["intro"])
    + "".join(blocks)
    + '\n<section class="service"><h2>Anfrage</h2><p>Schreib kurz, worum es geht, '
    + "bis wann es fertig sein soll und in welchen Formaten du es brauchst — "
    + f'ich melde mich mit Einschätzung und Preis zurück.</p><p class="cta">'
    + f'<a href="mailto:{e(SITE["email"])}">{e(SITE["email"])}</a> · '
    + f'<a href="{e(SITE["instagram"])}">Instagram</a></p></section>\n'
    + "</main>\n"
    + footer("../"),
)

# ------------------------------------------------------------------- sitemap.xml

urls = [(BASE + "/", "1.0"), (BASE + "/leistungen/", "0.9"), (BASE + "/projekte/", "0.8")]
urls += [(f"{BASE}/projekte/{p['slug']}/", "0.7") for p in PROJECTS]
wr(
    "sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(
        f"  <url><loc>{u}</loc><priority>{pr}</priority></url>\n" for u, pr in urls
    )
    + "</urlset>\n",
)

wr(
    "robots.txt",
    "User-agent: *\nAllow: /\n\nSitemap: " + BASE + "/sitemap.xml\n",
)

# ----------------------------------------------- Snippets für index.html (Start)

start_ld = {
    "@context": "https://schema.org",
    "@graph": [
        person_ld(),
        service_ld(),
        {
            "@type": "WebSite",
            "name": SITE["title"],
            "url": BASE + "/",
            "inLanguage": "de-AT",
            "publisher": {"@id": BASE + "/#person"},
        },
    ],
}
wr(
    "_seo-head.html",
    f'<title>{e(SITE["title"])}</title>\n'
    f'<meta name="description" content="{e(SITE["description"])}">\n'
    f'<link rel="canonical" href="{BASE}/">\n'
    '<meta property="og:type" content="website">\n'
    f'<meta property="og:title" content="{e(SITE["title"])}">\n'
    f'<meta property="og:description" content="{e(SITE["description"])}">\n'
    f'<meta property="og:url" content="{BASE}/">\n'
    f'<meta property="og:image" content="{BASE}/{SITE["ogImage"]}">\n'
    '<meta property="og:locale" content="de_AT">\n'
    '<meta name="twitter:card" content="summary_large_image">\n'
    f'<meta name="author" content="{e(SITE["name"])}">\n'
    + ld(start_ld),
)

links = "".join(
    f'<a href="projekte/{e(p["slug"])}/">{e(PSEO[p["slug"]]["title"])}</a>'
    for p in PROJECTS
)
wr(
    "_seo-footer.html",
    # Aufklappbares "Info"-Panel unten links: sichtbar, bedienbar, crawlbar —
    # und es stoert die Vollbild-Desktop-Metapher nicht.
    '<details class="sitefoot">\n'
    '  <summary>Info &amp; Leistungen</summary>\n'
    '  <div class="sitefoot__inner">\n'
    f'    <h1>{e(SITE["name"])} — {e(SITE["jobTitle"])} in {e(SITE["city"])}</h1>\n'
    + "".join(f"    <p>{e(t)}</p>\n" for t in SITE["intro"])
    + '    <nav class="sitefoot__nav" aria-label="Seiten">'
    f'<a href="leistungen/">Leistungen</a><a href="projekte/">Alle Projekte</a>'
    f'<a href="mailto:{e(SITE["email"])}">{e(SITE["email"])}</a>'
    f'<a href="{e(SITE["instagram"])}" rel="me">Instagram</a></nav>\n'
    '    <h2>Projekte</h2>\n'
    f'    <nav class="sitefoot__projects" aria-label="Projekte">{links}</nav>\n'
    '  </div>\n'
    "</details>\n",
)

print(f"\nFertig: {len(PROJECTS)} Projektseiten, Sitemap mit {len(urls)} URLs.")
