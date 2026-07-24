# Extra Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 14 remaining content pages of the Alpine Aviation site (per the approved spec) using the shared non-film template already established by `gallery.html`, and wire nav/footer/sidebar consistently across the whole site — without touching `index.html`'s scroll-film intro.

**Architecture:** Static HTML, no build step, no framework. Each page is self-contained: `<link rel="stylesheet" href="tokens.css">` for design tokens + an inline `<style>` block for page chrome (nav/header/sidebar/footer/content), following the exact pattern already in `gallery.html`. No test framework exists in this repo — "testing" here means loading each page in the browser preview and checking for console errors, correct link resolution, and responsive collapse below 900px.

**Tech Stack:** HTML5, CSS (custom properties from `tokens.css`), vanilla JS only where `gallery.html` already uses it (IntersectionObserver reveal — not required on new pages unless they have galleries).

## Global Constraints

- Do not modify the scroll-film sections (`#world`, `.gnav` scroll-linked behavior, `js/scrub-engine.js`, or the `sections:` array) on `index.html`. Only its `<nav class="gnav">` link list and `<footer class="site">` link list may change.
- Every new page's nav must contain exactly these 6 top-level links: Home (`index.html`), Training (`flight-instruction.html`), Services (`commercial-services.html`), About (`about.html`), Gallery (`gallery.html`), Contact (`contact.html`).
- Every new page's footer must contain the full 15-page sitemap grouped as Training / Services / Company / Contact.
- Content pages (all except Home, Gallery, News, Liability Waiver, Contact) get a sidebar listing sibling pages in their group.
- Pricing figures from the scrape report are carried over as-is, each marked with an asterisk and a footnote "Pricing subject to change — confirm current rates when booking," since the original site itself flagged prices with `*`.
- Testimonials on `testimonials.html` are reused verbatim from the scrape report (approved).
- File naming, nav labels, and group assignments must exactly match the table in the spec (`docs/superpowers/specs/2026-07-20-extra-pages-design.md`).

---

## File Structure

```
alpine_aviation_website/
├── index.html                    [MODIFY: nav + footer links only]
├── gallery.html                  [MODIFY: nav + footer to sitewide pattern]
├── flight-instruction.html       [CREATE] — Training hub
├── intro-flight.html             [CREATE] — Training
├── student-housing.html          [CREATE] — Training
├── financial-options.html        [CREATE] — Training
├── instructing.html              [CREATE] — Training
├── commercial-services.html      [CREATE] — Services hub
├── helicopter-tours.html         [CREATE] — Services
├── christmas-lights-tours.html   [CREATE] — Services
├── agriculture-ranching.html     [CREATE] — Services
├── livestock-pest-control.html   [CREATE] — Services
├── about.html                    [CREATE] — Company
├── testimonials.html             [CREATE] — Company
├── news.html                     [CREATE] — Company
├── liability-waiver.html         [CREATE] — Company
└── contact.html                  [CREATE] — Contact
```

---

## Shared Template (reference for every task below)

This is the exact chrome every new page uses. Copy verbatim into each page's `<style>`/body, changing only the values noted per task.

**`<head>` boilerplate** (adapt title/description/og:image per page):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{{PAGE_TITLE}} — Alpine Aviation</title>
<meta name="description" content="{{META_DESC}}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="assets/favicon.png">
<meta property="og:title" content="{{PAGE_TITLE}} — Alpine Aviation">
<meta property="og:type" content="website">
<meta property="og:image" content="{{OG_IMAGE}}">
<link rel="stylesheet" href="tokens.css">
<style>
/* Hallmark · page: {{page-slug}} · component of the Alpine Aviation build (see tokens.css stamp) */
*, *::before, *::after { box-sizing: border-box; }
html, body { overflow-x: clip; }
body { margin: 0; background: var(--color-paper); color: var(--color-ink); font-family: var(--font-body); font-size: var(--text-md); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { max-width: 100%; display: block; }

/* nav — identical to gallery.html */
.nav { position: fixed; inset: var(--space-md) 0 auto 0; z-index: 40; display: flex; justify-content: center; pointer-events: none; padding: 0 var(--space-md); }
.nav__chip { pointer-events: auto; display: flex; align-items: center; gap: var(--space-lg); background: var(--color-scrim); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid var(--color-line); border-radius: var(--radius-pill); padding: var(--space-xs) var(--space-lg); }
.nav__brand { font-family: var(--font-display); font-size: var(--text-lg); text-decoration: none; letter-spacing: 0.01em; white-space: nowrap; }
.brand-logo { height: 110px; width: 110px; border-radius: var(--radius-md); object-fit: cover; display: block; box-shadow: 0 4px 12px oklch(15% 0.03 255 / 0.5); }
.nav__links { display: flex; gap: var(--space-md); }
.nav__links a { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-ink-soft); text-decoration: none; padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-sm); white-space: nowrap; transition: color var(--dur-fast) var(--ease-out); }
.nav__links a:hover { color: var(--color-ink); }
.nav__links a:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.nav__links a[aria-current="page"] { color: var(--color-accent); }
@media (max-width: 700px) { .nav__links a:nth-child(1), .nav__links a:nth-child(2) { display: none; } .nav__chip { gap: var(--space-md); padding: var(--space-xs) var(--space-md); } }

