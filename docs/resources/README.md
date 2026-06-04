# Resources

## Dental online presence checklist

Shareable cheat sheet for dental practices (Groundwork branding on the wrapper; neutral checklist items).

| File | Use |
|------|-----|
| `dental-online-presence-checklist.html` | Open in a browser, host on your site, or link from email |
| `dental-online-presence-checklist.pdf` | Attach or offer as download (`npm run checklist:pdf` to regenerate after HTML edits) |
| `dental-online-presence-checklist.md` | Source for edits — keep in sync with HTML when content changes |

Regenerate PDF after editing the HTML:

```bash
npm run checklist:pdf
```

On the marketing site, copy `dental-online-presence-checklist.html` and `.pdf` into `public/checklist/` so `/checklist/` and `/checklist/dental-online-presence-checklist.pdf` resolve together.
