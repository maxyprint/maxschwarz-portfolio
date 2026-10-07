# SEO — was noch von Hand zu tun ist

Technisch und on-page ist alles umgesetzt (siehe SPEC.md, Abschnitt „SEO-Ebene").
Das Folgende kann nur du selbst machen — es braucht Logins.

## 1. Google Search Console (wichtigster Schritt, 10 Minuten)

1. <https://search.google.com/search-console> → „Property hinzufügen" → **URL-Präfix**
   → `https://maxschwarz.digital`
2. Bestätigung per **HTML-Tag**: Google gibt dir ein
   `<meta name="google-site-verification" content="...">`.
   Das Tag in `seo.json` unter `site` noch nicht vorgesehen — einfach direkt in
   `index.html` **oberhalb** des Markers `<!-- SEO-HEAD:start -->` einfügen
   (dort überschreibt der Build-Script nichts).
3. Nach der Bestätigung unter „Sitemaps" eintragen: `sitemap.xml`
4. Unter „URL-Prüfung" einmal `https://maxschwarz.digital/leistungen/` eingeben
   und „Indexierung beantragen" klicken. Gleiches für `/projekte/`.

Nach 4–6 Wochen: Reiter „Leistung" → welche Suchbegriffe dich wirklich finden.
Die Texte in `seo.json` dann auf die tatsächlichen Begriffe nachschärfen und
`python3 scripts/build-seo.py` neu laufen lassen.

## 2. Google Business Profile (stärkster Hebel für „Grafikdesign Wien")

<https://business.google.com> → Unternehmen anlegen:

- Name: `Max Schwarz — Grafikdesign`
- Kategorie: **Grafikdesigner** (Haupt), zusätzlich *Werbeagentur*, *Designer*
- Kein Ladengeschäft → **Dienstleistungsgebiet**: Wien (+ Umgebung)
- Website: `https://maxschwarz.digital`
- Leistungen aus `/leistungen/` übernehmen (gleiche Begriffe verwenden)
- 8–10 Arbeiten als Fotos hochladen — dieselben Bilder wie im Portfolio
- Nach den ersten Jobs: um Bewertungen bitten, das bewegt lokale Rankings am meisten

## 3. Backlinks aus der eigenen Szene (kostet nichts, wirkt schnell)

- Instagram-Bio **@maybmax.archive** → Link auf `maxschwarz.digital`
- Bei jedem Artwork-Post die Acts markieren und sie bitten, in ihren
  Credits-Posts/Stories `maxschwarz.digital` zu verlinken
  (Clubs, Festivals und Labels haben Websites — das sind echte Backlinks)
- Profile mit Portfolio-Link anlegen: **dasauge.at**, **Behance**, **Dribbble**
- Veranstalter-Websites, auf denen deine Poster stehen, um einen Design-Credit
  mit Link bitten

## 4. Content-Flywheel (laufend, kein Blog nötig)

Jede neue Arbeit:

1. Assets wie gehabt nach `assets/<slug>/` (bzw. über den bestehenden Asset-Build)
2. Eintrag in `seo.json` → `projects.<slug>` mit `title`, `leistung`, `description`
3. `python3 scripts/build-seo.py`
4. Commit + Push → neue indexierbare Seite, Sitemap aktualisiert sich selbst
5. Instagram-Post dazu, der auf die neue Projektseite verlinkt

## 5. Optional

- Statistik ohne Cookie-Banner: **GoatCounter** oder **Plausible**
  (ein Script-Tag oberhalb von `<!-- SEO-HEAD:start -->`)
- Bing Webmaster Tools (importiert die GSC-Daten in zwei Klicks)