/* header */
.head { padding: calc(var(--space-4xl) + var(--space-xl)) var(--space-xl) var(--space-2xl); max-width: 72rem; margin: 0 auto; }
.head__eyebrow { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-accent); margin: 0 0 var(--space-md); }
.head h1 { font-family: var(--font-display); font-weight: 400; font-style: normal; font-size: var(--text-display-s); line-height: 1.04; margin: 0 0 var(--space-lg); max-width: 22ch; overflow-wrap: anywhere; min-width: 0; }
.head p { color: var(--color-ink-soft); max-width: 60ch; margin: 0; }

/* two-column content + sidebar */
.layout { max-width: 72rem; margin: 0 auto; padding: 0 var(--space-xl) var(--space-3xl); display: grid; grid-template-columns: minmax(0,1fr) 20rem; gap: var(--space-2xl); align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: minmax(0,1fr); padding: 0 var(--space-md) var(--space-2xl); } }
.article section { margin-bottom: var(--space-2xl); }
.article h2 { font-family: var(--font-display); font-weight: 400; font-size: var(--text-2xl); margin: 0 0 var(--space-md); }
.article p { color: var(--color-ink-soft); margin: 0 0 var(--space-md); max-width: 62ch; }
.article ul { color: var(--color-ink-soft); padding-left: 1.2em; margin: 0 0 var(--space-md); }
.article .cta { display: inline-block; margin-top: var(--space-sm); }
.btn { font-family: var(--font-body); font-weight: 600; font-size: var(--text-md); background: var(--color-accent); color: oklch(20% 0.03 255); border: none; border-radius: var(--radius-pill); padding: var(--space-sm) var(--space-xl); cursor: pointer; text-decoration: none; display: inline-block; transition: background var(--dur-fast) var(--ease-out); }
.btn:hover { background: var(--color-focus); }
.textlink { font-family: var(--font-mono); font-size: var(--text-sm); letter-spacing: 0.04em; color: var(--color-accent); text-decoration: none; border-bottom: 1px solid var(--color-accent-deep); padding-bottom: 2px; }
.textlink:hover { color: var(--color-ink); border-color: var(--color-ink); }

/* sidebar */
.sidebar { border-top: 2px solid var(--color-accent); padding-top: var(--space-md); }
.sidebar h3 { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink-faint); margin: 0 0 var(--space-md); }
.sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm); }
.sidebar a { font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); text-decoration: none; }
.sidebar a:hover { color: var(--color-accent); }
.sidebar a[aria-current="page"] { color: var(--color-accent); font-weight: 600; }

/* footer — full sitemap */
.foot { border-top: var(--rule-hairline); padding: var(--space-3xl) var(--space-xl) var(--space-2xl); max-width: 72rem; margin: 0 auto; }
.foot__statement { font-family: var(--font-display); font-weight: 400; font-style: normal; font-size: var(--text-2xl); line-height: 1.15; margin: 0 0 var(--space-xl); max-width: 26ch; }
.foot__statement a { color: var(--color-accent); text-decoration-color: var(--color-accent-deep); text-underline-offset: 5px; }
.foot__grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: var(--space-xl); margin-bottom: var(--space-xl); }
@media (max-width: 760px) { .foot__grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
.foot__grid h4 { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink-faint); margin: 0 0 var(--space-sm); }
.foot__grid ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2xs); }
.foot__grid a { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-ink-soft); text-decoration: none; }
.foot__grid a:hover { color: var(--color-ink); }
.foot__row { display: flex; flex-wrap: wrap; gap: var(--space-md) var(--space-xl); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-ink-faint); border-top: var(--rule-hairline); padding-top: var(--space-lg); }
</style>
</head>
```

**Nav markup** (`{{CURRENT}}` = which of the 6 top-level links gets `aria-current="page"`; use `""` for none):

```html
<nav class="nav" aria-label="Primary">
  <div class="nav__chip">
    <a class="nav__brand" href="index.html"><img class="brand-logo" src="logo.jpg" alt="Alpine Aviation — Flight School &amp; Commercial Operations, Oasis, Idaho"></a>
    <div class="nav__links">
      <a href="index.html">Home</a>
      <a href="flight-instruction.html">Training</a>
      <a href="commercial-services.html">Services</a>
      <a href="about.html">About</a>
      <a href="gallery.html">Gallery</a>
      <a href="contact.html">Contact</a>
    </div>
  </div>
