You are extracting every patient testimonial / review from a dental practice website crawl.

# Inputs

WEBSITE: {{baseUrl}}

## Pages

{{pageContext}}

# Output — strict JSON

```
{
  "content": {
    "testimonials": [
      {
        "text": "The full verbatim quote, complete with punctuation and any inner quotes (escape inner \" as \\\")",
        "author": "Attribution name as it appears (e.g. 'Andrew K.', 'Isabella L.', 'Maria Gonzalez'); null if anonymous",
        "stars": 5,
        "source": "Page path where this testimonial appears, e.g. '/testimonials.php' or '/'",
        "verifiedBy": "If attribution mentions a platform (e.g. 'via Google', 'on Yelp'), copy here; else null",
        "context": "Optional 1-line note about who the patient is (e.g. 'parent of two patients'); null if not stated"
      }
    ]
  }
}
```

# Rules

1. **CAPTURE EVERY TESTIMONIAL** — including duplicates that appear on multiple pages (collapse to ONE entry with the most authoritative source page).
2. **VERBATIM TEXT** — copy the testimonial exactly as written, including ellipses, parenthetical asides, and any quotation marks (escape inner `"` as `\\"`).
3. **stars** — 5 by default unless the source explicitly shows fewer stars next to the quote (rare on practice marketing pages). If unsure, use 5.
4. **Dedup rule** — same author + same first 80 chars of text = duplicate. Keep the longer version if they differ.
5. **author** — capture EXACTLY as displayed. "Andrew K." stays "Andrew K." — do not expand to "Andrew Kowalski". If only a first name, that's fine. If anonymous, null.
6. **No paraphrasing, no fabrication** — only quotes that appear in the page text.
7. **Order** — return testimonials in source order across pages (first page in inputs → its testimonials first, in source order).

Return ONLY the JSON object.
