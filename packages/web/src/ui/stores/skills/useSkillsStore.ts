import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import {
  parseSkillDetailResponse,
  parseSkillsListResponse,
  type InstalledSkill,
  type SkillDetailResponse,
  type SkillScope,
  type SkillSource,
} from "@contracts/skills";

export type { SkillScope, SkillSource };

export type DiscoveredSkill = InstalledSkill & {
  /** Optional grouping directory from a nested `<group>/<skill>/SKILL.md` layout. */
  group?: string;
};

export type SkillDetail = SkillDetailResponse;

interface SkillsStore {
  selectedSkillName: string | null;
  skills: DiscoveredSkill[];
  isLoading: boolean;
  setSelectedSkill: (name: string | null) => void;
  loadSkills: (options?: { force?: boolean }) => Promise<boolean>;
  getSkillDetail: (name: string) => Promise<SkillDetail | null>;
  getSkillByName: (name: string) => DiscoveredSkill | undefined;
}

declare global {
  interface Window {
    __zustand_skills_store__?: UseBoundStore<StoreApi<SkillsStore>>;
  }
}

const SKILLS_LOAD_CACHE_TTL_MS = 5000;
const DEFAULT_SKILLS_CACHE_KEY = "__default__";
const skillsLastLoadedAt = new Map<string, number>();
const skillsLoadInFlight = new Map<string, Promise<boolean>>();
let loadedDirectoryKey: string | null = null;

const getCurrentDirectory = (): string | null => {
  const directory = opencodeClient.getDirectory();
  return typeof directory === "string" && directory.trim()
    ? directory.trim()
    : null;
};

const cacheKeyFor = (directory: string | null): string =>
  directory ?? DEFAULT_SKILLS_CACHE_KEY;

const queryFor = (directory: string | null): string =>
  directory ? `?directory=${encodeURIComponent(directory)}` : "";

function parseSkillGroup(skillPath: string): string | undefined {
  const normalizedPath = skillPath.replace(/\\/g, "/");
  const markerIndex = normalizedPath.lastIndexOf("/skills/");
  if (markerIndex < 0) return undefined;
  const segments = normalizedPath
    .slice(markerIndex + "/skills/".length)
    .split("/");
  return segments.length >= 3 ? segments[0] : undefined;
}

function presentSkill(skill: InstalledSkill): DiscoveredSkill {
  const group = parseSkillGroup(skill.path);
  return group ? { ...skill, group } : skill;
}

export const useSkillsStore = create<SkillsStore>()(
  devtools(
    (set, get) => ({
      selectedSkillName: null,
      skills: [],
      isLoading: false,

      setSelectedSkill: (name) => {
        set({ selectedSkillName: name }, false, "skills/select");
      },

      loadSkills: async (options = {}) => {
        const directory = getCurrentDirectory();
        const cacheKey = cacheKeyFor(directory);
        const loadedAt = skillsLastLoadedAt.get(cacheKey) ?? 0;
        if (
          !options.force &&
          loadedDirectoryKey === cacheKey &&
          Date.now() - loadedAt < SKILLS_LOAD_CACHE_TTL_MS
        ) {
          return true;
        }

        const existing = skillsLoadInFlight.get(cacheKey);
        if (existing) return existing;

        const request = (async () => {
          set({ isLoading: true }, false, "skills/load-start");
          try {
            const response = await fetch(`/api/config/skills${queryFor(directory)}`);
            if (!response.ok) return false;

            const decoded = parseSkillsListResponse(await response.json());
            if (!decoded.ok) return false;

            const skills = decoded.value.skills
              .map(presentSkill)
              .sort((left, right) => left.name.localeCompare(right.name));

            // A request for an old project must not replace the active project's list.
            if (cacheKeyFor(getCurrentDirectory()) !== cacheKey) return false;

            const selected = get().selectedSkillName;
            set(
              {
                skills,
                selectedSkillName:
                  selected && skills.some((skill) => skill.name === selected)
                    ? selected
                    : (skills[0]?.name ?? null),
              },
              false,
              "skills/load-success",
            );
            loadedDirectoryKey = cacheKey;
            skillsLastLoadedAt.set(cacheKey, Date.now());
            return true;
          } catch {
            return false;
          } finally {
            skillsLoadInFlight.delete(cacheKey);
            if (cacheKeyFor(getCurrentDirectory()) === cacheKey) {
              set({ isLoading: false }, false, "skills/load-finish");
            }
          }
        })();

        skillsLoadInFlight.set(cacheKey, request);
        return request;
      },

      getSkillDetail: async (name) => {
        const directory = getCurrentDirectory();
        try {
          const response = await fetch(
            `/api/config/skills/${encodeURIComponent(name)}${queryFor(directory)}`,
          );
          if (!response.ok) return null;
          const decoded = parseSkillDetailResponse(await response.json());
          return decoded.ok && decoded.value.name === name ? decoded.value : null;
        } catch {
          return null;
        }
      },

      getSkillByName: (name) => get().skills.find((skill) => skill.name === name),
    }),
    { name: "skills-store" },
  ),
);

if (typeof window !== "undefined") {
  window.__zustand_skills_store__ = useSkillsStore;
}
