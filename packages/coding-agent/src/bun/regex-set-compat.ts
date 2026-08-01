type RegexSetPattern = string | RegExp | { pattern: string | RegExp };

function toRegExp(pattern: RegexSetPattern): RegExp {
	const value = typeof pattern === "object" && !(pattern instanceof RegExp) ? pattern.pattern : pattern;
	if (value instanceof RegExp) {
		return new RegExp(value.source, value.flags.replace(/[gy]/g, ""));
	}
	return new RegExp(value);
}

/** JavaScript fallback for extensions using @stll/regex-set in a Bun standalone binary. */
export class BunRegexSetCompat {
	private readonly patterns: RegExp[];

	constructor(patterns: RegexSetPattern[]) {
		this.patterns = patterns.map(toRegExp);
	}

	isMatch(haystack: string): boolean {
		return this.patterns.some((pattern) => pattern.test(haystack));
	}

	whichMatch(haystack: string): number[] {
		const matches: number[] = [];
		for (let index = 0; index < this.patterns.length; index++) {
			if (this.patterns[index]?.test(haystack)) matches.push(index);
		}
		return matches;
	}
}
