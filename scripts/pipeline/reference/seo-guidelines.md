# SEO & Discoverability Guidelines

Single source of truth for what good SEO looks like in a Groundwork-generated
site. This doc covers two lenses:

1. **Traditional SEO** — search engines (Google, Bing, etc.)
2. **AI / LLM discoverability** — being cited by ChatGPT, Claude, Perplexity, Gemini

Most fixes serve both lenses. Where they diverge, the divergence is called out.

This is a living document. As we learn new things from real builds, real
audits, and changes in how engines and LLMs work, update the relevant section.
Avoid example copy in here — describe principles only, never literal phrases
the AI might pattern-match into output.

---

## Universal page basics

Apply to every public page (homepage, services, blog, about, etc.).

- **One `<h1>` per page.** It states the page's primary subject in the
  practice's own terms — not a generic category label. Subsequent headings
  use `<h2>` then `<h3>`; never skip levels.
- **Title tag**: 40–60 characters, lead with the page's primary subject, end
  with the practice name. Different on every page.
- **Meta description**: 120–160 characters, written for a human (not a robot).
  Should accurately describe the page; should not duplicate the title verbatim.
  Different on every page.
- **Semantic HTML**: use `<section>`, `<article>`, `<nav>`, `<header>`,
  `<footer>` over generic `<div>`. Lists use `<ul>` / `<ol>`. Quotes use
  `<blockquote>` (only when the quote is real and attributed to a real
  source — see fabricated-quotes rule).
- **Image alt text**: every `<img>` has descriptive alt text. Decorative
  images have `alt=""` to signal "skip me". Never leave `alt` undefined.
- **Internal linking**: pages reference each other via descriptive anchor text
  ("dental implants" not "click here"). Avoid orphan pages (pages with no
  inbound links from elsewhere on the site).
- **No duplicate content across pages**: each page is the canonical home for
  its topic; don't repeat large blocks of copy.

## On-page content quality

- **Depth over keywords**: long-form, specific, useful content outranks
  keyword-stuffed thin content. A service page should be 400–800 words of
  actual, specific information.
- **Entity coverage**: a service page should mention the related entities
  (procedures, materials, conditions) by name in natural prose. Don't list
  them as keywords — write about them.
- **Local context throughout**: city, neighborhood, and practice name appear
  naturally in the content (not stuffed). One mention per major paragraph
  is plenty. Three mentions on a 500-word page is the upper bound.
- **Headings double as a content outline**: a reader skimming only the H2s
  should understand the page's structure.

## Local SEO specifics

- **NAP consistency** (Name, Address, Phone): the exact same NAP appears in
  the LocalBusiness schema, in the footer, and on the contact/schedule page.
  Mismatched NAP across these signals confuses search engines.
- **City and neighborhood specificity**: when the practice has a clear
  neighborhood, pages reference it specifically. "Long Beach" is good;
  "Long Beach's Belmont Heights" is better when accurate.
- **Service-area alignment**: if the practice draws from multiple
  neighborhoods or nearby cities, those are mentioned organically in
  appropriate pages (locations, services), not stuffed everywhere.
- **Hours, accepted insurance, parking, languages** are surfaced clearly —
  these are the questions a local searcher most often has.

## Schema markup

Emit JSON-LD `<script type="application/ld+json">` blocks. Choose the right
schema for each page type. (BaseLayout already emits LocalBusiness/Dentist
on every page; sections may emit additional page-specific schema.)

| Page / Section | Required schema | Notes |
|---|---|---|
| Homepage | LocalBusiness or Dentist (medical specialty) | Includes `name`, `address`, `telephone`, `openingHours`, `priceRange`, `geo` if known, `sameAs` for social profiles |
| Service detail page | MedicalProcedure or Service | Includes `name`, `description`, `provider` (LocalBusiness), `procedureType` if applicable |
| Blog post | BlogPosting | Includes `headline`, `datePublished`, `author`, `image` if present |
| About / doctor page | Person or Physician | Includes `name`, `jobTitle`, `worksFor` (the practice), `alumniOf` if education known |
| Reviews section | AggregateRating + Review | Only when reviews are real testimonials; never fabricate `reviewBody` or `author` |
| FAQ section | FAQPage | Each Q/A as a `Question` with `acceptedAnswer.Answer` |
| Breadcrumb trail | BreadcrumbList | One per non-homepage page |

When in doubt, emit a more specific schema rather than a generic one
(e.g., `Dentist` over `LocalBusiness`).

## AI / LLM discoverability

These are the moves that pay off specifically for LLM search & citation.

- **Direct factual statements**: somewhere on the page, state the answer to
  the question this page is about, in one or two sentences, in plain prose.
  LLMs need an extractable answer they can quote.
- **Comprehensive coverage of the topic**: a service page that explains *what
  it is*, *how it works*, *who it's for*, and *what to expect* gets cited far
  more than one with just marketing copy. If a search question would be "what
  is X" or "should I get X" or "how does X work", the page should answer it.
- **FAQ blocks are gold**: `<FAQPage>` schema + plain-prose Q/A blocks rank
  exceptionally well in LLM citations. Even one FAQ block per service page
  meaningfully improves discoverability.
- **Citation-friendly claims**: avoid vague marketing claims ("best in town",
  "always smiling", "second to none"). Use factual claims that a search
  engine or LLM can cite alongside their source ("Dr. X completed a
  residency at Y institution in 200X" — only when true and scraped).
- **Comparisons and lists**: when natural to the topic, structure parts of
  the content as comparisons (X vs. Y) or numbered lists. Both LLMs and
  Google snippets favor this structure.
- **Canonical URLs**: every page has a single canonical URL. Don't ship
  duplicate pages with the same content under different URLs.
- **No JS-only content**: anything that should be discoverable must be in
  the rendered HTML at build time, not loaded via JS after page load.
  Astro static rendering already gives us this for free; just don't break it.

## Section-specific notes

These apply to AI-generated section components.

### Hero
- The hero typically contains the page's only `<h1>`. Make sure the section
  uses `<h1>` (never `<h2>` for the page's primary headline).
- The headline should describe what the practice DOES, not what category
  of business it is. "Family dentist serving Long Beach" beats "Dental Office".

### Services (overview section + detail page)
- Each service item should link (`<a href="/services/<slug>">`) to its
  detail page using the service name as the anchor text. No "click here".
- The service detail page is where depth lives. The overview section can
  be brief — but every item must be a proper anchor.

### Reviews
- Use real testimonials only. Emit `Review` + `AggregateRating` schema with
  the real `reviewBody` and `author` from the scraped data. Never fabricate.
- Show the rating count and average prominently.

### FAQ
- `FAQPage` schema is mandatory if the FAQ section renders. The schema
  must mirror the visible Q/A content exactly.
- Questions are written as questions a real patient would ask, in plain
  language.

### Doctor intro / about
- Emit `Person` or `Physician` schema with credentials, education, and a
  link to the practice page.
- The full bio belongs on the about page, not just the homepage section.

### Footer
- Includes practice name, address, phone, hours, and social profile links
  (rendered + linked, not just icons). These reinforce the LocalBusiness
  schema's `sameAs` claims.
- A small site map (links to top-level pages) helps both crawlers and
  human visitors.
