import { describe, it, expect } from "vitest";
import { isPublicIp, isLoopbackIp, isLinkLocalIp, parseIPv6 } from "../lib/ipPolicy";

describe("isPublicIp", () => {
  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "[2001:4860:4860::8888]"]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it("blocks every special-purpose IPv4 block, not just RFC1918", () => {
    for (const ip of [
      "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254",
      "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1",
      "198.51.100.1", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback, unspecified, ULA, link-local (whole fe80::/10), multicast", () => {
    for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "fec0::1", "ff02::1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it("checks the IPv4 embedded in mapped / NAT64 / 6to4 addresses in every spelling", () => {
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:7f00:1")).toBe(false);
    expect(isPublicIp("0:0:0:0:0:ffff:7f00:1")).toBe(false);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicIp("64:ff9b::7f00:1")).toBe(false);
    expect(isPublicIp("64:ff9b::808:808")).toBe(true);
    expect(isPublicIp("2002:7f00:1::1")).toBe(false);
    expect(isPublicIp("2002:0808:0808::1")).toBe(true);
    expect(isPublicIp("::127.0.0.1")).toBe(false);
  });

  it("blocks documentation/Teredo ranges and treats garbage as not public", () => {
    expect(isPublicIp("2001:db8::1")).toBe(false);
    expect(isPublicIp("2001:0:4136:e378:8000:63bf:3fff:fdd2")).toBe(false);
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});

describe("isLoopbackIp / isLinkLocalIp", () => {
  it("recognises loopback in both families and mapped form", () => {
    expect(isLoopbackIp("127.5.5.5")).toBe(true);
    expect(isLoopbackIp("::1")).toBe(true);
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackIp("10.0.0.1")).toBe(false);
    expect(isLoopbackIp("::")).toBe(false);
  });

  it("recognises the whole link-local range", () => {
    expect(isLinkLocalIp("169.254.169.254")).toBe(true);
    expect(isLinkLocalIp("fe80::1")).toBe(true);
    expect(isLinkLocalIp("fea0::1")).toBe(true);
    expect(isLinkLocalIp("::ffff:169.254.169.254")).toBe(true);
    expect(isLinkLocalIp("10.0.0.1")).toBe(false);
  });
});

describe("parseIPv6", () => {
  it("expands compression and embedded dotted quads", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6("fe80::1%eth0")?.[0]).toBe(0xfe80);
    expect(parseIPv6("1.2.3.4")).toBeNull();
  });
});
