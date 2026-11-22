import { describe, expect, it } from "vitest";
import { formatIpv6, ipv6Groups, truncateIp } from "./client-ip";

// Documentation ranges only (RFC 5737, RFC 3849).
describe("session IP truncation", () => {
	it("keeps the /24 network of an IPv4 address", () => {
		expect(truncateIp("203.0.113.77")).toBe("203.0.113.0/24");
		expect(truncateIp(" 198.51.100.9 ")).toBe("198.51.100.0/24");
		expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
		expect(truncateIp("::FFFF:198.51.100.9")).toBe("198.51.100.0/24");
	});

	it("keeps the /48 prefix of an IPv6 address, in PostgreSQL's cidr text", () => {
		expect(truncateIp("2001:db8:1:2::5")).toBe("2001:db8:1::/48");
		expect(truncateIp("2001:0DB8:0001:0002:0003:0004:0005:0006")).toBe("2001:db8:1::/48");
		expect(truncateIp("2001:db8::1")).toBe("2001:db8::/48");
		expect(truncateIp("2001:0:0:1::1")).toBe("2001::/48");
		expect(truncateIp("0:db8:1::")).toBe("0:db8:1::/48");
		expect(truncateIp("::1")).toBe("::/48");
		expect(truncateIp("::ffff:c633:6409")).toBe("::/48");
		expect(truncateIp("2001:db8:1::203.0.113.7")).toBe("2001:db8:1::/48");
	});

	it("drops anything that is not an address", () => {
		for (const value of [
			null,
			undefined,
			"",
			"junk",
			"300.1.1.1",
			"1.2.3",
			"2001:db8::1::2",
			"::ffff:300.1.1.1",
			"fe80::1%eth0",
		]) {
			expect(truncateIp(value), String(value)).toBeNull();
		}
	});

	it("parses and prints IPv6 groups", () => {
		expect(ipv6Groups("2001:db8::1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
		expect(ipv6Groups("1:2:3:4:5:6:7:8")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(ipv6Groups("1:2:3")).toBeNull();
		expect(ipv6Groups("1:2:3:4:5:6:7:8::")).toBeNull();
		expect(formatIpv6([1, 0, 0, 2, 0, 0, 0, 3])).toBe("1:0:0:2::3");
		expect(formatIpv6([1, 0, 2, 3, 4, 5, 6, 7])).toBe("1:0:2:3:4:5:6:7");
		expect(formatIpv6([0, 0, 0, 0, 0, 0, 0, 0])).toBe("::");
	});
});
