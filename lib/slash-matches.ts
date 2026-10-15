// Slash-command matching, extracted from components/chat/slash-menu.tsx.
// Explicit .ts extension (allowImportingTsExtensions) so tests can import it.

import { skillSlug, type SkillConfig } from "./skill-config.ts";

export type SlashMatch = {
  skill: SkillConfig;
  slug: string;
};

export function getSlashMatches(
  value: string,
  skills: readonly SkillConfig[] | undefined,
): SlashMatch[] {
  if (!skills || !value.startsWith("/")) return [];
  const query = value.slice(1).toLowerCase();
  return skills
    .filter((s) => s.enabled)
    .map((s) => ({ skill: s, slug: skillSlug(s) }))
    .filter(({ skill, slug }) => {
      if (!query) return true;
      return (
        skill.name.toLowerCase().startsWith(query) || slug.startsWith(query)
      );
    });
}
