import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { usePermissionStore } = await import("./permissionStore");

describe("permissionStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePermissionStore.setState({ autoAccept: {} }, false);
  });

  it("isSessionAutoAccepting returns false for unknown session", () => {
    expect(
      usePermissionStore.getState().isSessionAutoAccepting("nope"),
    ).toBe(false);
  });

  it("isSessionAutoAccepting returns true when session is marked accepting", () => {
    usePermissionStore.setState({
      autoAccept: { "sess-1": true },
    });
    expect(
      usePermissionStore.getState().isSessionAutoAccepting("sess-1"),
    ).toBe(true);
  });

  it("autoAccept persists across getState/setState cycles via storage", () => {
    usePermissionStore.setState({ autoAccept: { "sess-x": true } });
    const raw = window.localStorage.getItem("permission-store");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.autoAccept).toEqual({ "sess-x": true });
  });
});