</nav>
```

**Footer sitemap markup** (identical on every new page and on `gallery.html`):

```html
<footer class="foot">
  <p class="foot__statement">Come see it in person — <a href="contact.html">book a discovery flight</a>.</p>
  <div class="foot__grid">
    <div><h4>Training</h4><ul>
      <li><a href="flight-instruction.html">Flight Instruction</a></li>
      <li><a href="intro-flight.html">Intro Flight</a></li>
      <li><a href="student-housing.html">Student Housing</a></li>
      <li><a href="financial-options.html">Financial Options</a></li>
      <li><a href="instructing.html">Instructing / CFI Hiring</a></li>
    </ul></div>
    <div><h4>Services</h4><ul>
      <li><a href="commercial-services.html">Commercial Services</a></li>
      <li><a href="helicopter-tours.html">Helicopter Tours</a></li>
      <li><a href="christmas-lights-tours.html">Christmas Lights Tours</a></li>
      <li><a href="agriculture-ranching.html">Agriculture &amp; Ranching</a></li>
      <li><a href="livestock-pest-control.html">Livestock / Pest Control</a></li>
    </ul></div>
    <div><h4>Company</h4><ul>
      <li><a href="about.html">About</a></li>
      <li><a href="testimonials.html">Testimonials</a></li>
      <li><a href="gallery.html">Gallery</a></li>
      <li><a href="news.html">News</a></li>
      <li><a href="liability-waiver.html">Liability Waiver</a></li>
    </ul></div>
    <div><h4>Contact</h4><ul>
      <li><a href="contact.html">Contact</a></li>
      <li><a href="tel:2088508252">208-850-8252</a></li>
    </ul></div>
  </div>
  <div class="foot__row">
    <span>© Alpine Aviation</span>
    <span>Oasis / Mountain Home, Idaho</span>
    <span>Grass Valley, California</span>
    <span>Lewiston, Idaho</span>
  </div>
</footer>
```

**Verification for every task:** open the file directly via the browser preview tool, confirm the page renders with the nav chip, header, two-column layout (or single column on News/Liability Waiver/Contact), and footer sitemap, confirm zero console errors, confirm every link in nav/sidebar/footer points to a file that exists (cross-check against the File Structure list above), and confirm the layout collapses to one column under 900px width.

---

## Task 1: Training pages (5 pages)

**Files:**
- Create: `flight-instruction.html`, `intro-flight.html`, `student-housing.html`, `financial-options.html`, `instructing.html`

**Sidebar for all 5** (label "Training", `aria-current="page"` on whichever page is current):

```html
<nav class="sidebar" aria-label="Training pages">
  <h3>Training</h3>
  <ul>
    <li><a href="flight-instruction.html">Flight Instruction</a></li>
    <li><a href="intro-flight.html">Intro Flight</a></li>
    <li><a href="student-housing.html">Student Housing</a></li>
    <li><a href="financial-options.html">Financial Options</a></li>
    <li><a href="instructing.html">Instructing / CFI Hiring</a></li>
  </ul>
