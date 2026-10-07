# maxschwarz.digital — Spec

Nachbau der Struktur/Interaktion von bychudy.com mit Max Schwarz' eigenen Designs.
Kein erfundener Marketing-Text. Alle Beschriftungen stammen aus Ordner-/Dateinamen.

## Beobachtete Referenz-Mechanik (bychudy.com, selbst im Browser verifiziert)

1. **Vollbild-Desktop**: Hintergrundbild randlos über den gesamten Viewport (`cover`).
   Für v1: **reiner weißer Hintergrund** (#FFFFFF). Bild wird später vom User nachgereicht;
   Austausch muss über eine einzige CSS-Variable / ein einziges File möglich sein.
2. **Verstreute Desktop-Icons**: Keine Grid-Anordnung — frei positionierte Icons,
   jeweils quadratisches Thumbnail (~56–64 px) mit Label darunter.
   Label: UPPERCASE, weiß, kleine serifenlose Schrift, Textschatten für Lesbarkeit,
   zentriert, max. 2 Zeilen. Icons dürfen einander leicht überlappen.
3. **Auswahl**: Einfacher Klick selektiert (blaue Tint-Overlay auf dem Thumbnail,
   blau hinterlegtes Label). Doppelklick öffnet das Fenster.
4. **Fenster = macOS „Information about:"-Panel**:
   - Milchig-transparenter Hintergrund (backdrop-filter: blur), abgerundete Ecken (~10 px),
     feiner Rahmen, weicher Schlagschatten.
   - Titelleiste: drei Ampel-Buttons links (rot/gelb/grün), zentrierter Titel
     „Information about: <Projektname>".
   - Kopfbereich: Icon links, darunter/daneben Projektname (fett) + Zeile 2 (Kundenzeile).
   - Darunter eine abgesetzte Zeile mit einer Kurzbeschreibung.
   - `Details:` mit `Type:` Zeile.
   - `Preview:` mit großem Bild; Fenster wächst, Inhalt scrollt.
5. **Fensterverhalten**: Drag an der Titelleiste, Schließen über den roten Button,
   Fokus bringt das Fenster nach vorn (z-index), mehrere Fenster gleichzeitig offen.
6. **Dock** unten zentriert: Icon-Reihe, leicht transparent, abgerundet, mit Trennstrichen.
   Externe Links (z. B. Instagram, Mail) öffnen in neuem Tab.

## Inhalte

Quelle: `projects.json` (generiert aus `~/portfolio-assets/raw`, keine Handarbeit am Text).

- 20 Projekte, 96 Assets (WebP, max. 1600 px Längsseite + 600-px-Thumbs, 1 MP4).
- `title` = originaler Ordnername (z. B. „Strunk Cow Theme", „weidentanz").
- `items[].name` = originaler Dateiname inkl. Unterordner (z. B. „DJ Posts/gulla post.png").
- **Keine erfundenen Beschreibungen, keine Jahreszahlen, keine Kundennamen,
  keine Kategorien, die nicht aus den Daten stammen.**
  Statt der Referenz-Zeilen „Kunde" / „Type" wird nur Faktisches gezeigt:
  Anzahl der Dateien und die Dateinamen.

## Technik

- Vanilla HTML/CSS/JS, keine Build-Pipeline, keine externen CDNs.
- Statisch lauffähig; Deployment GitHub Pages, Domain maxschwarz.digital (Namecheap-DNS).
- `index.html`, `style.css`, `app.js`, `projects.json`, `assets/`, `CNAME`, `.nojekyll`.
- Bilder `loading="lazy"`, Thumbs im Icon, Vollbild erst im geöffneten Fenster.

## Mobile

Desktop-Metapher funktioniert auf dem Handy nicht als Drag-Fläche:
Icons in einem scrollbaren Raster, Fenster öffnen sich als Vollbild-Sheet,
Dock bleibt unten fixiert.

## Barrierefreiheit

Icons per Tastatur fokussierbar (`tabindex`), Enter öffnet, Escape schließt das Fenster,
Fokusring sichtbar, Bilder mit `alt` = Dateiname.

## SEO-Ebene (ergänzt)

Die Desktop-Oberfläche ist vollständig JS-gerendert und damit für Suchmaschinen
leer. Darum existiert eine zweite, statische Ebene:

- `seo.json` — **redaktionell von Hand gepflegt**: Site-Metadaten, Leistungen und
  je Projekt `title` / `leistung` / `description`. Bewusste Abweichung von der
  „nur Ordnernamen"-Regel oben: Suchmaschinen brauchen Text. `projects.json`
  bleibt reine Generat-Datei; die Desktop-UI zeigt weiter die Ordnernamen.
- `scripts/build-seo.py` — merged beides und erzeugt:
  `projekte/<slug>/index.html` (eine echte Seite je Projekt),
  `projekte/index.html`, `leistungen/index.html`, `sitemap.xml`, `robots.txt`
  sowie die Snippets `_seo-head.html` / `_seo-footer.html`.
- `index.html` — die Snippets stehen zwischen den Markern
  `SEO-HEAD:start/end` und `SEO-FOOTER:start/end` und werden **nicht von Hand**
  bearbeitet. Der Footer ist ein aufklappbares „Info & Leistungen"-Panel unten
  links (`<details class="sitefoot">`) mit dem indexierbaren Fließtext und
  echten Links auf die statischen Seiten.
- `seo.css` — Stylesheet nur für die Textseiten.

Nach jedem neuen Projekt: Eintrag in `seo.json` ergänzen, dann
`python3 scripts/build-seo.py` laufen lassen und committen.
