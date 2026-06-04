import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GitProfile, GitProfilesData } from "./types.js";

const STORAGE_DIR = path.join(os.homedir(), ".config", "openchamber");
const STORAGE_FILE = path.join(STORAGE_DIR, "git-identities.json");

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function loadProfiles(): GitProfilesData {
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    return { profiles: [] };
  }
  try {
    const content = fs.readFileSync(STORAGE_FILE, "utf8");
    const data = JSON.parse(content) as GitProfilesData;
    return data;
  } catch (error) {
    console.error("Failed to load git identity profiles:", error);
    return { profiles: [] };
  }
}

export function saveProfiles(data: GitProfilesData): boolean {
  ensureStorageDir();
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Failed to save git identity profiles:", error);
    throw error;
  }
}

export function getProfiles(): GitProfile[] {
  const data = loadProfiles();
  return data.profiles || [];
}

export function getProfile(id: string): GitProfile | null {
  const profiles = getProfiles();
  return profiles.find((p: GitProfile) => p.id === id) || null;
}

interface CreateProfileInput {
  id: string;
  userName: string;
  userEmail: string;
  name?: string;
  authType?: string;
  sshKey?: string | null;
  host?: string | null;
  color?: string;
  icon?: string;
}

export function createProfile(profileData: CreateProfileInput): GitProfile {
  const profiles = getProfiles();
  if (profiles.some((p: GitProfile) => p.id === profileData.id)) {
    throw new Error(`Profile with ID "${profileData.id}" already exists`);
  }
  if (!profileData.id || !profileData.userName || !profileData.userEmail) {
    throw new Error("Profile must have id, userName, and userEmail");
  }
  const newProfile: GitProfile = {
    id: profileData.id,
    name: profileData.name || profileData.userName,
    userName: profileData.userName,
    userEmail: profileData.userEmail,
    authType: profileData.authType || "ssh",
    sshKey: profileData.sshKey || null,
    host: profileData.host || null,
    color: profileData.color || "keyword",
    icon: profileData.icon || "branch",
  };
  profiles.push(newProfile);
  saveProfiles({ profiles });
  return newProfile;
}

interface UpdateProfileInput {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function updateProfile(id: string, updates: UpdateProfileInput): GitProfile {
  const profiles = getProfiles();
  const index = profiles.findIndex((p: GitProfile) => p.id === id);
  if (index === -1) {
    throw new Error(`Profile with ID "${id}" not found`);
  }
  profiles[index] = {
    ...profiles[index],
    ...updates,
    id: profiles[index].id,
  };
  saveProfiles({ profiles });
  return profiles[index];
}

export function deleteProfile(id: string): boolean {
  const profiles = getProfiles();
  const filteredProfiles = profiles.filter((p: GitProfile) => p.id !== id);
  if (filteredProfiles.length === profiles.length) {
    throw new Error(`Profile with ID "${id}" not found`);
  }
  saveProfiles({ profiles: filteredProfiles });
  return true;
}