/**
 * Phase 3 Allowlist Fail-Fast Test
 *
 * Ensures no open allowlist entry references a Phase 3 migrated domain.
 * Phase 3 migrated domains are closed — no new allowlist exceptions are
 * permitted for them.
 *
 * Run: bun test packages/ui/src/lib/phase3-allowlist.test.ts
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Phase 3 migrated domains — these are CLOSED, no allowlist exceptions permitted
const PHASE3_MIGRATED_DOMAINS = [
  // Session lifecycle/status — migrated to session machine
  'session.lifecycle',
  'session.status',
  'session.activity',
  // Streaming — migrated to machine streaming selectors
  'streaming.message-id',
  'streaming.phase',
  // Retry — migrated to machine retry state
  'retry.overlay',
  'retry.state',
  // Blocking interruptions — migrated to machine permission/question selectors
  'blocking.interruption',
  'permission.asked',
  'question.asked',
  // History — migrated to machine history state
  'history.load',
  'history.state',
] as const

type Phase3Domain = typeof PHASE3_MIGRATED_DOMAINS[number]

interface AllowlistEntry {
  file: string
  owner: string
  reason: string
  domain: string
  phase: string
  expiry: string
  status: 'OPEN' | 'CLOSED' | 'INVALID'
}

function parseAllowlist(content: string): AllowlistEntry[] {
  const entries: AllowlistEntry[] = []
  const lines = content.split('\n')

  let currentEntry: Partial<AllowlistEntry> = {}
  let section: 'active' | 'closed' | 'invalid' | 'none' = 'none'

  for (const line of lines) {
    const trimmed = line.trim()

    // Track section
    if (trimmed === '## Active Entries') { section = 'active'; continue }
    if (trimmed === '## Closed Entries') { section = 'closed'; continue }
    if (trimmed === '## Invalid Entries') { section = 'invalid'; continue }

    // Parse active entry fields
    if (trimmed.startsWith('- **File:**')) {
      currentEntry = { file: trimmed.replace('- **File:**', '').trim() }
      continue
    }
    if (trimmed.startsWith('- **Owner:**')) {
      currentEntry.owner = trimmed.replace('- **Owner:**', '').trim()
      continue
    }
    if (trimmed.startsWith('- **Reason:**')) {
      currentEntry.reason = trimmed.replace('- **Reason:**', '').trim()
      continue
    }
    if (trimmed.startsWith('- **Affected Domain:**')) {
      currentEntry.domain = trimmed.replace('- **Affected Domain:**', '').trim()
      continue
    }
    if (trimmed.startsWith('- **Phase:**')) {
      currentEntry.phase = trimmed.replace('- **Phase:**', '').trim()
      continue
    }
    if (trimmed.startsWith('- **Expiry:**')) {
      currentEntry.expiry = trimmed.replace('- **Expiry:**', '').trim()
      continue
    }
    if (trimmed.startsWith('- **Status:**')) {
      const statusStr = trimmed.replace('- **Status:**', '').trim()
      currentEntry.status = statusStr.split('—')[0].trim() as AllowlistEntry['status']
      currentEntry.status = currentEntry.status as AllowlistEntry['status']
    }

    // Empty line marks end of entry
    if (trimmed === '' && currentEntry.file) {
      if (section === 'active' && currentEntry.status === 'OPEN') {
        entries.push({
          file: currentEntry.file!,
          owner: currentEntry.owner || '',
          reason: currentEntry.reason || '',
          domain: currentEntry.domain || '',
          phase: currentEntry.phase || '',
          expiry: currentEntry.expiry || '',
          status: 'OPEN',
        })
      }
      currentEntry = {}
    }
  }

  // Handle last entry if no trailing newline
  if (currentEntry.file && currentEntry.status === 'OPEN') {
    entries.push({
      file: currentEntry.file!,
      owner: currentEntry.owner || '',
      reason: currentEntry.reason || '',
      domain: currentEntry.domain || '',
      phase: currentEntry.phase || '',
      expiry: currentEntry.expiry || '',
      status: 'OPEN',
    })
  }

  return entries
}

function isPhase3MigratedDomain(domain: string): Phase3Domain | null {
  const normalized = domain.toLowerCase().replace(/\s+/g, '-')
  for (const migrated of PHASE3_MIGRATED_DOMAINS) {
    if (normalized.includes(migrated) || migrated.includes(normalized)) {
      return migrated
    }
  }
  return null
}

describe('Phase 3 allowlist fail-fast', () => {
  const allowlistPath = join(__dirname, '../../../../.superpawers/plans/phase-3-allowlist.md')

  test('allowlist file exists', () => {
    let threw = false
    try {
      readFileSync(allowlistPath, 'utf-8')
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  test('no open allowlist entry references a Phase 3 migrated domain', () => {
    const content = readFileSync(allowlistPath, 'utf-8')
    const entries = parseAllowlist(content)

    const violations: Array<{ entry: AllowlistEntry; migratedDomain: Phase3Domain }> = []

    for (const entry of entries) {
      if (entry.status !== 'OPEN') continue

      const migrated = isPhase3MigratedDomain(entry.domain)
      if (migrated) {
        violations.push({ entry, migratedDomain: migrated })
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map(
          ({ entry, migratedDomain }) =>
            `  - ${entry.file}: domain "${entry.domain}" references Phase 3 migrated domain "${migratedDomain}"`,
        )
        .join('\n')
      throw new Error(
        `FAIL: Found ${violations.length} allowlist entry(ies) referencing Phase 3 migrated domains:\n${msg}\n\nPhase 3 migrated domains are CLOSED. Remove the entry or reclassify as Phase 4.`,
      )
    }

    expect(violations.length).toBe(0)
  })

  test('all open entries have required fields', () => {
    const content = readFileSync(allowlistPath, 'utf-8')
    const entries = parseAllowlist(content)

    for (const entry of entries) {
      if (entry.status !== 'OPEN') continue
      expect(entry.file).toBeTruthy()
      expect(entry.owner).toBeTruthy()
      expect(entry.reason).toBeTruthy()
      expect(entry.domain).toBeTruthy()
      expect(entry.phase).toBeTruthy()
      expect(entry.expiry).toBeTruthy()
    }

    // Empty assertion to confirm loop completed without throwing
    expect(entries.filter(e => e.status === 'OPEN').length).toBeGreaterThan(-1)
  })

  test('VS Code sessionActivityWatcher is classified as Phase 4 deferred', () => {
    const content = readFileSync(allowlistPath, 'utf-8')
    const entries = parseAllowlist(content)

    const vscodeEntry = entries.find(e => e.file.includes('sessionActivityWatcher'))
    expect(vscodeEntry !== undefined).toBe(true)
    expect(vscodeEntry!.status).toBe('OPEN')
    expect(vscodeEntry!.phase).toContain('Phase 4')
  })

  test('__sessionSnapshotCallbackBridge is classified as Phase 4 deferred', () => {
    const content = readFileSync(allowlistPath, 'utf-8')
    const entries = parseAllowlist(content)

    const bridgeEntry = entries.find(e => e.file.includes('__sessionSnapshotCallbackBridge'))
    expect(bridgeEntry !== undefined).toBe(true)
    expect(bridgeEntry!.status).toBe('OPEN')
    expect(bridgeEntry!.phase).toContain('Phase 4')
  })
})
