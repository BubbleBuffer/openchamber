const NODE_MODULES_SEGMENT = "/node_modules/"

export function packageNameFromModuleId(id: string): string | undefined {
  const normalized = id.replaceAll("\\", "/")
  const segmentIndex = normalized.lastIndexOf(NODE_MODULES_SEGMENT)
  if (segmentIndex === -1) return undefined

  const packagePath = normalized.slice(segmentIndex + NODE_MODULES_SEGMENT.length)
  const segments = packagePath.split("/")
  if (!segments[0]) return undefined

  if (!segments[0].startsWith("@")) return segments[0]
  if (!segments[1]) return undefined
  return `${segments[0]}/${segments[1]}`
}

export function vendorChunkName(id: string): string | undefined {
  const packageName = packageNameFromModuleId(id)
  if (!packageName) return undefined

  if (packageName === "react" || packageName === "react-dom") return "vendor-react"
  if (packageName === "zustand") return "vendor-zustand"
  if (packageName === "@opencode-ai/sdk") return "vendor-opencode-sdk"
  if (
    packageName.startsWith("@codemirror/")
    || packageName.startsWith("@lezer/")
  ) return "vendor-editor"
  if (
    packageName.includes("remark")
    || packageName.includes("rehype")
    || packageName === "react-markdown"
  ) return "vendor-markdown"
  if (packageName.startsWith("@base-ui/")) return "vendor-base-ui"
  if (
    packageName.includes("react-syntax-highlighter")
    || packageName.includes("highlight.js")
  ) return "vendor-code-highlight"
  // Shiki's language and grammar modules are loaded on demand. Forcing every
  // @shikijs package into one manual chunk collapses those lazy boundaries
  // into a multi-megabyte startup dependency.
  if (packageName === "shiki" || packageName.startsWith("@shikijs/")) return undefined
  if (
    packageName === "@remixicon/react"
    || packageName.startsWith("@radix-ui/")
    || packageName.startsWith("@dnd-kit/")
    || packageName === "@tanstack/react-virtual"
    || packageName === "cmdk"
    || packageName === "motion"
  ) return "vendor-ui"
  if (
    packageName === "beautiful-mermaid"
    || packageName === "elkjs"
    || packageName === "katex"
  ) return "vendor-diagrams"

  // Let Rollup co-locate the long tail with its importer. A chunk per package
  // creates hundreds of tiny requests and empty proxy chunks in Bun installs.
  return undefined
}
