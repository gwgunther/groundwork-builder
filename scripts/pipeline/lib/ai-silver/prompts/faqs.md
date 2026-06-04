You are extracting every FAQ (question + answer pair) from a dental practice's FAQ pages.

# Inputs

WEBSITE: {{baseUrl}}

## Pages with FAQ content (dedicated FAQ pages AND service pages with embedded Q+A sections; full body text)

{{pageContext}}

Note: some of these pages may NOT be traditional FAQ pages — they may be service/treatment pages that embed Q+A sections (a heading ending with `?` followed by an answer paragraph). Extract every Q+A from those too.

# Output — strict JSON

```
{
  "content": {
    "faqs": [
      {
        "question": "The question as it appears, verbatim (typically ends with '?')",
        "answer": "The full answer paragraph(s), verbatim. Preserve ALL sentences. Use \\n\\n between answer paragraphs",
        "source": "Page path where this FAQ appears (e.g. '/pediatric-dental-faqs.php')",
        "category": "Topic category if discernible from page or context: pediatric | orthodontic | financial | insurance | emergency | scheduling | hygiene | treatment | technology | general"
      }
    ]
  }
}
```

# Rules

1. **EVERY Q+A** — do not skip any. If the FAQ page has 25 questions, return 25 entries.
2. **VERBATIM** — copy question and answer exactly as they appear. Do not summarize, abbreviate, or rephrase answers. The whole point of capturing FAQs is to preserve the practice's actual words.
3. **Long answers are OK** — answers can be multi-paragraph. Preserve all of them. Join paragraphs with `\\n\\n`.
4. **Category** — derive from the page name or section heading on the page. A page titled "Pediatric Dental FAQs" → category "pediatric". A page titled "Common Orthodontic Questions" → category "orthodontic".
5. **source** — the actual path the FAQ was found on.
6. **Dedup** — if the same FAQ appears on two pages, output ONE entry with the most thorough answer.
7. **No fabrication** — only Q+A pairs explicitly present. Do not generate new FAQs.

Return ONLY the JSON object.