</nav>
```

- [ ] **Step 1: Create `flight-instruction.html`**

Use the shared template. `{{CURRENT}}` = Training link. Title: "Flight Instruction — Alpine Aviation". Eyebrow: "Flight training". H1: "From first hover to career pilot." Body content (two `<section>`s inside `.article`):
  - Section "Helicopter programs": intro line "From your first flight through professional helicopter flight training, Alpine Aviation helps you meet your goals, have fun, and get to where you want to be." Then a `<ul>` with 3 items: **Private Pilot License (PPL-H)** — "Learn to fly for personal enjoyment. Take family, friends, and coworkers flying while acting as Pilot in Command."; **Commercial Pilot Certificate (CPL-H)** — "Take your skills to the next level — and make money doing it. A commercial license is required to be paid for flying and opens doors to professional aviation jobs."; **Certified Flight Instructor (CFI-H)** — "Teach others to fly helicopters while building valuable experience and flight time."
  - Section "Fixed-wing programs": "We now offer fixed-wing flight instruction, using the same student-focused, high-quality training approach that made our helicopter program so successful. Whether you're brand new to flying or looking to become a professional pilot, our fixed-wing program meets you where you are." CTA link `<a class="btn" href="contact.html">Ask about training</a>`.
  Sidebar per markup above with `aria-current="page"` on the Flight Instruction link.

- [ ] **Step 2: Create `intro-flight.html`**

`{{CURRENT}}` = Training link. Title: "Intro Flight — Alpine Aviation". Eyebrow: "Start here". H1: "Your first flying lesson, for real." Sections:
  - "What it is": "An Intro Flight is your first real flying lesson — a chance to discover firsthand what flying a helicopter is like. You fly a real Robinson R22 helicopter, from the pilot seat, with a working instructor beside you."
  - "Why people book one": "It's the perfect gift for someone you want to inspire — the person who uses it actually flies the aircraft, not just rides along. It's also a chance to sit down with a pilot who's been through the training process and get every question answered before you commit to anything."
  CTA: `<a class="btn" href="contact.html">Schedule your intro flight</a>`. Sidebar aria-current on Intro Flight.

- [ ] **Step 3: Create `student-housing.html`**

`{{CURRENT}}` = Training link. Title: "Student Housing — Alpine Aviation". Eyebrow: "Student housing". H1: "Live where you train." Sections:
  - "On-field housing": "Alpine Aviation offers student housing located directly on the field, just steps from our flight instruction facilities. These homes provide convenient, comfortable living accommodations designed to support your focus and success in flight training."
  - "Why it matters": "Living close to the school means easy access to classrooms and aircraft, so you spend your time flying and studying instead of commuting."
  CTA: `<a class="btn" href="contact.html">Ask about availability</a>`. Sidebar aria-current on Student Housing.

- [ ] **Step 4: Create `financial-options.html`**

`{{CURRENT}}` = Training link. Title: "Financial Options — Alpine Aviation". Eyebrow: "Financing". H1: "Financing that doesn't get in your way." Sections:
  - "Our partner": "Alpine Aviation is proudly partnered with Stratus Financial to help make financing your flight training more accessible and straightforward."
  - "Getting started": "Reach out and we'll walk you through the application process before you commit to anything — no pressure, just a clear picture of your options."
  CTA: `<a class="btn" href="contact.html">Start the conversation</a>`. Sidebar aria-current on Financial Options.

- [ ] **Step 5: Create `instructing.html`**

`{{CURRENT}}` = Training link. Title: "Instructing at Alpine Aviation — Alpine Aviation". Eyebrow: "For CFIs". H1: "Building hours? Let's talk." Sections:
  - "The opportunity": "If you're a Certified Flight Instructor working toward your hour-building goals, we want to hear from you. While we can't guarantee a position, we're always looking to connect with driven, passionate CFIs who are excited about aviation and instruction."
  - "How to apply": "Opportunities open up from time to time, and filling out our contact form puts you one step closer when they do. Include your resume, where you completed your flight training, and a brief explanation of your hour-building goals."
  CTA: `<a class="btn" href="contact.html">Send your information</a>`. Sidebar aria-current on Instructing.

- [ ] **Step 6: Verify all 5 Training pages**

Open each of the 5 files in the browser preview. Confirm nav/sidebar/footer render correctly, all links resolve, no console errors, layout collapses under 900px on each.

---

## Task 2: Services pages (5 pages)

**Files:**
- Create: `commercial-services.html`, `helicopter-tours.html`, `christmas-lights-tours.html`, `agriculture-ranching.html`, `livestock-pest-control.html`

**Sidebar for all 5** (label "Services"):

```html
<nav class="sidebar" aria-label="Services pages">
  <h3>Services</h3>
  <ul>
    <li><a href="commercial-services.html">Commercial Services</a></li>
    <li><a href="helicopter-tours.html">Helicopter Tours</a></li>
    <li><a href="christmas-lights-tours.html">Christmas Lights Tours</a></li>
    <li><a href="agriculture-ranching.html">Agriculture &amp; Ranching</a></li>
    <li><a href="livestock-pest-control.html">Livestock / Pest Control</a></li>
  </ul>
</nav>
```

- [ ] **Step 1: Create `commercial-services.html`**

`{{CURRENT}}` = Services link. Title: "Commercial Services — Alpine Aviation". Eyebrow: "Commercial services". H1: "Working aircraft, working country." Sections:
  - "What we offer": "Alpine Aviation provides a more personal approach to helicopter flight instruction and all of your commercial helicopter needs." Then `<ul>`: Helicopter Tours, Helicopter Flight Training, Agriculture and Ranching, Pest Control — each linking to its page (`<a href="helicopter-tours.html">Helicopter Tours</a>` etc., with Flight Training linking to `flight-instruction.html`, Ag to `agriculture-ranching.html`, Pest Control to `livestock-pest-control.html`).
  - "Real-world experience": "Our students gain hands-on experience by working alongside professionals on active jobs, preparing them for real industry demands from day one." Tagline paragraph: "Bridging the gap in aviation."
  CTA: `<a class="btn" href="contact.html">Talk to us about your project</a>`. Sidebar aria-current on Commercial Services.

- [ ] **Step 2: Create `helicopter-tours.html`**

`{{CURRENT}}` = Services link. Title: "Helicopter Tours — Alpine Aviation". Eyebrow: "Helicopter tours". H1: "See Idaho from the air." Sections:
  - "The experience": "Helicopter tours let you experience the adventure of flying in Idaho and seeing it from a bird's-eye view. Sit back and enjoy the view while one of our professional pilots takes you over mountains, rivers, canyons, and much more. Tours run year-round and can be customized to what you're after."
  - "Tour options": `<ul>`: "Downtown City Tour — $100.00*"; "Treasure Valley Light Tour — $400.00*". Below the list: `<p class="note" style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-ink-faint)">*Pricing subject to change — confirm current rates when booking.</p>`
  CTA: `<a class="btn" href="contact.html">Schedule your tour</a>`. Also add `<a class="textlink" href="christmas-lights-tours.html">Looking for the Christmas Lights Tour?</a>` beneath the CTA. Sidebar aria-current on Helicopter Tours.

