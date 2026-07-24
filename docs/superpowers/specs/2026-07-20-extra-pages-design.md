# Extra Pages — Design Spec

**Date:** 2026-07-20
**Status:** Approved by user

## Goal

Build out the remaining pages of the Alpine Aviation site to match the content and structure of the
original flyalpineaviation.com (per `flyalpineaviation_scrape_report.md`), while keeping the
existing homepage (`index.html`) scroll-film intro completely untouched. New pages reuse the
non-film template already established by `gallery.html` (floating pill nav, header, content, footer).

## Non-goals

- Do not modify the scroll-film sections or `js/scrub-engine.js` on `index.html`.
- Do not rebuild WordPress plumbing pages (category/tag archives, author archive).
- Do not build 6 separate blog-post pages — consolidated into one `news.html`.

## Page inventory (14 new pages + existing gallery.html)

| Group | File | Nav label | Content source (scrape report section) |
|---|---|---|---|
| Training | `flight-instruction.html` | Flight Instruction | PAGE 2 — PPL-H/CPL-H/CFI-H + fixed-wing |
| Training | `intro-flight.html` | Intro Flight | PAGE 7 — R22 discovery flight |
| Training | `student-housing.html` | Student Housing | PAGE 8 — on-field housing |
| Training | `financial-options.html` | Financial Options | PAGE 9 — Stratus Financial |
| Training | `instructing.html` | Instructing / CFI Hiring | PAGE 12 — CFI hour-building pitch |
| Services | `commercial-services.html` | Commercial Services | PAGE 4 — services hub overview |
| Services | `helicopter-tours.html` | Helicopter Tours | PAGE 5 — tour types + pricing |
| Services | `christmas-lights-tours.html` | Christmas Lights Tours | PAGE 6 — seasonal Boise tours |
| Services | `agriculture-ranching.html` | Agriculture & Ranching | PAGE 10 — cherry drying, frost, cattle, survey |
| Services | `livestock-pest-control.html` | Livestock / Pest Control | PAGE 11 — pest control, coyote stat |
| Company | `about.html` | About | PAGE 3 — story, philosophy |
| Company | `testimonials.html` | Testimonials | PAGE 13 — 6 verbatim quotes + 100% claim |
| Company | `news.html` | News | Blog posts section — 6 entries, one page |
| Company | `liability-waiver.html` | Liability Waiver | PAGE 15 — waiver text |
| Contact | `contact.html` | Contact | PAGE 14 — contact info + form |

`gallery.html` is unchanged in content; only its nav/footer markup is updated to the sitewide pattern.

## Shared template (all new pages)

Based directly on `gallery.html`'s existing markup/CSS (`.nav`, `.head`, `.foot`, `tokens.css`
variables). Each page adds a two-column content region: main article (left, ~70%) + sidebar (right,
~30%), collapsing to a single column under 900px.

### Nav (floating pill chip, all pages)

Six top-level links, same six on every page:
`Home` (`index.html`) · `Training` (`flight-instruction.html`) · `Services` (`commercial-services.html`)
· `About` (`about.html`) · `Gallery` (`gallery.html`) · `Contact` (`contact.html`)

`aria-current="page"` applied to whichever top-level link's category the current page belongs to
(Home has no category — no link gets aria-current on category-less pages like Liability Waiver/News,
which fall under Company and highlight nothing extra).

### Sidebar (content pages only — not Home, Gallery, News, Liability Waiver, Contact)

A `<nav class="sidebar">` listing the other pages in the same group (Training/Services/Company),
labelled with the group name, so a visitor on any Training page can reach every other Training page
without going back through the top nav. Order matches the table above.

### Footer (all pages, replaces gallery.html's simpler footer)

Full sitemap in four columns: Training / Services / Company / Contact, listing all 15 pages
(14 new + Gallery). Keeps the existing footer statement + location list.

## Content approach

Content is adapted from the scrape report's summarized page descriptions — written in the site's
established voice (short, confident, terrain-forward — matching `index.html`/`gallery.html` copy),
not copied verbatim marketing filler. Testimonials are the one exception: reused verbatim per user
approval, since they're the business's own published customer quotes.

Pricing figures ($100 downtown tour, $400/$1,600 Treasure Valley, etc.) are carried over as-is —
flagged with the report's own "*" caveat where the report had one, since prices may be stale.

## Testing / verification

Static HTML site, no build step. Verification = load each new page plus `index.html` and
`gallery.html` in the browser preview, confirm:
- Scroll-film intro on `index.html` is pixel-identical to before (no regressions).
- Nav/sidebar/footer links resolve correctly across all 15 pages (no 404s, no dead anchors).
- Responsive collapse (sidebar → single column) works under 900px.
- No console errors.
