import { describe, expect, it } from "vitest";
import { defaultVisibleViewsForRole, isAppViewKey } from "./views";

describe("views", () => {
  it("admin sees every view by default", () => {
    const views = defaultVisibleViewsForRole("ADMIN");
    expect(views.length).toBeGreaterThanOrEqual(10);
    expect(views).toContain("admin_users");
    expect(views).toContain("dashboard_kpi");
  });

  it("agent only sees agent views", () => {
    const views = defaultVisibleViewsForRole("AGENT");
    expect(views).toContain("agent_dashboard");
    expect(views).toContain("agent_sales");
    expect(views).not.toContain("admin_users");
  });

  it("controlling sees controlling views", () => {
    const views = defaultVisibleViewsForRole("CONTROLLING");
    expect(views).toContain("controlling_review");
    expect(views).not.toContain("admin_users");
  });

  it("rejects unknown view keys", () => {
    expect(isAppViewKey("agent_dashboard")).toBe(true);
    expect(isAppViewKey("agent_sales")).toBe(true);
    expect(isAppViewKey("totally_made_up")).toBe(false);
  });
});