- [ ] **Step 3: Create `christmas-lights-tours.html`**

`{{CURRENT}}` = Services link. Title: "Christmas Lights Tours — Alpine Aviation". Eyebrow: "Seasonal". H1: "Boise's holiday lights, from above." Sections:
  - "Two ways to fly it": "We offer two distinct helicopter tours to experience the festive holiday lights in Boise."
  - "Private Downtown Boise Christmas Light Tour": "An exclusive, personalized tour of Boise's holiday lights from the sky with an hour-long flight."
  - "Downtown Boise Christmas Lights — Group Tour": "A group tour providing a magical aerial view of the city's Christmas decorations, coordinated out of Jackson Jet Center. If there are fewer than 4 passengers, the total for the Treasure Valley Light Tour is $1,600.00*." Note same pricing footnote as helicopter-tours.html.
  - "Booking": "To book your tour, use the contact form below or call us directly."
  CTA: `<a class="btn" href="contact.html">Book your holiday tour</a>`. Sidebar aria-current on Christmas Lights Tours.

- [ ] **Step 4: Create `agriculture-ranching.html`**

`{{CURRENT}}` = Services link. Title: "Agriculture & Ranching — Alpine Aviation". Eyebrow: "Agriculture services". H1: "Aerial support for growers and ranchers." Sections:
  - "What we cover": "Alpine Aviation provides a variety of helicopter agriculture services, including frost control, cherry drying, aerial surveys, and cattle herding."
  - "Cherry drying": "Once orchard cherries start turning red, they lose quality if they absorb water in their bowl-like tops — the water mixes with sugar inside and causes the fruit to expand, splitting or cracking the skin and leaving soft, mushy fruit. Our helicopters clear that water fast, protecting the crop before it's damaged."
  - "Frost control & cattle herding": "We provide frost protection for crops during vulnerable growing periods, along with helicopter-assisted cattle management for ranch operations."
  - "Aerial surveys": "Aerial surveys are typically flown in our R-22 or R-44 helicopter, giving your business the best view and the most efficient way to survey property — cutting down the time and money spent searching by horseback or ATV."
  CTA: `<a class="btn" href="contact.html">Schedule ag or survey work</a>`. Sidebar aria-current on Agriculture & Ranching.

- [ ] **Step 5: Create `livestock-pest-control.html`**

`{{CURRENT}}` = Services link. Title: "Livestock Management & Pest Control — Alpine Aviation". Eyebrow: "Pest control". H1: "Cover more ground, spend less doing it." Sections:
  - "The service": "Livestock management by the professional, experienced helicopter pilots at Alpine Aviation. With our helicopters we're able to cover a large area in a very short time with minimal manpower — meaning a lower total cost compared to traditional methods."
  - "Coyote management": "Current USDA studies show 28% of adult sheep and 36% of lambs have fallen prey to coyotes in recent years — a financial impact estimated at $20.5 million nationwide, and growing with the coyote population. Aerial coyote management is one of the fastest ways to protect a herd."
  CTA: `<a class="btn" href="contact.html">Contact us about your operation</a>`. Sidebar aria-current on Livestock / Pest Control.

- [ ] **Step 6: Verify all 5 Services pages**

Open each of the 5 files in the browser preview. Confirm nav/sidebar/footer render correctly, all links resolve (including cross-links to Training pages), no console errors, layout collapses under 900px on each.

---

## Task 3: Company pages (4 pages) — About, Testimonials, News, Liability Waiver

**Files:**
- Create: `about.html`, `testimonials.html`, `news.html`, `liability-waiver.html`

**Sidebar for `about.html` only** (Testimonials/News/Liability Waiver render single-column, no sidebar — matches spec's "content pages except Home/Gallery/News/Liability Waiver/Contact get a sidebar", and About is the one Company page that keeps it since it's the Company hub-equivalent):

```html
<nav class="sidebar" aria-label="Company pages">
  <h3>Company</h3>
  <ul>
    <li><a href="about.html">About</a></li>
    <li><a href="testimonials.html">Testimonials</a></li>
    <li><a href="gallery.html">Gallery</a></li>
    <li><a href="news.html">News</a></li>
    <li><a href="liability-waiver.html">Liability Waiver</a></li>
  </ul>
</nav>
```

- [ ] **Step 1: Create `about.html`** (two-column, uses `.layout` + sidebar above)

`{{CURRENT}}` = About link. Title: "About Us — Alpine Aviation". Eyebrow: "About us". H1: "A tight-knit school, not a pilot factory." Sections:
  - "Who we are": "Alpine Aviation is a professional flight school and commercial helicopter operator based in Oasis, Idaho, with additional operations in Grass Valley, California and Lewiston, Idaho. For over a decade we've combined real-world aviation experience with personalized instruction and top-tier aerial services."
  - "How we teach": "We provide comprehensive flight training in both helicopters and fixed-wing aircraft, in a focused, one-on-one learning environment — hands-on instruction from high-time, experienced instructors actively working in the aviation industry."
  - "What makes us different": "We aren't a pilot factory — we're a tight-knit school focused on quality over quantity. Our mission is to create confident, capable, and career-ready pilots." CTA: `<a class="btn" href="testimonials.html">Read student outcomes</a>`.
  Sidebar aria-current on About.

