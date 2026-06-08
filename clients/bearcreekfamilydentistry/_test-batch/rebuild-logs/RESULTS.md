# Rebuild Eval Loop — Results

All 5 sites rebuilt sequentially (build-only, no audit). Success = `Build: PASSED` + `dist/` exists.

| # | Practice | Slug | Build | dist/ |
|---|---|---|---|---|
| 1 | Illinois Family Dentistry | `illinois-family-dentistry` | PASSED | yes |
| 2 | Bear Creek Family Dentistry | `bear-creek-family-dentistry` | PASSED | yes |
| 3 | Dentiq Dentistry Houston | `dentiq-dentistry` | PASSED | yes |
| 4 | Butterfly Orthodontics | `butterfly-orthodontics` | PASSED | yes |
| 5 | Arizona Biltmore Dentistry | `arizona-biltmore-dentistry` | PASSED | yes |

## Fixes applied during loop

- **`utils.js` `esc()`** — fixed escape order so apostrophes in doctor education (e.g. `Bachelor's`) don't break generated `site.ts`.

## Logs

`_test-batch/rebuild-logs/<slug>-attempt*.log`

## Preview locally

```bash
cd clients/<slug> && npm run preview
```
