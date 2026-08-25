---
name: brainstorming
description: Use before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by classifying how much process the request needs, then work through your path: understand the context, refine the idea, present a design, and get your human partner's approval.

## Hard gate

Do NOT write any code, scaffold any project, or take any implementation action until you have told your human partner what you intend and they have approved it. The ceremony scales with the task; the approval gate never does.

## Three paths

Classify the request and say the classification out loud so your human partner can override it:

- **Spike** — a feasibility question whose output is an answer, not code you keep. Present the question and what you'll try in 2-3 sentences, get a nod, then find out as cheaply as correctness allows. Report findings as a recommendation; anything built stays labeled throwaway.
- **Bounded** — a well-scoped change to code that already exists: a new flag, a small endpoint, a one-file fix. Ask the clarifying questions that matter, present a short design in chat (a few sentences to a few short paragraphs), and STOP. Implementation starts only after your human partner says yes.
- **Architectural** — new projects, new subsystems, changes that restructure how components fit together. Questions, approaches, sectioned design, written spec, then a written implementation plan.

When in doubt between two paths, take the heavier one. Hidden complexity discovered mid-task upgrades the path — stop, say so, and step up.

## Anti-pattern: "too simple to need approval"

Every path ends with your human partner approving your intent before implementation. What scales with simplicity is the artifact, never the approval.

## Process

- Check current project state first (files, docs, recent commits).
- If the request spans multiple independent subsystems, flag it and help decompose before refining details.
- Ask questions one at a time: purpose, constraints, success criteria. Prefer multiple choice when possible.
- Propose 2-3 approaches with trade-offs; lead with your recommendation and reasoning. YAGNI ruthlessly.
- Present the design in sections scaled to complexity, checking after each section whether it looks right. Cover: architecture, components, data flow, error handling, testing.
- Design for isolation and clarity: small units, one clear purpose each, well-defined interfaces.

## Working in existing codebases

Explore the current structure before proposing changes and follow existing patterns. Include targeted improvements to code you're touching where they serve the current goal; don't propose unrelated refactoring.
