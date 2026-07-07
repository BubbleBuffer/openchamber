import "../react/helpers/chatInputMocks"
import { resetChatInputState } from "../react/helpers/chatInputMocks"

import { fireEvent, screen } from "@testing-library/react"
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { act } from "react"
import { bench, describe } from "vitest"
import { seedUIStore } from "../react/helpers/stores"
import { useRuntimeStore } from "@/stores/useRuntimeStore"
import { createCommitCollector, createProfiledElement } from "../react/helpers/renderMetrics"
import { renderWithApp } from "../react/helpers/render"
import { ChatInput } from "@/components/chat/ChatInput"
import { useUIStore } from "@/stores/useUIStore"
import { useVisualPreferencesStore } from "@/stores/useVisualPreferencesStore"

const SNAPSHOT_DIR = resolve(import.meta.dirname, "__snapshots__")
const SNAPSHOT_PATH = resolve(SNAPSHOT_DIR, "chat-input.bench.snap.json")

type SampleSnapshot = {
  version: 1
  /** When true, the snapshot is the source of truth; benches must match. */
  frozen: boolean
  samples: {
    singleKeystroke: number[]
    burst50: number[]
    unrelatedStore: number
  }
}

function loadOrInitSnapshot(): SampleSnapshot {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })
  if (!existsSync(SNAPSHOT_PATH)) {
    const initial: SampleSnapshot = {
      version: 1,
      frozen: false,
      samples: { singleKeystroke: [], burst50: [], unrelatedStore: -1 },
    }
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(initial, null, 2))
    return initial
  }
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SampleSnapshot
}

function saveSnapshot(snapshot: SampleSnapshot): void {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
}

const MAX_SAMPLES = 3

function recordSampleArray(name: string, key: "singleKeystroke" | "burst50", sample: number): void {
  const snapshot = loadOrInitSnapshot()
  snapshot.samples[key].push(sample)
  if (snapshot.samples[key].length > MAX_SAMPLES) {
    snapshot.samples[key] = snapshot.samples[key].slice(0, MAX_SAMPLES)
  }
  if (snapshot.frozen) {
    const frozen = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SampleSnapshot
    const frozenSamples = frozen.samples[key]
    if (frozenSamples.length !== snapshot.samples[key].length) {
      throw new Error(
        `${name} sample count drift: frozen has ${frozenSamples.length}, ` +
          `current run has ${snapshot.samples[key].length}. ` +
          `Delete ${SNAPSHOT_PATH} to reset the baseline.`,
      )
    }
    for (let i = 0; i < snapshot.samples[key].length; i++) {
      if (snapshot.samples[key][i] !== frozenSamples[i]) {
        throw new Error(
          `${name} sample[${i}] drift: frozen=${frozenSamples[i]} current=${snapshot.samples[key][i]}. ` +
            `Delete ${SNAPSHOT_PATH} to reset the baseline.`,
        )
      }
    }
  }
  saveSnapshot(snapshot)
}

function recordSingleKeystroke(sample: number): void {
  recordSampleArray("single keystroke", "singleKeystroke", sample)
}

function recordBurst50(sample: number): void {
  recordSampleArray("50-character burst", "burst50", sample)
}

function recordUnrelatedStore(sample: number): void {
  const snapshot = loadOrInitSnapshot()
  snapshot.samples.unrelatedStore = sample
  if (snapshot.frozen && snapshot.samples.unrelatedStore !== 0) {
    throw new Error(
      `unrelated store write produced ${sample} updates; expected 0. ` +
        `Delete ${SNAPSHOT_PATH} to reset the baseline.`,
    )
  }
  saveSnapshot(snapshot)
}

describe("chat input render perf", () => {
  bench(
    "single keystroke commit count",
    () => {
      resetChatInputState()
      seedUIStore({ inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      useRuntimeStore.setState({ isMobile: false, isKeyboardOpen: false }, false)
      useVisualPreferencesStore.setState({ inputBarOffset: 0 }, false)
      const collector = createCommitCollector("ChatInput")
      const { unmount } = renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      const textarea = screen.getByLabelText("Chat input")
      fireEvent.change(textarea, { target: { value: "a" } })
      const sample = collector.commits.filter((c) => c.phase !== "mount").length
      recordSingleKeystroke(sample)
      unmount()
    },
    { iterations: 3 },
  )

  bench(
    "50-character burst commit count",
    () => {
      resetChatInputState()
      seedUIStore({ inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      useRuntimeStore.setState({ isMobile: false, isKeyboardOpen: false }, false)
      useVisualPreferencesStore.setState({ inputBarOffset: 0 }, false)
      const collector = createCommitCollector("ChatInput")
      const { unmount } = renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      const textarea = screen.getByLabelText("Chat input")
      fireEvent.change(textarea, { target: { value: "a".repeat(50) } })
      const sample = collector.commits.filter((c) => c.phase !== "mount").length
      recordBurst50(sample)
      unmount()
    },
    { iterations: 3 },
  )

  bench(
    "unrelated UI store change commits zero updates",
    () => {
      resetChatInputState()
      seedUIStore({ inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      useRuntimeStore.setState({ isMobile: false, isKeyboardOpen: false }, false)
      useVisualPreferencesStore.setState({ inputBarOffset: 0 }, false)
      const collector = createCommitCollector("ChatInput")
      renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      act(() => {
        useUIStore.setState({ settingsPage: "agents" }, false)
      })
      const updates = collector.commits.filter((c) => c.phase !== "mount").length
      recordUnrelatedStore(updates)
    },
    { iterations: 1 },
  )
})
