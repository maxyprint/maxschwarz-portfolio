/* ============================================================
   maxschwarz.digital — Desktop-Metapher
   Alle sichtbaren Projekttexte stammen aus projects.json.
   ============================================================ */
(function () {
  "use strict";

  var desktop = document.getElementById("desktop");
  var iconLayer = document.getElementById("icons");
  var windowLayer = document.getElementById("windows");
  var live = document.getElementById("live");

  /* ANKERPUNKTE (top %, left %) ----------------------------------------
     Bezogen auf das zentrale CLUSTER-Rechteck, nicht auf die ganze
     Fläche. Gewollt ist ein gedrängter Haufen in der Bildmitte, der fast
     stapelt — außen bleibt viel frei. Die Werte sind handgesetzt und
     bewusst UNGLEICHMÄSSIG: manche Punkte liegen dicht beieinander,
     andere haben etwas Luft. Eine zusätzliche Potenzkurve zieht sie noch
     einmal zur Mitte, damit die Dichte im Zentrum am höchsten ist und
     nach außen abnimmt.
     Sie legen nicht die Endposition fest, sondern den Startpunkt der
     Entspannungsschleife. Mehr Projekte als Paare: zyklisch weiter.
     -------------------------------------------------------------------- */
  var FIXED_POSITIONS = [
    [46, 48], [52, 42], [41, 55], [55, 53], [49, 36],
    [38, 44], [58, 45], [44, 62], [60, 58], [35, 58],
    [50, 60], [63, 38], [33, 40], [56, 66], [43, 31],
    [67, 52], [30, 52], [54, 28], [39, 70], [70, 62],
    [22, 66]   // einziger etwas abgesetzter Punkt
  ];

  // Zieht einen Prozentwert zur Mitte: aus gleichmäßig wird mittendicht.
  function centerBias(value) {
    var d = (value - 50) / 50;                       // -1 … 1
    var pulled = Math.sign(d) * Math.pow(Math.abs(d), 1.55);
    return 50 + pulled * 50;
  }

  var ICON_W = 134;        // muss zu --icon-w passen
  var COVER_MAX = 92;      // muss zu --cover-max passen
  var COVER_MIN = 40;      // muss zu --cover-min passen
  var EDGE = 20;           // Abstand zu den Viewport-Rändern
  var DOCK_RESERVE = 120;  // muss zu --dock-h passen
  var PAD = 0;             // kein Mindestabstand mehr — die Icons dürfen
                           // sich fast berühren
  var MAX_OVERLAP = 0.15;  // zwei Thumbnails dürfen sich höchstens zu
                           // 15 % ihrer Fläche überschneiden
  var CLUSTER_W = 0.47;    // Anteil der Nutzfläche, in dem gestapelt wird
  var CLUSTER_H = 0.57;
  var RELAX_ITERATIONS = 150;
  var SETTLE_ITERATIONS = 200;   // Nachlauf ohne Federkraft
  // Toleranz gegen Fließkomma-Reste: ohne sie bleibt nach dem Trennen ein
  // Rest von ~1e-13 px übrig, der als Überlappung gewertet würde und die
  // Schleife nie konvergieren ließe.
  var EPS = 0.5;
  var ANCHOR_PULL = 0.03;  // wie stark ein Icon zu seinem Anker zurückzieht

  var projects = [];
  var selected = null;
  var openWindows = [];  // in Stapelreihenfolge, letztes = oberstes
  var zTop = 50;
  var cascade = 0;

  // Im Mobil-Layout sind Icons ein CSS-Grid und Fenster Vollbild-Sheets.
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function mobileLayout() {
    return window.matchMedia("(max-width: 760px)").matches ||
           window.matchMedia("(pointer: coarse) and (max-width: 1024px)").matches;
  }

  /* ---------------------------------------------- Icon-Positionierung */

  // Thumbnail-Box im ECHTEN Seitenverhältnis des ersten Bildes.
  /* Das kuratierte Cover bringt keine Maße mit, deshalb wird die Box aus
     der NATÜRLICHEN Bildgröße gebildet, sobald das Bild geladen ist. Bis
     dahin steht eine quadratische Platzhalterbox; danach läuft das Layout
     einmal neu. So bleibt die Darstellung unbeschnitten und die Formate
     (Querformat, Poster, Cover) bleiben unterscheidbar.
     ---------------------------------------------------------------------- */
  function boxFromNatural(nw, nh) {
    if (!nw || !nh) return { w: 72, h: 72 };
    var long = Math.max(nw, nh);
    var w = Math.round(nw / long * COVER_MAX);
    var h = Math.round(nh / long * COVER_MAX);
    // Sehr flache Motive bekommen eine Mindesthöhe; damit die Proportion
    // dabei nicht kippt, wird die andere Seite mitskaliert und danach auf
    // die Zellenbreite begrenzt.
    if (h < COVER_MIN) { w = Math.round(w * COVER_MIN / h); h = COVER_MIN; }
    if (w < COVER_MIN) { h = Math.round(h * COVER_MIN / w); w = COVER_MIN; }
    if (w > ICON_W) { h = Math.round(h * ICON_W / w); w = ICON_W; }
    return { w: w, h: h };
  }

  function applyThumbBox(thumb, img) {
    var size = boxFromNatural(img.naturalWidth, img.naturalHeight);
    thumb.style.width = size.w + "px";
    thumb.style.height = size.h + "px";
    // Platzhalterton weg, sobald das Bild steht.
    thumb.classList.add("is-loaded");
  }

  // Nach dem Laden der Cover einmal neu anordnen (gebündelt).
  var relayoutTimer;
  function scheduleRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(layoutIcons, 60);
  }

  /* ENTSPANNUNGSSCHLEIFE -------------------------------------------------
     Die feste Positionsliste kennt die Bildformate nicht und erzeugt
     deshalb Überlappungen. Sie dient daher nur noch als ANKER: Jedes Icon
     startet auf seinem Ankerpunkt, danach schieben sich überlappende
     Icons entlang der kürzeren Überschneidungsachse auseinander, während
     eine schwache Feder jedes Icon zu seinem Anker zurückzieht — die
     gewollte Streuung bleibt so erhalten. Gerechnet wird auf der VOLLEN
     Box aus Thumbnail und Label plus PAD. Komplett deterministisch, kein
     Math.random.
     -------------------------------------------------------------------- */
  /* TRENNUNG --------------------------------------------------------------
     Geprüft wird nur noch das THUMBNAIL, nicht die volle Box mit Label —
     Label-Boxen dürfen sich frei überlappen. Und auch Thumbnails dürfen
     sich überschneiden, nur eben begrenzt: höchstens MAX_OVERLAP ihrer
     Fläche. Geschoben wird daher nicht bis zur Berührung, sondern nur so
     weit, bis die Überschneidung wieder unter der Grenze liegt. Genau das
     erzeugt den gestapelten Eindruck statt einer sauberen Verteilung.
     ------------------------------------------------------------------------ */

  // Thumbnail-Rechteck einer Box: oben, horizontal mittig.
  function thumbRect(box) {
    return {
      x: box.x + (box.w - box.tw) / 2,
      y: box.y,
      w: box.tw,
      h: box.th
    };
  }

  // Wie weit müssen zwei Boxen auseinander, damit die Grenze eingehalten
  // ist? Gibt 0 zurück, wenn alles im Rahmen liegt.
  function excess(a, b) {
    var ra = thumbRect(a), rb = thumbRect(b);
    var ox = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x) + PAD;
    var oy = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y) + PAD;
    if (ox <= EPS || oy <= EPS) return null;

    var area = ox * oy;
    var limit = MAX_OVERLAP * Math.min(ra.w * ra.h, rb.w * rb.h);
    if (area <= limit) return null;

    // Auf welcher Achse ist der nötige Weg kürzer?
    var needX = ox - limit / oy;
    var needY = oy - limit / ox;
    // Bruchteile eines Pixels gelten als erfüllt. Ohne diese Toleranz
    // fordert die Schleife ewig Wege von ~1e-9 px ein und konvergiert nie.
    if (Math.min(needX, needY) <= EPS) return null;
    return needX <= needY
      ? { axis: "x", amount: needX, a: ra, b: rb }
      : { axis: "y", amount: needY, a: ra, b: rb };
  }

  function separate(boxes, bounds) {
    var moved = false, i, j;

    for (i = 0; i < boxes.length; i++) {
      for (j = i + 1; j < boxes.length; j++) {
        var a = boxes[i], b = boxes[j];
        var e = excess(a, b);
        if (!e) continue;

        moved = true;
        if (e.axis === "x") {
          var sx = (e.a.x + e.a.w / 2 <= e.b.x + e.b.w / 2) ? -1 : 1;
          a.x += sx * e.amount / 2;
          b.x -= sx * e.amount / 2;
        } else {
          var sy = (e.a.y + e.a.h / 2 <= e.b.y + e.b.h / 2) ? -1 : 1;
          a.y += sy * e.amount / 2;
          b.y -= sy * e.amount / 2;
        }
      }
    }

    for (i = 0; i < boxes.length; i++) clampBox(boxes[i], bounds);
    return moved;
  }

  function relax(boxes, bounds) {
    var i, it;

    // Phase 1: entzerren und gleichzeitig zum Anker zurückziehen. Die
    // Federkraft wird linear auf null heruntergefahren, sonst zieht sie am
    // Ende die Überschneidungen wieder herein.
    for (it = 0; it < RELAX_ITERATIONS; it++) {
      var moved = separate(boxes, bounds);
      var pull = ANCHOR_PULL * (1 - it / RELAX_ITERATIONS);
      for (i = 0; i < boxes.length; i++) {
        var a = boxes[i];
        a.x += (a.ax - a.x) * pull;
        a.y += (a.ay - a.y) * pull;
        clampBox(a, bounds);
      }
      if (!moved && pull < 0.001) break;
    }

    // Phase 2: nur noch entzerren, bis die Grenze überall eingehalten ist.
    for (it = 0; it < SETTLE_ITERATIONS; it++) {
      if (!separate(boxes, bounds)) break;
    }
  }

  function atYLimit(box, b) {
    return box.y <= b.y + EPS || box.y + box.h >= b.y + b.h - EPS;
  }
  function atXLimit(box, b) {
    return box.x <= b.x + EPS || box.x + box.w >= b.x + b.w - EPS;
  }

  function clampBox(box, b) {
    box.x = Math.min(Math.max(box.x, b.x), b.x + b.w - box.w);
    box.y = Math.min(Math.max(box.y, b.y), b.y + b.h - box.h);
  }

  // Liegt irgendwo noch zu viel Überschneidung?
  function tooMuchOverlap(boxes) {
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        if (excess(boxes[i], boxes[j])) return true;
      }
    }
    return false;
  }

  /* Sicherheitsnetz: Konvergiert die Entzerrung nicht (sehr kleiner
     Viewport oder sehr viele Projekte), wird deterministisch auf ein
     zentriertes Raster ausgewichen — überschneidungsfrei per Konstruktion. */
  function gridFallback(boxes, bounds) {
    var cw = 0, ch = 0, i;
    for (i = 0; i < boxes.length; i++) {
      cw = Math.max(cw, boxes[i].w);
      ch = Math.max(ch, boxes[i].h);
    }
    var cols = Math.max(1, Math.floor(bounds.w / cw));
    var rows = Math.ceil(boxes.length / cols);
    var offX = bounds.x + Math.max(0, (bounds.w - cols * cw) / 2);
    var offY = bounds.y + Math.max(0, (bounds.h - rows * ch) / 2);

    for (i = 0; i < boxes.length; i++) {
      boxes[i].x = offX + (i % cols) * cw;
      boxes[i].y = offY + Math.floor(i / cols) * ch;
      clampBox(boxes[i], bounds);
    }
  }

  function layoutIcons() {
    if (mobileLayout()) {
      // Grid-Layout: evtl. gesetzte Inline-Positionen entfernen.
      iconLayer.querySelectorAll(".icon").forEach(function (el) {
        el.style.left = el.style.top = el.style.transform = "";
      });
      return;
    }
    if (!projects.length) return;

    var W = desktop.clientWidth;
    var H = desktop.clientHeight;

    // Harte Grenze: kein Icon über den Rand, keines unter das Dock.
    var bounds = {
      x: EDGE, y: EDGE,
      w: Math.max(ICON_W, W - 2 * EDGE),
      h: Math.max(80, H - EDGE - DOCK_RESERVE)
    };

    // Darin das Cluster-Rechteck, in dem sich alles drängt.
    var cluster = {
      w: bounds.w * CLUSTER_W,
      h: bounds.h * CLUSTER_H
    };
    cluster.x = bounds.x + (bounds.w - cluster.w) / 2;
    cluster.y = bounds.y + (bounds.h - cluster.h) / 2;

    var boxes = projects.map(function (p, i) {
      var pos = FIXED_POSITIONS[i % FIXED_POSITIONS.length];
      var el = p._icon;
      var thumb = el.querySelector(".icon__thumb");
      var box = {
        w: el.offsetWidth || ICON_W,
        h: el.offsetHeight || 140,
        tw: (thumb && thumb.offsetWidth) || 72,
        th: (thumb && thumb.offsetHeight) || 72
      };
      // Anker im Cluster-Rechteck, zusätzlich zur Mitte gezogen.
      box.ax = cluster.x + cluster.w * centerBias(pos[1]) / 100 - box.w / 2;
      box.ay = cluster.y + cluster.h * centerBias(pos[0]) / 100 - box.h / 2;
      box.x = box.ax;
      box.y = box.ay;
      clampBox(box, bounds);
      box.ax = box.x; box.ay = box.y;
      return box;
    });

    relax(boxes, bounds);
    var fallback = tooMuchOverlap(boxes);
    if (fallback) gridFallback(boxes, bounds);

    projects.forEach(function (p, i) {
      p._icon.style.transform = "none";
      p._icon.style.left = Math.round(boxes[i].x) + "px";
      p._icon.style.top = Math.round(boxes[i].y) + "px";
    });

    // Für die Selbstprüfung von außen nachvollziehbar machen.
    iconLayer.dataset.layout = fallback ? "grid-fallback" : "clustered";
  }

  /* ---------------------------------------------- Hilfen */

  // Bild für die Vorschau-Kachel: erstes Item mit Thumbnail (Videos haben
  // inzwischen ebenfalls eines), sonst das erste Bild.
  /* Das Desktop-Icon und die Fenster-Kopfzeile zeigen IMMER das kuratierte
     Titelbild aus p.cover — nicht mehr das erste Element aus items. Fehlt
     es, fällt der Code auf das erste Bild zurück, damit nichts leer bleibt. */
  function coverSource(p) {
    if (p.cover && (p.cover.thumb || p.cover.file)) return p.cover;
    for (var i = 0; i < p.items.length; i++) {
      if (p.items[i].thumb || p.items[i].type === "image") return p.items[i];
    }
    return null;
  }

  // Cover-Element oder neutraler Glyph, wenn es gar kein Bild gibt.
  function coverElement(p, alt) {
    var item = coverSource(p);
    if (!item) {
      var glyph = document.createElement("span");
      glyph.className = "icon__glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "▣";
      return glyph;
    }
    var el = document.createElement("img");
    el.src = item.thumb || item.file;
    el.alt = alt === undefined ? (item.name || "") : alt;
    // Cover NICHT lazy: sie liegen absolut positioniert auf dem Desktop
    // und blieben sonst beim ersten Paint als leere Kacheln stehen.
    el.loading = "eager";
    el.decoding = "async";
    el.setAttribute("fetchpriority", "low");
    return el;
  }

  /* Formatgruppen in der Reihenfolge ihres ERSTEN Vorkommens; die Items
     selbst bleiben in der Reihenfolge aus projects.json. */
  function groupByFormat(items) {
    var order = [], map = Object.create(null);
    items.forEach(function (item) {
      var f = item.format || "";
      if (!map[f]) { map[f] = []; order.push(f); }
      map[f].push(item);
    });
    return order.map(function (f) { return { format: f, items: map[f] }; });
  }

  // Umfangszeile: Formate mit Anzahl, rein aus den Daten.
  function scopeLine(items) {
    return groupByFormat(items).map(function (g) {
      return (g.format || "–") + " " + g.items.length;
    }).join(", ");
  }

  // Sichtbarer Hinweis auf der Desktop-Fläche (Ladefehler, leere Liste).
  function showNotice(text) {
    var box = document.createElement("p");
    box.className = "notice";
    box.textContent = text;
    iconLayer.appendChild(box);
    live.textContent = text;
  }

  /* ---------------------------------------------- Icons bauen */

  function buildIcons() {
    var frag = document.createDocumentFragment();

    // Tab-Reihenfolge soll der sichtbaren Anordnung folgen, nicht der
    // Reihenfolge in projects.json: grob nach Zeile (y), dann nach x.
    var visualOrder = projects.slice().sort(function (a, b) {
      var pa = FIXED_POSITIONS[a._index % FIXED_POSITIONS.length];
      var pb = FIXED_POSITIONS[b._index % FIXED_POSITIONS.length];
      return (pa[0] - pb[0]) || (pa[1] - pb[1]);
    });

    visualOrder.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon";
      // Auswahl als Umschaltzustand — die native Button-Rolle bleibt.
      btn.setAttribute("aria-pressed", "false");

      var thumb = document.createElement("span");
      thumb.className = "icon__thumb";
      // Platzhalterbox, bis die echte Proportion des Covers bekannt ist.
      thumb.style.width = "72px";
      thumb.style.height = "72px";

      var cover = coverElement(p);
      thumb.appendChild(cover);
      if (cover.tagName === "IMG") {
        if (cover.complete && cover.naturalWidth) {
          applyThumbBox(thumb, cover);
        } else {
          cover.addEventListener("load", function () {
            applyThumbBox(thumb, cover);
            scheduleRelayout();
          }, { once: true });
        }
      }

      var label = document.createElement("span");
      label.className = "icon__label";
      label.textContent = p.title;

      btn.appendChild(thumb);
      btn.appendChild(label);

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        select(p);
        // Pro Ereignis entscheiden: per Finger genügt ein Tap, mit Maus
        // selektiert der einfache Klick nur.
        if (e.pointerType === "touch" || mobileLayout()) openWindow(p, btn);
      });
      btn.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        openWindow(p, btn);
      });
      btn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(p);
          openWindow(p, btn);
        }
      });

      p._icon = btn;
      frag.appendChild(btn);
    });

    iconLayer.appendChild(frag);
  }

  function select(p) {
    if (selected && selected._icon) selected._icon.setAttribute("aria-pressed", "false");
    selected = p;
    if (p) p._icon.setAttribute("aria-pressed", "true");
  }

  /* ---------------------------------------------- Fenster */

  // Gemeinsames Fenster-Gerüst: Titelleiste, Ampeln, leerer Inhaltsbereich.
  function buildWindow(key, titleText, opener, extraClass) {
    var win = document.createElement("section");
    win.className = "window" + (extraClass ? " " + extraClass : "");
    win.key = key;
    win.opener = opener || null;
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-modal", "false");
    win.tabIndex = -1;

    var titleId = "win-title-" + key;
    win.setAttribute("aria-labelledby", titleId);

    win.innerHTML =
      '<div class="titlebar">' +
        '<div class="titlebar__row">' +
          '<div class="lights">' +
            '<button class="light light--close" type="button" aria-label="Fenster schließen"></button>' +
            '<button class="light light--min" type="button" disabled aria-hidden="true" tabindex="-1"></button>' +
            '<button class="light light--zoom" type="button" disabled aria-hidden="true" tabindex="-1"></button>' +
          "</div>" +
          '<h2 class="titlebar__title" id="' + titleId + '"></h2>' +
        "</div>" +
        '<span class="titlebar__rule"></span>' +
      "</div>" +
      '<div class="window__body"></div>';

    // Alle Daten per DOM-API, nie per String-Konkatenation: Titel und
    // Dateinamen können Anführungszeichen oder < enthalten.
    win.querySelector(".titlebar__title").textContent = "Information about: " + titleText;

    // Treppenförmig versetzt platzieren.
    var offset = (cascade % 6) * 26;
    cascade++;
    win.style.left = Math.max(12, Math.round(desktop.clientWidth * 0.22) + offset) + "px";
    win.style.top = 40 + offset + "px";

    win.querySelector(".light--close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeWindow(win);
    });
    // Ein Listener für Maus, Stift und Finger: bringt das Fenster nach vorn.
    win.addEventListener("pointerdown", function () { focusWindow(win); });

    makeDraggable(win, win.querySelector(".titlebar"));
    return win;
  }

  function mountWindow(win, announce) {
    windowLayer.appendChild(win);
    openWindows.push(win);
    focusWindow(win);
    win.focus();
    // Mobil deckt das Sheet die ganze Fläche ab — der Desktop darf
    // dahinter nicht weiterscrollen.
    if (mobileLayout()) document.body.style.overflow = "hidden";
    live.textContent = announce;
  }

  // Bereits offenes Fenster mit diesem Schlüssel nach vorn holen.
  function raiseExisting(key) {
    var existing = openWindows.find(function (w) { return w.key === key; });
    if (existing) { focusWindow(existing); return true; }
    return false;
  }

  /* KACHELN ---------------------------------------------------------------
     Im Fenster steht die ÜBERSICHT: kleine Kacheln aus der thumb-Datei
     (600 px, schnell). Das Großbild kommt auf Klick aus der file-Datei
     (1600 px). Jede Kachel ist ein Button und meldet sich mit ihrem Index
     in der Quick-Look-Liste des Fensters an, damit die Pfeiltasten in
     derselben Reihenfolge blättern, in der die Kacheln im Fenster stehen.
     ------------------------------------------------------------------------ */

  // Bildelement mit ruhigem Platzhalterton, der nach dem Laden verschwindet.
  function pictureElement(src, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", function () {
      if (img.parentElement) img.parentElement.classList.add("is-loaded");
    }, { once: true });
    return img;
  }

  function tileElement(item, win) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";

    if (item.type === "video") {
      // Stumme Endlosvorschau; der Klick führt in die Großansicht, wo das
      // Video mit Bedienelementen und Ton läuft.
      var v = document.createElement("video");
      v.src = item.file;
      if (item.poster) v.poster = item.poster;
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("aria-hidden", "true");
      btn.appendChild(v);
      btn.classList.add("is-loaded");
      btn.setAttribute("aria-label", item.name + " — Großansicht öffnen");
    } else {
      btn.appendChild(pictureElement(item.thumb || item.file, item.name));
      btn.setAttribute("aria-label", item.name + " — Großansicht öffnen");
    }

    var index = win.qlItems.length;
    win.qlItems.push(item);
    btn.addEventListener("click", function () { openQuickLook(win, index, btn); });

    return btn;
  }

  // "1.0" → "Slide 1", "2.2" → "Slide 2.2"
  function slideLabel(value) {
    var text = String(value).replace(/\.0$/, "");
    return "Slide " + text;
  }

  /* FEED-RASTER ----------------------------------------------------------
     Drei gleich breite Spalten mit minimalem Abstand — so, wie das Raster
     später im Profil steht. `spalte` bestimmt die Spalte, die Position
     innerhalb der Spalte die Zeile. Alle Kacheln bekommen dasselbe
     Seitenverhältnis (aus dem ersten Item der Gruppe), damit die Reihen
     sauber abschließen und nicht ausfransen.
     Mehrere Slides in einer Spalte werden beschriftet; tragen alle
     Einträge einer Spalte denselben Slide-Wert, sind es Varianten und es
     wird nicht beschriftet.
     ---------------------------------------------------------------------- */
  function renderFeedGrid(items, win) {
    var grid = document.createElement("div");
    grid.className = "feedgrid";

    var first = items[0];
    if (first && first.width && first.height) {
      grid.style.setProperty("--feed-ratio", first.width + " / " + first.height);
    }

    // Spaltenzuordnung und Slide-Beschriftung vorab bestimmen.
    var rowOf = [0, 0, 0];
    var perColumn = [[], [], []];
    items.forEach(function (item, i) {
      var col = typeof item.spalte === "number" ? item.spalte : i % 3;
      perColumn[Math.max(0, Math.min(2, col))].push(item);
    });
    var labelColumn = perColumn.map(function (colItems) {
      var distinct = {};
      colItems.forEach(function (it) { distinct[it.slide] = true; });
      return Object.keys(distinct).length > 1;
    });

    items.forEach(function (item, i) {
      var col = typeof item.spalte === "number" ? item.spalte : i % 3;
      col = Math.max(0, Math.min(2, col));

      var cell = document.createElement("div");
      cell.className = "feedgrid__cell";
      cell.style.gridColumn = String(col + 1);
      cell.style.gridRow = String(rowOf[col] + 1);
      rowOf[col]++;

      cell.appendChild(tileElement(item, win));

      if (labelColumn[col] && item.slide !== undefined) {
        var tag = document.createElement("span");
        tag.className = "slidetag";
        tag.textContent = slideLabel(item.slide);
        cell.appendChild(tag);
      }
      grid.appendChild(cell);
    });

    return grid;
  }

  // DJ-Karten: kompaktes Raster, damit die Karte pro Act auf einen Blick
  // erkennbar ist.
  function renderCardGrid(items, win) {
    var grid = document.createElement("div");
    grid.className = "cardgrid";
    items.forEach(function (item) { grid.appendChild(tileElement(item, win)); });
    return grid;
  }

  /* Alle übrigen Formate ebenfalls als Raster statt über die volle Breite —
     sonst wird aus einer Kampagne mit vielen Teilen ein Scroll-Marathon. */
  function renderTileGrid(items, win) {
    var grid = document.createElement("div");
    grid.className = "tilegrid";
    items.forEach(function (item) { grid.appendChild(tileElement(item, win)); });
    return grid;
  }

  function openWindow(p, opener) {
    // Schlüssel ist die laufende Nummer, nicht der Slug — Slugs können in
    // den Daten doppelt vorkommen.
    var key = "project-" + p._id;
    if (raiseExisting(key)) return;

    var win = buildWindow(key, p.title, opener);
    var body = win.querySelector(".window__body");
    // Sammelt die Items in genau der Reihenfolge, in der ihre Kacheln im
    // Fenster stehen — danach blättert die Großansicht.
    win.qlItems = [];

    body.innerHTML =
      '<div class="infohead">' +
        '<div class="infohead__thumb"></div>' +
        "<div>" +
          '<div class="infohead__name"></div>' +
          '<div class="infohead__scope"></div>' +
        "</div>" +
      "</div>";

    body.querySelector(".infohead__name").textContent = p.title;
    body.querySelector(".infohead__scope").textContent = scopeLine(p.items);
    body.querySelector(".infohead__thumb").appendChild(coverElement(p, ""));

    groupByFormat(p.items).forEach(function (group) {
      var section = document.createElement("section");
      section.className = "formatgroup";

      var head = document.createElement("h3");
      head.className = "formatgroup__head";
      head.textContent = (group.format || "–") + " (" + group.items.length + ")";
      section.appendChild(head);

      if (group.format === "Feed-Raster") {
        section.appendChild(renderFeedGrid(group.items, win));
      } else if (group.format === "DJ-Karten") {
        section.appendChild(renderCardGrid(group.items, win));
      } else {
        section.appendChild(renderTileGrid(group.items, win));
      }

      body.appendChild(section);
    });

    mountWindow(win, "Fenster geöffnet: " + p.title);
  }

  /* GROSSANSICHT (Quick Look) ---------------------------------------------
     Liegt über allem, zeigt das Bild vollständig und so groß wie möglich,
     blättert mit den Pfeiltasten durch alle Kacheln des Fensters und gibt
     den Fokus beim Schließen an die angeklickte Kachel zurück.
     ------------------------------------------------------------------------ */
  var quickLook = null;   // { el, win, index, opener, stage, ... }

  function quickLookOpen() { return quickLook !== null; }

  function openQuickLook(win, index, opener) {
    if (quickLook) closeQuickLook();

    var el = document.createElement("div");
    el.className = "quicklook";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Großansicht");

    el.innerHTML =
      '<button class="quicklook__close" type="button" aria-label="Großansicht schließen">×</button>' +
      '<div class="quicklook__stage"></div>' +
      '<div class="quicklook__bar">' +
        '<span class="quicklook__name"></span>' +
        '<span class="quicklook__meta"></span>' +
      "</div>";

    quickLook = {
      el: el,
      win: win,
      index: index,
      opener: opener,
      stage: el.querySelector(".quicklook__stage")
    };

    // Klick auf den abgedunkelten Grund schließt; Klicks auf das Bild oder
    // die Zeile darunter nicht.
    el.addEventListener("click", function (e) {
      if (e.target === el || e.target === quickLook.stage) closeQuickLook();
    });
    el.querySelector(".quicklook__close").addEventListener("click", closeQuickLook);

    document.body.appendChild(el);
    showQuickLookItem(index);
    el.querySelector(".quicklook__close").focus();
  }

  function showQuickLookItem(index) {
    var items = quickLook.win.qlItems;
    if (!items.length) return;
    // Umlaufend blättern.
    quickLook.index = (index + items.length) % items.length;

    var item = items[quickLook.index];
    var stage = quickLook.stage;
    stage.textContent = "";

    if (item.type === "video") {
      var v = document.createElement("video");
      v.src = item.file;
      if (item.poster) v.poster = item.poster;
      v.controls = true;        // in der Großansicht mit Ton und Bedienung
      v.autoplay = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute("aria-label", item.name);
      stage.appendChild(v);
    } else {
      // Großansicht nimmt die große Datei, nicht das Thumbnail.
      var img = document.createElement("img");
      img.src = item.file;
      img.alt = item.name;
      img.decoding = "async";
      stage.appendChild(img);
    }

    quickLook.el.querySelector(".quicklook__name").textContent = item.name;
    quickLook.el.querySelector(".quicklook__meta").textContent =
      (item.format || "–") + " · " + (quickLook.index + 1) + " / " + items.length;
  }

  function stepQuickLook(delta) {
    if (quickLook) showQuickLookItem(quickLook.index + delta);
  }

  function closeQuickLook() {
    if (!quickLook) return;
    var opener = quickLook.opener;
    quickLook.el.remove();
    quickLook = null;
    if (opener && document.contains(opener)) opener.focus();
  }

  // Kleines Fenster mit genau einer Angabe (Dock-Skills).
  function openSkillWindow(name, line, opener) {
    var key = "skill-" + name;
    if (raiseExisting(key)) return;

    var win = buildWindow(key, name, opener, "window--skill");
    var para = document.createElement("p");
    para.className = "skill-line";
    para.textContent = line;
    win.querySelector(".window__body").appendChild(para);

    mountWindow(win, "Fenster geöffnet: " + name);
  }

  function focusWindow(win) {
    zTop++;
    win.style.zIndex = String(zTop);
    // Stapelreihenfolge aktualisieren: fokussiertes Fenster ans Ende.
    var i = openWindows.indexOf(win);
    if (i > -1) { openWindows.splice(i, 1); openWindows.push(win); }
  }

  function closeWindow(win) {
    var i = openWindows.indexOf(win);
    if (i > -1) openWindows.splice(i, 1);

    // Nichts soll im Hintergrund weiterlaufen.
    win.querySelectorAll("video").forEach(function (v) { v.pause(); });
    if (quickLook && quickLook.win === win) closeQuickLook();

    win.classList.add("window--closing");
    var remove = function () { win.remove(); };
    win.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 500);   // Rückfall, falls die Animation ausfällt

    live.textContent = "Fenster geschlossen";

    var next = openWindows[openWindows.length - 1];
    if (next) {
      next.focus();
    } else {
      document.body.style.overflow = "";
      // Fokus zurück auf das Icon, das das Fenster geöffnet hat.
      if (win.opener && document.contains(win.opener)) win.opener.focus();
    }
  }

  /* ---------------------------------------------- Drag per Titelleiste */

  function makeDraggable(win, handle) {
    handle.addEventListener("pointerdown", function (e) {
      // Ampel-Buttons nicht als Drag-Griff behandeln.
      if (e.target.closest(".light")) return;
      if (mobileLayout()) return;        // Sheets werden nicht verschoben
      if (e.button !== 0 && e.pointerType === "mouse") return;

      var rect = win.getBoundingClientRect();
      var dx = e.clientX - rect.left;
      var dy = e.clientY - rect.top;
      handle.setPointerCapture(e.pointerId);

      function move(ev) {
        // Fenster im Viewport halten; die Titelleiste muss greifbar
        // bleiben, also auch nicht hinter dem Dock verschwinden.
        var maxLeft = window.innerWidth - 60;
        var maxTop = window.innerHeight - DOCK_RESERVE - 40;
        var left = Math.min(Math.max(ev.clientX - dx, -rect.width + 60), maxLeft);
        var top = Math.min(Math.max(ev.clientY - dy, 0), Math.max(0, maxTop));
        win.style.left = Math.round(left) + "px";
        win.style.top = Math.round(top) + "px";
      }
      function up() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  /* ---------------------------------------------- Globale Events */

  // Klick auf freie Desktop-Fläche hebt die Auswahl auf.
  desktop.addEventListener("click", function () { select(null); });

  document.addEventListener("keydown", function (e) {
    // Die Großansicht liegt oben, also reagiert sie zuerst: Escape schließt
    // erst sie, erst der zweite Druck das Fenster darunter.
    if (quickLookOpen()) {
      if (e.key === "Escape") { e.preventDefault(); closeQuickLook(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); stepQuickLook(1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); stepQuickLook(-1); return; }
      return;
    }
    if (e.key === "Escape" && openWindows.length) {
      closeWindow(openWindows[openWindows.length - 1]);
    }
  });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutIcons, 120);
  });

  /* ---------------------------------------------- Dock

     Das Dock ist vollständig datengetrieben: Einträge UND Grafiken werden
     ausschließlich über assets/icons/ gepflegt. icons.json bestimmt
     Reihenfolge, Gruppierung (daraus entstehen die Trennstriche), Label
     und Aktion; die Grafik ist die darin genannte Datei im selben Ordner.
     Austausch einer Grafik = Datei ersetzen (SVG oder PNG, Endung im
     Manifest anpassen). Im Code ist dafür nichts anzufassen; die Dateien
     werden als <img> eingebunden und nicht geparst oder umgefärbt.
     ---------------------------------------------------------------------- */

  var ICON_DIR = "assets/icons/";

  function dockItemElement(entry) {
    var isLink = entry.aktion === "link" && entry.href;
    var el = document.createElement(isLink ? "a" : "button");

    el.className = "dock__item";
    el.title = entry.label;
    el.setAttribute("aria-label", entry.label);

    if (isLink) {
      el.href = entry.href;
      // Externe Ziele in neuem Tab, mailto: bleibt im selben.
      if (/^https?:/i.test(entry.href)) {
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }
    } else {
      el.type = "button";
    }

    // Die Vergrößerung wirkt nur auf diesen Wrapper, nicht auf die Zelle:
    // so bleibt das Layout der Leiste stabil und das Schildchen darüber
    // wird nicht mitskaliert.
    var icon = document.createElement("span");
    icon.className = "dock__icon";

    if (entry.datei) {
      var img = document.createElement("img");
      img.src = ICON_DIR + entry.datei;
      img.alt = "";
      img.decoding = "async";
      // Fehlt die Datei, tritt der Labeltext an ihre Stelle — kein
      // kaputtes Bildsymbol.
      img.addEventListener("error", function () {
        img.replaceWith(textFallback(entry.label));
      });
      icon.appendChild(img);
    } else {
      icon.appendChild(textFallback(entry.label));
    }
    el.appendChild(icon);

    var tip = document.createElement("span");
    tip.className = "dock__tip";
    tip.textContent = entry.label;
    el.appendChild(tip);

    if (entry.aktion === "skill") {
      el.addEventListener("click", function () {
        openSkillWindow(entry.label, entry.text || "", el);
      });
    }

    return el;
  }

  function textFallback(label) {
    var span = document.createElement("span");
    span.className = "dock__text";
    span.textContent = label;
    return span;
  }

  function buildDock(entries) {
    var dock = document.getElementById("dock");
    dock.textContent = "";

    var lastGroup = null;
    entries.forEach(function (entry) {
      if (!entry || !entry.label) return;
      if (lastGroup !== null && entry.gruppe !== lastGroup) {
        var sep = document.createElement("span");
        sep.className = "dock__sep";
        sep.setAttribute("aria-hidden", "true");
        dock.appendChild(sep);
      }
      lastGroup = entry.gruppe;
      dock.appendChild(dockItemElement(entry));
    });

    enableMagnification(dock);
  }

  /* VERGRÖSSERUNG BEIM HOVER ----------------------------------------------
     Das Icon unter dem Zeiger wächst, die direkten Nachbarn abgestuft mit.
     Gerechnet wird über den Abstand der INDIZES zum Icon unter dem Zeiger,
     nicht über die Pixeldistanz — dadurch bleiben die Stufen gleichmäßig,
     egal wie breit eine Zelle gerade ist. Skaliert wird nur .dock__icon
     mit transform-origin: bottom center, deshalb wachsen die Icons nach
     oben und stehen unten weiter bündig auf einer Linie.
     ---------------------------------------------------------------------- */
  var MAG_STEPS = [1.45, 1.22, 1.08];

  function enableMagnification(dock) {
    var items = [].slice.call(dock.querySelectorAll(".dock__item"));
    if (!items.length) return;

    function apply(centerIndex) {
      items.forEach(function (el, i) {
        var d = centerIndex === null ? 99 : Math.abs(i - centerIndex);
        el.style.setProperty("--dock-scale", d < MAG_STEPS.length ? MAG_STEPS[d] : 1);
        el.classList.toggle("is-hovered", d === 0);
      });
    }

    dock.addEventListener("pointermove", function (e) {
      // Auf Touch und im Mobil-Layout bleibt die Leiste ruhig.
      if (e.pointerType === "touch" || mobileLayout() || reducedMotion.matches) return;
      var hit = e.target.closest ? e.target.closest(".dock__item") : null;
      apply(hit ? items.indexOf(hit) : null);
    });
    dock.addEventListener("pointerleave", function () { apply(null); });
  }

  fetch(ICON_DIR + "icons.json")
    .then(function (r) {
      if (!r.ok) throw new Error("icons.json: HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      var entries = data && Array.isArray(data.dock) ? data.dock : [];
      if (!entries.length) throw new Error("icons.json enthält keine Dock-Einträge");
      buildDock(entries);
    })
    .catch(function (err) {
      // Ohne Manifest sind weder Labels noch Ziele bekannt. Das Dock bleibt
      // sichtbar und sagt das auch, statt leer zu verschwinden.
      var dock = document.getElementById("dock");
      dock.textContent = "";
      dock.appendChild(textFallback("Dock nicht verfügbar"));
      live.textContent = "Dock konnte nicht geladen werden.";
      console.error(err);
    });

  /* ---------------------------------------------- Start */

  fetch("projects.json")
    .then(function (r) {
      if (!r.ok) throw new Error("projects.json: HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      projects = (data && data.projects ? data.projects : []).filter(function (p) {
        return p && p.slug && p.title && Array.isArray(p.items) && p.items.length;
      });
      if (!projects.length) {
        showNotice("Keine Projekte vorhanden.");
        return;
      }
      // _index = Platz in der Positionsliste, _id = eindeutiger Schlüssel.
      projects.forEach(function (p, i) { p._index = i; p._id = i; });
      buildIcons();
      layoutIcons();
    })
    .catch(function (err) {
      showNotice("Projekte konnten nicht geladen werden.");
      console.error(err);
    });
})();
