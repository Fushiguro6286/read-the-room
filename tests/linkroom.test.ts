import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/llm", () => ({ llmJson: vi.fn() }));
import { fetchReadable, htmlToText, isPrivateIp } from "@/lib/linkroom";

describe("SSRF guard", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("rejects non-http schemes and private hosts before fetching", async () => {
    await expect(fetchReadable("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(fetchReadable("http://127.0.0.1:3000/")).rejects.toThrow(/private/);
    await expect(fetchReadable("http://[::1]/")).rejects.toThrow(/private/);
  });
});

describe("htmlToText", () => {
  it("keeps title and description, drops scripts and tags", () => {
    const t = htmlToText('<title>Jazz Night</title><meta name="description" content="Austin, 21+"><script>evil()</script><p>Doors &amp; drinks</p>');
    expect(t).toContain("Jazz Night");
    expect(t).toContain("Austin, 21+");
    expect(t).toContain("Doors & drinks");
    expect(t).not.toContain("evil");
  });
});
