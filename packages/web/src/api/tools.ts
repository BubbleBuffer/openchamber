import type { ToolsAPI } from '@/lib/api/types';

/** SDK pass-through endpoint: validate only the ID list this feature uses. */
export const parseToolIdList = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || !value.every((tool) => typeof tool === 'string')) return null;
  return value.filter((tool) => tool !== 'invalid');
};

export const createWebToolsAPI = (): ToolsAPI => ({
  async getAvailableTools(): Promise<string[]> {

    const response = await fetch('/api/experimental/tool/ids');

    if (!response.ok) {
      throw new Error(`Tools API returned ${response.status} ${response.statusText}`);
    }

    const data = parseToolIdList(await response.json());

    if (!data) {
      throw new Error('Tools API returned invalid data format');
    }

    return data.sort();
  },
});
