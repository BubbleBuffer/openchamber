/**
 * SessionSidebar — test harness and narrow coverage slice.
 *
 * **DO NOT render `<SessionSidebar />` here.** The component is 1775 lines
 * and depends on ~30 mocked modules. Full render tests are explicitly
 * deferred per Recommendation 7 of the handoff spec.
 *
 * These two tests verify the reusable mock harness itself:
 * 1. resetSessionSidebarState() returns state to defaults
 * 2. Factory helpers produce valid shapes and seed state correctly
 */
import { describe, it, expect } from "vitest"
import {
  sessionSidebarTestState,
  resetSessionSidebarState,
  makeSidebarSession,
  makeSidebarProject,
  seedSidebarSessions,
  seedSidebarProjects,
} from "./helpers/sessionSidebarMocks"

describe("SessionSidebar test harness", () => {
  describe("resetSessionSidebarState", () => {
    it("restores all state to defaults", () => {
      // Mutate state away from defaults
      sessionSidebarTestState.liveSessions = [{ id: "sess-mutated" }]
      sessionSidebarTestState.currentSessionId = "sess-mutated"
      sessionSidebarTestState.newSessionDraftOpen = true
      sessionSidebarTestState.activeSessions = [{ id: "active-mutated" }]
      sessionSidebarTestState.projects = [{ id: "proj-mutated" }]
      sessionSidebarTestState.hasLoaded = false
      sessionSidebarTestState.gitHubAuthHasChecked = true

      // Reset
      resetSessionSidebarState()

      // Assert defaults restored
      expect(sessionSidebarTestState.liveSessions).toEqual([])
      expect(sessionSidebarTestState.currentSessionId).toBeNull()
      expect(sessionSidebarTestState.newSessionDraftOpen).toBe(false)
      expect(sessionSidebarTestState.activeSessions).toEqual([])
      expect(sessionSidebarTestState.projects).toEqual([])
      expect(sessionSidebarTestState.hasLoaded).toBe(true)
      expect(sessionSidebarTestState.gitHubAuthHasChecked).toBe(false)
    })
  })

  describe("factory helpers", () => {
    it("makeSidebarSession produces objects with expected fields", () => {
      const session = makeSidebarSession()
      expect(session).toHaveProperty("id")
      expect(session).toHaveProperty("title")
      expect(session).toHaveProperty("directory")
      expect(session).toHaveProperty("time")
      expect(typeof session.id).toBe("string")
      expect(session.id).toMatch(/^test-session-\d+$/)

      // With explicit id and overrides
      const overridden = makeSidebarSession("my-session", { title: "Custom" })
      expect(overridden.id).toBe("my-session")
      expect(overridden.title).toBe("Custom")
    })

    it("makeSidebarProject produces objects with expected fields", () => {
      const project = makeSidebarProject()
      expect(project).toHaveProperty("id")
      expect(project).toHaveProperty("path")
      expect(project).toHaveProperty("label")
      expect(project).toHaveProperty("color")
      expect(typeof project.id).toBe("string")
      expect(project.id).toMatch(/^test-project-\d+$/)

      // With explicit id and overrides
      const overridden = makeSidebarProject("my-project", { label: "My Project", path: "/custom/path" })
      expect(overridden.id).toBe("my-project")
      expect(overridden.label).toBe("My Project")
      expect(overridden.path).toBe("/custom/path")
    })

    it("seedSidebarSessions populates sessionSidebarTestState.activeSessions", () => {
      const prevLength = sessionSidebarTestState.activeSessions.length
      seedSidebarSessions(3)
      expect(sessionSidebarTestState.activeSessions.length).toBe(prevLength + 3)
      for (const s of sessionSidebarTestState.activeSessions) {
        expect(s).toHaveProperty("id")
        expect(s).toHaveProperty("title")
      }
    })

    it("seedSidebarProjects populates sessionSidebarTestState.projects", () => {
      const prevLength = sessionSidebarTestState.projects.length
      seedSidebarProjects(2)
      expect(sessionSidebarTestState.projects.length).toBe(prevLength + 2)
      for (const p of sessionSidebarTestState.projects) {
        expect(p).toHaveProperty("id")
        expect(p).toHaveProperty("path")
        expect(p).toHaveProperty("label")
      }
    })
  })
})
