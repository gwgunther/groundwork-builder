# Design System Generator — Agent Spec

Documents for building an agent that turns any source material (screenshots,
sites, codebases, Figma) into a complete, compilable design system — like the one
in this project.

| Doc | What it is |
|---|---|
| **[00-agent-prompt.md](00-agent-prompt.md)** | The agent's system prompt: role, inputs, non-negotiable principles, workflow summary. Start here; the other docs are its appendices. |
| **[01-process.md](01-process.md)** | The 10-step pipeline with gates: intake → source audit (pixel sampling, type/geometry measurement, motif inventory) → tokens → cards → components → UI kits → showcase → docs → strict audit → delivery. |
| **[02-schema.md](02-schema.md)** | The flexible output contract: project layout, three-layer token model (ramps → brand hooks → semantic aliases), per-component file contract, card/starting-point tags, UI-kit boot pattern, and an **adaptation matrix** mapping source types (e-commerce, SaaS, marketing, docs, mobile) to the modules to produce. |
| **[03-fidelity-rules.md](03-fidelity-rules.md)** | The grounding discipline: observed / implied / invented decision classes, **known drift failure modes** (imported conventions, radius drift, "close" colors, lost italics, layout drift, accent misassignment, partial propagation), placeholder policy, verification protocol, and the pre-delivery audit checklist. |
| **[04-templates.md](04-templates.md)** | Copy-paste skeletons: token files, component `.jsx`/`.d.ts`/`.prompt.md`, demo card, UI-kit loader & boot HTML, SKILL.md, README outline. |

## Design intent

Two ideas carry the whole spec:

1. **Fidelity through grounding** — every visual decision is sampled or measured
   from the source, or explicitly flagged as an extrapolation. The failure-mode
   list in 03 came from real drift caught during review of this very project.
2. **Flexibility through layering** — one fixed *contract* (token layers,
   component file trio, card tags, kit boot pattern) with *content* that adapts
   per brand and per site type via the adaptation matrix. The brand-hook layer
   means any generated system can be re-skinned by overriding a handful of
   variables.

## How to use

- **As an agent system prompt**: feed `00` as the prompt; attach `01–04` as
  reference docs (or inline them if the context budget allows).
- **As a Claude skill**: wrap `00` in SKILL.md front-matter and ship the folder.
- **As review criteria**: use 03's audit checklist to evaluate any generated
  system, whoever built it.
