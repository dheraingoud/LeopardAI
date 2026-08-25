---
name: skill-creator
description: Create new skills and modify or improve existing ones. Use when the user wants to create a skill from scratch, edit a skill, or improve a skill's description for better triggering accuracy.
---

# Skill Creator

Create and iteratively improve skills. High level: understand intent → draft the skill → test with realistic prompts → evaluate with the user → rewrite → repeat until satisfied.

## Capture intent

1. What should this skill enable the model to do?
2. When should it trigger (phrases/contexts)?
3. Expected output format?
4. Do we need test cases? Skills with objectively verifiable outputs benefit; subjective ones (writing style, art) often don't.

If the current conversation already contains the workflow to capture, extract it from history first and confirm with the user.

## Writing the SKILL.md

Anatomy:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled resources (optional): scripts/ references/ assets/
```

- **name**: identifier (kebab-case).
- **description**: the primary triggering mechanism — both what it does AND when to use it. Models under-trigger, so make it slightly pushy: name concrete contexts, not just the category.
- **body**: under ~500 lines; push detail into reference files with clear pointers. Prefer imperative form. Explain WHY instructions matter — smart models follow reasoning better than rigid MUSTs. Include input/output examples and exact output templates when format matters.

Progressive disclosure: metadata always in context (~100 words), body on trigger, bundled resources as needed.

## Evaluate and improve

1. Draft 2-3 realistic test prompts — what a real user would actually say. Share them before running.
2. Run the skill against them; capture outputs.
3. Have the user review qualitatively. For objective outputs, write programmatic checks.
4. Improve by generalizing from feedback — avoid overfit fiddly changes; if a stubborn issue persists, change the metaphor or working pattern rather than adding constraints.
5. Keep the prompt lean — remove anything not pulling its weight.
6. Repeat until the user is happy.

## Description optimization

When a skill under- or over-triggers, tune the description:
- Generate ~20 trigger eval queries (mix of should-trigger and near-miss should-not-trigger — realistic, concrete, with backstory, casual phrasing, typos).
- The best negative cases share keywords but need a different tool — not obviously irrelevant prompts.
- Iterate the description against this set; pick by held-out performance, not train.

## Rules

- Skills must not contain malware, exfiltration, or surprise behavior.
- When updating an existing skill, preserve its original name.
