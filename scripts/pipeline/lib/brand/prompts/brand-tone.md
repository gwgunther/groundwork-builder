You are summarizing a dental practice's brand VOICE from its existing website copy, to create a small reference for writing any net-new copy in the same voice. Keep it tight — this is a summary, not an essay.

# The practice's actual copy

{{copy}}

# Output — strict JSON

```
{
  "brandTone": {
    "voice":    ["3-5 adjectives describing how they sound — e.g. 'warm', 'plain-spoken', 'reassuring', 'confident'"],
    "notes":    "1-2 sentences on how their copy reads (sentence length, formality, person, what they emphasize)",
    "examples": ["2-3 VERBATIM lines copied EXACTLY from the copy above that best exemplify the voice"]
  }
}
```

# Rules
1. **examples must be VERBATIM** — copy real sentences/phrases exactly as they appear in the copy above. Do NOT paraphrase or invent. These anchor the voice.
2. **voice adjectives** describe the actual tone, grounded in the copy — not aspirational.
3. Keep it short. This is a reference doc, not analysis.

Return ONLY the JSON object.
