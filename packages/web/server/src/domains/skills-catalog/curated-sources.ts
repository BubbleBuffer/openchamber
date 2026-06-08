export interface CuratedSkillSource {
  id: string;
  label: string;
  description: string;
  source: string;
  defaultSubpath: string;
  sourceType: "github" | "clawdhub";
}

export const CURATED_SKILLS_SOURCES: CuratedSkillSource[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Anthropic's public skills repository",
    source: "anthropics/skills",
    defaultSubpath: "skills",
    sourceType: "github",
  },
  {
    id: "clawdhub",
    label: "ClawdHub",
    description: "Community skill registry with vector search",
    source: "clawdhub:registry",
    defaultSubpath: "",
    sourceType: "clawdhub",
  },
];

export function getCuratedSkillsSources(): CuratedSkillSource[] {
  return CURATED_SKILLS_SOURCES.slice();
}