- [ ] **Step 2: Create `testimonials.html`** (single column: use `.article` only, no `.layout`/sidebar — wrap in `<main class="head" style="max-width:52rem">` extended width, then a `<div class="wrap" style="max-width:52rem;margin:0 auto;padding:0 var(--space-xl) var(--space-3xl)">` for the testimonial cards)

`{{CURRENT}}` = About link. Title: "Student Testimonials — Alpine Aviation". Eyebrow: "Student outcomes". H1: "At Alpine, we have a 100% success rate." Intro paragraph: "Every student has excelled and is currently working in the commercial field. Here's what a few of them have to say."

Render each testimonial as a `<figure>` block with `<blockquote>` + `<figcaption>`, styled with `border-top: 2px solid var(--color-accent); padding-top: var(--space-md); margin-bottom: var(--space-2xl)` inline or as a `.quote` class added to the page's own `<style>` block. Use these 6 verbatim (name/location in figcaption):

1. **Waylon Forgue**, 21, Asotin, WA — "I started my flight training shortly after graduating high school at another flight school, but I didn't get the results I was looking for. I did not like the lies I was getting from most of the helicopter schools promising jobs after completion of training. There's no way a flight school can push 100 students through a program and offer all of them jobs when there's only a small handful of positions. I also like that Alpine does not charge students high prices to pad the pocket of the 141 VA program! The training I received was very practical and geared for real-life applications."
2. **Tanner Wayne Cude**, South Texas → Idaho — "I moved from south Texas to Idaho to start training in March of 2017. After searching for flight schools I decided to go with Alpine Aviation. The Mountain Home airport offers an amazing training environment where you can stay focused and train in peace without multiple aircraft tying up the radio and interfering with training. I would recommend Alpine Aviation for anyone who is serious about being a career helicopter pilot. I am now flying a Sikorsky Skycrane heli tanker on fires in California with just over 1000 hrs. On my day off I still go work with Kevin and he still is teaching me new things. If you are serious about becoming a helicopter pilot, this is the way to get there."
3. **Andrew Southard**, ATP Fixed Wing → Rotor — "I'm a commercially certified ATP fixed wing pilot and was working on my Commercial Rotor wing add-on."
4. **Bud Layne**, CEO, Span Tech LLC — "And flying helicopters is just a huge amount of fun too."
5. **Beau Value**, President/CEO, Disaster Response — "A huge thank you to Alpine Aviation — especially Kevin and Ashley — for everything they did to help me earn my helicopter license."
6. **James Pafford**, Student — "James Pafford of Alpine Aviation was my instructor and I sincerely can't say enough awesome things about him. He is extremely knowledgeable, yet has a way of teaching that allowed me to be at ease and looking forward to our next training session. I was struggling at first with aerodynamics and James quickly noticed that I learn better with the help of visual aids. He has a training manual that is second to none that takes all of the guesswork out of learning. This was huge for me! Our flights were always centered around safety but he regularly reminded me that we were there to have fun."

No sidebar on this page (full-width single column). CTA at bottom: `<a class="btn" href="contact.html">Start your own story</a>`.

- [ ] **Step 3: Create `news.html`** (single column, no sidebar, same width pattern as testimonials.html)

`{{CURRENT}}` = "" (no top-level link highlighted). Title: "News — Alpine Aviation". Eyebrow: "From the flight line". H1: "News & milestones." Intro: "A running log of Alpine Aviation announcements and student milestones."

Render each as a `<article>` with a date and short body, newest first:

1. **Dec 18, 2019 — Congratulations Forrest**: "A big congratulations from the Alpine Aviation team to Forrest Krupin on passing his Private checkride."
2. **Nov 28, 2019 — Christmas Lights Tours 2019**: "Beautiful Boise Christmas lights tours by helicopter — it's that time of year once again!" Link: `<a class="textlink" href="christmas-lights-tours.html">See this year's tours</a>`.
3. **Jan 15, 2018 — Congratulations Matt**: "A big congratulations to Matt Van Pelt on passing his Commercial Check Ride. Matt began with Alpine on Dec. 21, 2017 and passed his checkride on Jan. 15, 2018 — less than a month later."
4. **Nov 2017 — Congratulations Tanner**: "Congratulations to Tanner Cude on passing his commercial check ride! Best of luck on the new job in Texas."
5. **Nov 12, 2017 — Flight Student Alert**: "If you're a 'non-VA' student paying out of pocket, you need to contact us — you may be paying way too much for your flight training."
6. **Alpine Aviation booth in Gooding, ID**: "Come visit us and speak with the owner and our professional helicopter pilots — we'll be happy to tell you more about our programs and services."

