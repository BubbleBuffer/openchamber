import { describe, expect, it } from 'vitest';

import {
    getStaticGroupToolName,
    isExpandableTool,
    isStandaloneTool,
    isStaticTool,
} from './toolRenderUtils';

describe('toolRenderUtils', () => {
    it('keeps known compact tools static', () => {
        expect(isStaticTool('read')).toBe(true);
        expect(isStaticTool('mcp.search')).toBe(true);
        expect(isStaticTool('webfetch:2')).toBe(true);
    });

    it('leaves custom tools available to the expandable fallback renderer', () => {
        expect(isStaticTool('browser_test_tool')).toBe(false);
        expect(isExpandableTool('browser_test_tool')).toBe(false);
        expect(isStandaloneTool('browser_test_tool')).toBe(false);
    });

    it('normalizes search aliases for grouping', () => {
        expect(getStaticGroupToolName('mcp.ripgrep:3')).toBe('grep');
    });
});
