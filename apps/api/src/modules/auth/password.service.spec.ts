import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies the same password", async () => {
    const hash = await service.hash("hunter22-strong");
    expect(hash.startsWith("$argon2")).toBe(true);
    expect(await service.verify(hash, "hunter22-strong")).toBe(true);
    expect(await service.verify(hash, "wrong-password")).toBe(false);
  });

  it("flags non-argon2 hashes for rehashing", () => {
    expect(service.needsRehash("$2b$10$abcdefghijklmnopqrstuv")).toBe(true);
    expect(service.needsRehash("$argon2id$v=19$m=19456,t=2,p=1$xxx$yyy")).toBe(false);
  });

  it("returns false for empty/garbage hashes", async () => {
    expect(await service.verify("", "x")).toBe(false);
    expect(await service.verify("not-a-hash", "x")).toBe(false);
  });
});