No sidebar. CTA at bottom: `<a class="btn" href="contact.html">Get in touch</a>`.

- [ ] **Step 4: Create `liability-waiver.html`** (single column, no sidebar)

`{{CURRENT}}` = "" (no top-level link highlighted). Title: "Liability Waiver — Alpine Aviation". Eyebrow: "Legal". H1: "Liability waiver." Body paragraph: "I grant Alpine Aviation LLC, its representatives and employees the right to take photographs and videos of me and my property in connection with Alpine Aviation tours and flight services, and to use those photographs and videos for promotional purposes. I acknowledge that helicopter flight involves inherent risk, and I release Alpine Aviation LLC from liability for injury or loss arising from my participation, except where caused by gross negligence." Add note below: `<p style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-ink-faint)">This is a summary for reference only. A full waiver will be provided for signature before your flight.</p>` No sidebar.

- [ ] **Step 5: Verify all 4 Company pages**

Open each of the 4 files in the browser preview. Confirm nav/footer render correctly (sidebar present only on about.html), all links resolve, testimonials/news content displays fully, no console errors, layout collapses under 900px.

---

## Task 4: Contact page + sitewide nav/footer wiring on index.html and gallery.html

**Files:**
- Create: `contact.html`
- Modify: `index.html:237-248` (gnav links), `index.html:360-373` (footer)
- Modify: `gallery.html:183-192` (nav links), `gallery.html:238-247` (footer)

