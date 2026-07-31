import { describe, expect, it } from "vitest"
import { packageNameFromModuleId, vendorChunkName } from "./vite.chunking"

describe("vendor chunk naming", () => {
  it("uses the package after the final node_modules segment in Bun installs", () => {
    const id = "/repo/node_modules/.bun/react@19.1.0/node_modules/react/jsx-runtime.js"

    expect(packageNameFromModuleId(id)).toBe("react")
    expect(vendorChunkName(id)).toBe("vendor-react")
  })

  it("preserves scoped package names", () => {
    const id = "/repo/node_modules/.bun/@opencode-ai+sdk@1.0.0/node_modules/@opencode-ai/sdk/dist/client.js"

    expect(packageNameFromModuleId(id)).toBe("@opencode-ai/sdk")
    expect(vendorChunkName(id)).toBe("vendor-opencode-sdk")
  })

  it("supports Windows-style module identifiers", () => {
    const id = String.raw`C:\repo\node_modules\.bun\zustand@5.0.0\node_modules\zustand\index.js`

    expect(packageNameFromModuleId(id)).toBe("zustand")
    expect(vendorChunkName(id)).toBe("vendor-zustand")
  })

  it("does not assign application modules to vendor chunks", () => {
    expect(packageNameFromModuleId("/repo/packages/web/src/main.tsx")).toBeUndefined()
    expect(vendorChunkName("/repo/packages/web/src/main.tsx")).toBeUndefined()
  })

  it("leaves the dependency long tail to Rollup", () => {
    const id = "/repo/node_modules/.bun/tiny-package@1.0.0/node_modules/tiny-package/index.js"

    expect(packageNameFromModuleId(id)).toBe("tiny-package")
    expect(vendorChunkName(id)).toBeUndefined()
  })

  it("uses a small number of intentional heavy feature buckets", () => {
    expect(vendorChunkName("/repo/node_modules/@codemirror/view/dist/index.js")).toBe("vendor-editor")
    expect(vendorChunkName("/repo/node_modules/react-syntax-highlighter/dist/esm/prism.js")).toBe("vendor-code-highlight")
    expect(vendorChunkName("/repo/node_modules/@shikijs/langs/dist/index.js")).toBeUndefined()
    expect(vendorChunkName("/repo/node_modules/@remixicon/react/index.js")).toBe("vendor-ui")
    expect(vendorChunkName("/repo/node_modules/beautiful-mermaid/dist/index.js")).toBe("vendor-diagrams")
  })
})
