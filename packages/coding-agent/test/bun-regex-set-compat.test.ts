import { describe, expect, it } from "vitest";
import { BunRegexSetCompat } from "../src/bun/regex-set-compat.ts";

describe("BunRegexSetCompat", () => {
	it("reports matching pattern indices in declaration order", () => {
		const set = new BunRegexSetCompat([/^grep\s/, /^find\s/, { pattern: /^cat\s/i }]);

		expect(set.whichMatch("find .")).toEqual([1]);
		expect(set.whichMatch("CAT file.txt")).toEqual([2]);
		expect(set.whichMatch("printf ok")).toEqual([]);
	});

	it("supports repeated matching without state leaking from global expressions", () => {
		const set = new BunRegexSetCompat([/foo/g]);

		expect(set.isMatch("foo")).toBe(true);
		expect(set.isMatch("foo")).toBe(true);
	});
});
