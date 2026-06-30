import { describe, it, expect, beforeEach } from "bun:test";
import { useModelPreferencesStore } from "./useModelPreferencesStore";

// ---------------------------------------------------------------------------
// Defaults — mirror the shape declared in useModelPreferencesStore
// ---------------------------------------------------------------------------
const DEFAULTS = {
  favoriteModels: [] as Array<{ providerID: string; modelID: string }>,
  hiddenModels: [] as Array<{ providerID: string; modelID: string }>,
  collapsedModelProviders: [] as string[],
  recentModels: [] as Array<{ providerID: string; modelID: string }>,
  recentEfforts: {} as Record<string, string[]>,
};

// ---------------------------------------------------------------------------
// Reset helper — replaces setState without notifying subscribers
// ---------------------------------------------------------------------------
function resetStore(): void {
  useModelPreferencesStore.setState({ ...DEFAULTS }, false);
}

describe("useModelPreferencesStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // 1. toggleFavoriteModel — adds newest first; removes if already present
  // -------------------------------------------------------------------------
  describe("toggleFavoriteModel", () => {
    it("adds entry at index 0 when not present", () => {
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-a", "model-x");
      const favorites = useModelPreferencesStore.getState().favoriteModels;
      expect(favorites).toHaveLength(1);
      expect(favorites[0]).toEqual({ providerID: "provider-a", modelID: "model-x" });
    });

    it("removes existing entry when toggled again", () => {
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-a", "model-x");
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-a", "model-x");
      expect(useModelPreferencesStore.getState().favoriteModels).toHaveLength(0);
    });

    it("adding a second entry places it at index 0 (newest first)", () => {
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-a", "model-x");
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-b", "model-y");
      const favorites = useModelPreferencesStore.getState().favoriteModels;
      expect(favorites).toHaveLength(2);
      expect(favorites[0]).toEqual({ providerID: "provider-b", modelID: "model-y" });
      expect(favorites[1]).toEqual({ providerID: "provider-a", modelID: "model-x" });
    });
  });

  // -------------------------------------------------------------------------
  // 2. isFavoriteModel — reads current favorites
  // -------------------------------------------------------------------------
  describe("isFavoriteModel", () => {
    it("returns true for a favorited model", () => {
      useModelPreferencesStore.getState().toggleFavoriteModel("provider-a", "model-x");
      expect(useModelPreferencesStore.getState().isFavoriteModel("provider-a", "model-x")).toBe(true);
    });

    it("returns false for a non-favorited model", () => {
      expect(useModelPreferencesStore.getState().isFavoriteModel("provider-a", "model-x")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. toggleHiddenModel — adds newest first; removes if already present
  // -------------------------------------------------------------------------
  describe("toggleHiddenModel", () => {
    it("adds entry at index 0 when not present", () => {
      useModelPreferencesStore.getState().toggleHiddenModel("provider-a", "model-x");
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      expect(hidden).toHaveLength(1);
      expect(hidden[0]).toEqual({ providerID: "provider-a", modelID: "model-x" });
    });

    it("removes existing entry when toggled again", () => {
      useModelPreferencesStore.getState().toggleHiddenModel("provider-a", "model-x");
      useModelPreferencesStore.getState().toggleHiddenModel("provider-a", "model-x");
      expect(useModelPreferencesStore.getState().hiddenModels).toHaveLength(0);
    });

    it("adding a second entry places it at index 0 (newest first)", () => {
      useModelPreferencesStore.getState().toggleHiddenModel("provider-a", "model-x");
      useModelPreferencesStore.getState().toggleHiddenModel("provider-b", "model-y");
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      expect(hidden).toHaveLength(2);
      expect(hidden[0]).toEqual({ providerID: "provider-b", modelID: "model-y" });
      expect(hidden[1]).toEqual({ providerID: "provider-a", modelID: "model-x" });
    });
  });

  // -------------------------------------------------------------------------
  // 4. hideAllModels — replaces hidden entries for a provider
  // -------------------------------------------------------------------------
  describe("hideAllModels", () => {
    it("replaces all hidden entries for the given provider", () => {
      // Start with one hidden entry for the target provider
      useModelPreferencesStore.setState(
        { hiddenModels: [{ providerID: "provider-a", modelID: "old-model" }] },
        false,
      );
      useModelPreferencesStore.getState().hideAllModels("provider-a", ["model-x", "model-y"]);
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      // Old entry removed; new ones prepended in modelIDs order
      expect(hidden).toHaveLength(2);
      expect(hidden[0]).toEqual({ providerID: "provider-a", modelID: "model-x" });
      expect(hidden[1]).toEqual({ providerID: "provider-a", modelID: "model-y" });
    });

    it("preserves hidden entries for other providers", () => {
      useModelPreferencesStore.setState(
        {
          hiddenModels: [
            { providerID: "provider-b", modelID: "model-z" },
            { providerID: "provider-a", modelID: "model-x" },
          ],
        },
        false,
      );
      useModelPreferencesStore.getState().hideAllModels("provider-a", ["model-new"]);
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      // provider-b entry kept, provider-a entry replaced
      expect(hidden).toHaveLength(2);
      expect(hidden[0]).toEqual({ providerID: "provider-a", modelID: "model-new" });
      expect(hidden[1]).toEqual({ providerID: "provider-b", modelID: "model-z" });
    });

    it("filters out empty and non-string model IDs", () => {
      useModelPreferencesStore.getState().hideAllModels("provider-a", [
        "model-x",
        "",
        "model-y",
        null as unknown as string,
        "model-z",
      ]);
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      expect(hidden).toHaveLength(3);
      expect(hidden[0]).toEqual({ providerID: "provider-a", modelID: "model-x" });
      expect(hidden[1]).toEqual({ providerID: "provider-a", modelID: "model-y" });
      expect(hidden[2]).toEqual({ providerID: "provider-a", modelID: "model-z" });
    });

    it("handles an empty array of modelIDs (clears the provider)", () => {
      useModelPreferencesStore.setState(
        { hiddenModels: [{ providerID: "provider-a", modelID: "model-x" }] },
        false,
      );
      useModelPreferencesStore.getState().hideAllModels("provider-a", []);
      expect(useModelPreferencesStore.getState().hiddenModels).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. showAllModels — removes only hidden entries for the given provider
  // -------------------------------------------------------------------------
  describe("showAllModels", () => {
    it("removes only entries matching the provider", () => {
      useModelPreferencesStore.setState(
        {
          hiddenModels: [
            { providerID: "provider-a", modelID: "model-x" },
            { providerID: "provider-b", modelID: "model-y" },
            { providerID: "provider-a", modelID: "model-z" },
          ],
        },
        false,
      );
      useModelPreferencesStore.getState().showAllModels("provider-a");
      const hidden = useModelPreferencesStore.getState().hiddenModels;
      expect(hidden).toHaveLength(1);
      expect(hidden[0]).toEqual({ providerID: "provider-b", modelID: "model-y" });
    });

    it("does nothing when no entries match the provider", () => {
      useModelPreferencesStore.setState(
        { hiddenModels: [{ providerID: "provider-b", modelID: "model-y" }] },
        false,
      );
      useModelPreferencesStore.getState().showAllModels("provider-a");
      expect(useModelPreferencesStore.getState().hiddenModels).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. isHiddenModel — reads current hidden models
  // -------------------------------------------------------------------------
  describe("isHiddenModel", () => {
    it("returns true for a hidden model", () => {
      useModelPreferencesStore.getState().toggleHiddenModel("provider-a", "model-x");
      expect(useModelPreferencesStore.getState().isHiddenModel("provider-a", "model-x")).toBe(true);
    });

    it("returns false for a non-hidden model", () => {
      expect(useModelPreferencesStore.getState().isHiddenModel("provider-a", "model-x")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. toggleModelProviderCollapsed — trims, ignores empty, adds/removes
  // -------------------------------------------------------------------------
  describe("toggleModelProviderCollapsed", () => {
    it("adds provider ID when not collapsed", () => {
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("provider-a");
      expect(useModelPreferencesStore.getState().collapsedModelProviders).toContain("provider-a");
    });

    it("removes provider ID when already collapsed", () => {
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("provider-a");
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("provider-a");
      expect(useModelPreferencesStore.getState().collapsedModelProviders).not.toContain("provider-a");
    });

    it("trims whitespace from provider ID", () => {
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("  provider-a  ");
      expect(useModelPreferencesStore.getState().collapsedModelProviders).toContain("provider-a");
    });

    it("ignores empty strings (no-op)", () => {
      const before = useModelPreferencesStore.getState().collapsedModelProviders.slice();
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("");
      useModelPreferencesStore.getState().toggleModelProviderCollapsed("   ");
      expect(useModelPreferencesStore.getState().collapsedModelProviders).toEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // 8. addRecentModel — dedupes by provider/model, moves to front, limits 5
  // -------------------------------------------------------------------------
  describe("addRecentModel", () => {
    it("adds model at the front of the list", () => {
      useModelPreferencesStore.getState().addRecentModel("provider-a", "model-x");
      expect(useModelPreferencesStore.getState().recentModels[0]).toEqual({
        providerID: "provider-a",
        modelID: "model-x",
      });
    });

    it("dedupes by provider+model and moves to front on re-add", () => {
      useModelPreferencesStore.getState().addRecentModel("provider-a", "model-x");
      useModelPreferencesStore.getState().addRecentModel("provider-b", "model-y");
      useModelPreferencesStore.getState().addRecentModel("provider-a", "model-x");
      const recent = useModelPreferencesStore.getState().recentModels;
      expect(recent).toHaveLength(2);
      expect(recent[0]).toEqual({ providerID: "provider-a", modelID: "model-x" });
      expect(recent[1]).toEqual({ providerID: "provider-b", modelID: "model-y" });
    });

    it("limits recent models to 5 entries", () => {
      for (let i = 0; i < 7; i++) {
        useModelPreferencesStore.getState().addRecentModel("provider", `model-${i}`);
      }
      const recent = useModelPreferencesStore.getState().recentModels;
      expect(recent).toHaveLength(5);
      expect(recent[0].modelID).toBe("model-6");
    });
  });

  // -------------------------------------------------------------------------
  // 9 & 10. addRecentEffort — trim, default variant, dedupe, limit 5, no-op
  // -------------------------------------------------------------------------
  describe("addRecentEffort", () => {
    it("trims provider, model, and variant", () => {
      useModelPreferencesStore.getState().addRecentEffort("  provider-a  ", "  model-x  ", "  variant-1  ");
      const key = "provider-a/model-x";
      expect(useModelPreferencesStore.getState().recentEfforts[key]).toEqual(["variant-1"]);
    });

    it("defaults blank or missing variant to 'default'", () => {
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", undefined);
      useModelPreferencesStore.getState().addRecentEffort("provider-b", "model-y", "");
      const efforts = useModelPreferencesStore.getState().recentEfforts;
      expect(efforts["provider-a/model-x"]).toEqual(["default"]);
      expect(efforts["provider-b/model-y"]).toEqual(["default"]);
    });

    it("dedupes by variant and prepends new variants", () => {
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", "variant-a");
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", "variant-b");
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", "variant-c");
      const key = "provider-a/model-x";
      expect(useModelPreferencesStore.getState().recentEfforts[key]).toEqual([
        "variant-c",
        "variant-b",
        "variant-a",
      ]);
    });

    it("does not add duplicate variant if already present (no-op)", () => {
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", "variant-a");
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", "variant-a");
      expect(useModelPreferencesStore.getState().recentEfforts["provider-a/model-x"]).toEqual([
        "variant-a",
      ]);
    });

    it("limits each provider/model key to 5 variants", () => {
      for (let i = 0; i < 7; i++) {
        useModelPreferencesStore.getState().addRecentEffort("provider-a", "model-x", `variant-${i}`);
      }
      const key = "provider-a/model-x";
      expect(useModelPreferencesStore.getState().recentEfforts[key]).toHaveLength(5);
      expect(useModelPreferencesStore.getState().recentEfforts[key][0]).toBe("variant-6");
    });

    it("no-ops when provider is missing or blank", () => {
      const stateBefore = { ...useModelPreferencesStore.getState() };
      useModelPreferencesStore.getState().addRecentEffort("", "model-x", "variant-a");
      useModelPreferencesStore.getState().addRecentEffort("   ", "model-x", "variant-a");
      expect(useModelPreferencesStore.getState().recentEfforts).toEqual(stateBefore.recentEfforts);
    });

    it("no-ops when model is missing or blank", () => {
      const stateBefore = { ...useModelPreferencesStore.getState() };
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "", "variant-a");
      useModelPreferencesStore.getState().addRecentEffort("provider-a", "   ", "variant-a");
      expect(useModelPreferencesStore.getState().recentEfforts).toEqual(stateBefore.recentEfforts);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Legacy migration helper
  // -------------------------------------------------------------------------
  describe("migrateModelPreferencesFromLegacyUIStore", () => {
    // In-memory storage stub used to isolate migration tests.
    const createInMemoryStorage = () => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      } as Storage;
    };

    it("returns false and does not write when model-preferences-store already exists", () => {
      const storage = createInMemoryStorage();
      // Pre-populate the new store key.
      storage.setItem(
        'model-preferences-store',
        JSON.stringify({ state: { favoriteModels: [{ providerID: 'x', modelID: 'y' }], hiddenModels: [], collapsedModelProviders: [], recentModels: [], recentEfforts: {} }, version: 1 }),
      );
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      // Patch getSafeStorage temporarily — but we pass storage directly so it uses our stub.
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(false);
      // The pre-existing entry must not be overwritten.
      const saved = JSON.parse(storage.getItem('model-preferences-store')!);
      expect(saved.state.favoriteModels).toEqual([{ providerID: 'x', modelID: 'y' }]);
    });

    it("returns false when ui-store does not exist", () => {
      const storage = createInMemoryStorage();
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(false);
      expect(storage.getItem('model-preferences-store')).toBeNull();
    });

    it("migrates all five model preference fields from a valid ui-store envelope", () => {
      const storage = createInMemoryStorage();
      storage.setItem(
        'ui-store',
        JSON.stringify({
          state: {
            favoriteModels: [
              { providerID: 'anthropic', modelID: 'claude-3-5' },
              { providerID: 'openai', modelID: 'gpt-4o' },
            ],
            hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-instant' }],
            collapsedModelProviders: ['anthropic', 'openai'],
            recentModels: [{ providerID: 'anthropic', modelID: 'claude-3-5' }],
            recentEfforts: { 'anthropic/claude-3-5': ['default', 'high-effort'] },
            // Irrelevant fields must be ignored.
            isMobile: true,
            theme: 'dark',
          },
          version: 9,
        }),
      );
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(true);

      const saved = JSON.parse(storage.getItem('model-preferences-store')!);
      expect(saved.state.favoriteModels).toEqual([
        { providerID: 'anthropic', modelID: 'claude-3-5' },
        { providerID: 'openai', modelID: 'gpt-4o' },
      ]);
      expect(saved.state.hiddenModels).toEqual([{ providerID: 'anthropic', modelID: 'claude-instant' }]);
      expect(saved.state.collapsedModelProviders).toEqual(['anthropic', 'openai']);
      expect(saved.state.recentModels).toEqual([{ providerID: 'anthropic', modelID: 'claude-3-5' }]);
      expect(saved.state.recentEfforts).toEqual({ 'anthropic/claude-3-5': ['default', 'high-effort'] });
      expect(saved.version).toBe(1);
    });

    it("drops invalid model-ref entries from favoriteModels and hiddenModels", () => {
      const storage = createInMemoryStorage();
      storage.setItem(
        'ui-store',
        JSON.stringify({
          state: {
            favoriteModels: [
              { providerID: 'anthropic', modelID: 'claude-3-5' },
              { providerID: '', modelID: 'bad' },          // invalid: empty providerID
              { modelID: 'bad' },                           // missing providerID
              { providerID: 'openai' },                     // missing modelID
              { providerID: 'openai', modelID: 'gpt-4o' },
              null,                                         // null entry
              'not-an-object',                              // string entry
            ],
            hiddenModels: [
              { providerID: 'anthropic', modelID: 'claude-instant' },
              null,
              { providerID: '', modelID: '' },
            ],
            collapsedModelProviders: ['anthropic', ''],
            recentModels: [
              { providerID: 'anthropic', modelID: 'claude-3-5' },
              null,
            ],
            recentEfforts: {
              'anthropic/claude-3-5': ['default', null, 'high-effort'],
              'bad/key': 'not-an-array',
            },
          },
          version: 9,
        }),
      );
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(true);

      const saved = JSON.parse(storage.getItem('model-preferences-store')!);
      // Only valid entries survive.
      expect(saved.state.favoriteModels).toEqual([
        { providerID: 'anthropic', modelID: 'claude-3-5' },
        { providerID: 'openai', modelID: 'gpt-4o' },
      ]);
      expect(saved.state.hiddenModels).toEqual([{ providerID: 'anthropic', modelID: 'claude-instant' }]);
      // Empty strings filtered from collapsedModelProviders.
      expect(saved.state.collapsedModelProviders).toEqual(['anthropic']);
      expect(saved.state.recentModels).toEqual([{ providerID: 'anthropic', modelID: 'claude-3-5' }]);
      // Invalid array value for 'bad/key' becomes []; null in variants array is dropped.
      expect(saved.state.recentEfforts).toEqual({
        'anthropic/claude-3-5': ['default', 'high-effort'],
        'bad/key': [],
      });
    });

    it("returns false when ui-store JSON is malformed", () => {
      const storage = createInMemoryStorage();
      storage.setItem('ui-store', 'not-valid-json{');
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(false);
      expect(storage.getItem('model-preferences-store')).toBeNull();
    });

    it("returns false when ui-store envelope is missing state", () => {
      const storage = createInMemoryStorage();
      storage.setItem('ui-store', JSON.stringify({ version: 9 }));
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      const result = migrateModelPreferencesFromLegacyUIStore(storage);
      expect(result).toBe(false);
    });

    it("never deletes ui-store keys", () => {
      const storage = createInMemoryStorage();
      storage.setItem(
        'ui-store',
        JSON.stringify({
          state: {
            favoriteModels: [{ providerID: 'a', modelID: 'b' }],
            hiddenModels: [],
            collapsedModelProviders: [],
            recentModels: [],
            recentEfforts: {},
          },
          version: 9,
        }),
      );
      const { migrateModelPreferencesFromLegacyUIStore } = require('./useModelPreferencesStore');
      migrateModelPreferencesFromLegacyUIStore(storage);
      // ui-store must still be readable.
      expect(storage.getItem('ui-store')).not.toBeNull();
    });
  });
});