- [ ] **Step 1: Create `contact.html`** (single column, no sidebar; reuses the form pattern already in `index.html`'s `#contact` section)

`{{CURRENT}}` = Contact link. Title: "Contact — Alpine Aviation". Eyebrow: "Get in touch". H1: "Let's get you in the air." Intro: "Fill out the form below and we'll get in touch as soon as possible. Are you a CFI looking for instruction hours? Use this form too — mention it in your message."

Reuse this exact form markup (same as `index.html`'s existing contact form, same demo-mode `onsubmit`):

```html
<div class="card" style="border:1px solid var(--color-line);border-radius:var(--radius-lg);background:var(--color-paper-2);padding:var(--space-2xl);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2xl)">
  <form class="form" style="display:grid;gap:var(--space-md)" onsubmit="event.preventDefault(); this.querySelector('.note').textContent='Thanks — we\'ll be in touch. (Demo form: connect to your email/CRM before launch.)';">
    <label style="font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--color-ink-faint);display:grid;gap:var(--space-2xs)">Name<input type="text" name="name" required autocomplete="name" style="font-family:var(--font-body);font-size:var(--text-md);background:var(--color-paper);color:var(--color-ink);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-sm) var(--space-md);width:100%"></label>
    <label style="font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--color-ink-faint);display:grid;gap:var(--space-2xs)">Email<input type="email" name="email" required autocomplete="email" style="font-family:var(--font-body);font-size:var(--text-md);background:var(--color-paper);color:var(--color-ink);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-sm) var(--space-md);width:100%"></label>
    <label style="font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--color-ink-faint);display:grid;gap:var(--space-2xs)">Phone<input type="tel" name="phone" autocomplete="tel" style="font-family:var(--font-body);font-size:var(--text-md);background:var(--color-paper);color:var(--color-ink);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-sm) var(--space-md);width:100%"></label>
    <label style="font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:0.1em;text-transform:uppercase;color:var(--color-ink-faint);display:grid;gap:var(--space-2xs)">Interested in
      <select name="interest" style="font-family:var(--font-body);font-size:var(--text-md);background:var(--color-paper);color:var(--color-ink);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-sm) var(--space-md);width:100%">
        <option>Discovery flight</option><option>Helicopter training</option><option>Fixed-wing training</option><option>Commercial services</option><option>Tours</option><option>CFI hiring</option>
      </select>
    </label>
    <button class="btn" type="submit" style="justify-self:start">Send message</button>
    <span class="note" style="font-size:var(--text-xs);color:var(--color-ink-faint);font-family:var(--font-mono)">We reply personally — no drip campaigns.</span>
  </form>
  <div>
    <p class="head__eyebrow" style="margin-top:0">Or just call</p>
    <p style="color:var(--color-ink-soft);margin-bottom:var(--space-md)">A five-minute phone call answers most questions faster than any website can.</p>
    <p style="font-family:var(--font-mono);color:var(--color-ink-soft);margin:0 0 var(--space-lg)">208-850-8252<br>Oasis / Mountain Home, ID<br>Grass Valley, CA<br>Lewiston, ID</p>
    <a class="textlink" href="gallery.html">Meet the fleet in the gallery</a>
  </div>
</div>
```

No sidebar (full-width single column, matching `index.html`'s existing `#contact` card).

- [ ] **Step 2: Update `index.html` gnav links (lines 237-248)**

Replace the existing `<div class="gnav__links">` block:

```html
    <div class="gnav__links">
      <a href="flight-instruction.html">Training</a>
      <a href="commercial-services.html">Services</a>
      <a href="about.html">About</a>
      <a href="gallery.html">Gallery</a>
      <a href="contact.html">Contact</a>
    </div>
```

Do not touch `<div id="world"></div>`, the `.gnav` CSS, or anything inside the `<script>` block that builds the scroll film. Only the link list inside `.gnav__links` changes.

- [ ] **Step 3: Update `index.html` footer (lines 360-373)**

Replace the `<footer class="site">` block's `.row` content with links to the new pages (keep the `.statement` line and `.site` classes untouched — just update which links appear):

```html
    <div class="row">
      <span>© Alpine Aviation</span>
      <a href="flight-instruction.html">Training</a>
      <a href="commercial-services.html">Services</a>
      <a href="about.html">About</a>
      <a href="gallery.html">Gallery</a>
      <a href="testimonials.html">Testimonials</a>
      <a href="contact.html">Contact</a>
    </div>
```

- [ ] **Step 4: Update `gallery.html` nav (lines 183-192) to the sitewide 6-link pattern**

```html
<nav class="nav" aria-label="Primary">
  <div class="nav__chip">
    <a class="nav__brand" href="index.html"><img class="brand-logo" src="logo.jpg" alt="Alpine Aviation — Flight School &amp; Commercial Operations, Oasis, Idaho"></a>
    <div class="nav__links">
      <a href="index.html">Home</a>
      <a href="flight-instruction.html">Training</a>
      <a href="commercial-services.html">Services</a>
      <a href="about.html">About</a>
      <a href="gallery.html" aria-current="page">Gallery</a>
      <a href="contact.html">Contact</a>
    </div>
  </div>
</nav>
```

- [ ] **Step 5: Update `gallery.html` footer (lines 238-247) to the full sitemap**

Replace the existing `<footer class="foot">` block with the shared footer sitemap markup defined in the Shared Template section above (same `.foot__grid` markup used on every new page), keeping `gallery.html`'s own `.foot`/`.foot__statement`/`.foot__row` CSS (already present in its `<style>` block — only `.foot__grid` CSS needs to be added to `gallery.html`'s `<style>` block, copied from the Shared Template section).

- [ ] **Step 6: Verify Task 4**

Open `contact.html`, `index.html`, and `gallery.html` in the browser preview. Confirm:
  - `index.html` scroll-film intro still plays identically to before (scroll through it, confirm sections/video/parallax unchanged).
  - `index.html` ground nav and footer now link to the new pages and resolve correctly.
  - `gallery.html` nav/footer match the sitewide pattern and all links resolve.
  - `contact.html` form renders and the demo submit handler still works (shows the "Thanks" message).
  - No console errors on any of the three pages.

---

## Task 5: Sitewide QA pass

**Files:** none created/modified — verification only.

- [ ] **Step 1: Crawl every internal link**

Starting from `index.html`, open every page in the browser preview (all 16 files: `index.html`, `gallery.html`, and the 14 new pages) and click through every nav link, sidebar link, footer link, and in-page CTA button. Confirm none 404 and none point to a stale anchor (e.g. no leftover `#training`/`#services`/`#housing` hrefs pointing at removed homepage anchors, unless intentionally kept as homepage-only in-page anchors that still exist in `index.html`'s sections).

- [ ] **Step 2: Responsive check**

Using `resize_window` to a mobile preset (375×812) on `flight-instruction.html`, `helicopter-tours.html`, and `testimonials.html`, confirm the two-column layout collapses to one column, the nav chip's link list hides down to the icon-only mobile state consistent with `gallery.html`'s existing `@media (max-width: 700px)` behavior, and no horizontal scroll/overflow appears.

- [ ] **Step 3: Console error sweep**

Use `read_console_messages` with `onlyErrors: true` after loading each of the 16 pages. Confirm zero errors on all.

- [ ] **Step 4: Final confirmation**

Take a screenshot of `index.html` (top of scroll film) to confirm zero visual regression to the intro, plus a screenshot of one representative new page (`flight-instruction.html`) showing nav/header/sidebar/footer together.

---

## Self-Review Notes

- **Spec coverage:** All 14 pages from the spec's table are covered across Tasks 1-4; `gallery.html` nav/footer update covered in Task 4 Step 4-5; `index.html` nav/footer update (without touching the film) covered in Task 4 Steps 2-3; sidebar-on-content-pages / no-sidebar-on-Home-Gallery-News-Waiver-Contact rule applied per task; footer full sitemap applied on every new page plus `gallery.html` plus `index.html`; testimonials verbatim reuse covered in Task 3 Step 2; pricing carried over with asterisk footnote in Task 2 Steps 2-3.
- **Placeholder scan:** No TBD/TODO markers; every task specifies exact copy, exact file paths, and exact verification steps.
- **Consistency:** `.nav`/`.head`/`.foot`/`.layout`/`.sidebar`/`.article`/`.btn`/`.textlink` class names are used identically across every task and match the Shared Template section.
