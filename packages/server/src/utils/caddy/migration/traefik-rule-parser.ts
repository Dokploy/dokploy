import type { CaddyMigrationWarning, TraefikRuleMatch } from "./types";

interface ParseOptions {
	source?: string;
	routerName?: string;
}

type TokenType =
	| "identifier"
	| "string"
	| "and"
	| "or"
	| "lparen"
	| "rparen"
	| "comma";

interface Token {
	type: TokenType;
	value: string;
}

type RuleNode =
	| { type: "matcher"; name: string; args: string[] }
	| { type: "and" | "or"; left: RuleNode; right: RuleNode };

const warning = (
	message: string,
	options: ParseOptions,
	code: CaddyMigrationWarning["code"] = "unsupported-rule",
): CaddyMigrationWarning => ({
	code,
	message,
	blocking: true,
	source: options.source,
	routerName: options.routerName,
});

const tokenizeRule = (rule: string, options: ParseOptions) => {
	const tokens: Token[] = [];
	let index = 0;

	while (index < rule.length) {
		const char = rule[index] ?? "";
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (rule.startsWith("&&", index)) {
			tokens.push({ type: "and", value: "&&" });
			index += 2;
			continue;
		}
		if (rule.startsWith("||", index)) {
			tokens.push({ type: "or", value: "||" });
			index += 2;
			continue;
		}
		if (char === "(") {
			tokens.push({ type: "lparen", value: char });
			index += 1;
			continue;
		}
		if (char === ")") {
			tokens.push({ type: "rparen", value: char });
			index += 1;
			continue;
		}
		if (char === ",") {
			tokens.push({ type: "comma", value: char });
			index += 1;
			continue;
		}
		if (char === "`" || char === "'" || char === '"') {
			const quote = char;
			let value = "";
			index += 1;
			while (index < rule.length && rule[index] !== quote) {
				value += rule[index] ?? "";
				index += 1;
			}
			if (rule[index] !== quote) {
				throw new Error(
					warning("Unterminated string in Traefik rule", options).message,
				);
			}
			index += 1;
			tokens.push({ type: "string", value });
			continue;
		}
		if (/[A-Za-z]/.test(char)) {
			let value = "";
			while (index < rule.length && /[A-Za-z0-9_]/.test(rule[index] ?? "")) {
				value += rule[index] ?? "";
				index += 1;
			}
			tokens.push({ type: "identifier", value });
			continue;
		}
		throw new Error(
			warning(`Unsupported token "${char}" in Traefik rule`, options).message,
		);
	}

	return tokens;
};

class RuleParser {
	private index = 0;

	constructor(
		private readonly tokens: Token[],
		private readonly options: ParseOptions,
	) {}

	parse() {
		const expression = this.parseOr();
		if (this.peek()) {
			throw new Error(
				warning(
					`Unexpected token "${this.peek()?.value}" in Traefik rule`,
					this.options,
				).message,
			);
		}
		return expression;
	}

	private peek() {
		return this.tokens[this.index];
	}

	private consume(type?: TokenType) {
		const token = this.tokens[this.index];
		if (!token || (type && token.type !== type)) {
			throw new Error(
				warning(`Expected ${type ?? "token"} in Traefik rule`, this.options)
					.message,
			);
		}
		this.index += 1;
		return token;
	}

	private parseOr(): RuleNode {
		let node = this.parseAnd();
		while (this.peek()?.type === "or") {
			this.consume("or");
			node = { type: "or", left: node, right: this.parseAnd() };
		}
		return node;
	}

	private parseAnd(): RuleNode {
		let node = this.parsePrimary();
		while (this.peek()?.type === "and") {
			this.consume("and");
			node = { type: "and", left: node, right: this.parsePrimary() };
		}
		return node;
	}

	private parsePrimary(): RuleNode {
		const token = this.peek();
		if (token?.type === "lparen") {
			this.consume("lparen");
			const node = this.parseOr();
			this.consume("rparen");
			return node;
		}
		if (token?.type !== "identifier") {
			throw new Error(
				warning("Expected Traefik matcher in rule", this.options).message,
			);
		}

		const name = this.consume("identifier").value;
		this.consume("lparen");
		const args: string[] = [];
		while (this.peek()?.type !== "rparen") {
			args.push(this.consume("string").value);
			if (this.peek()?.type === "comma") {
				this.consume("comma");
			} else if (this.peek()?.type !== "rparen") {
				throw new Error(
					warning(`Expected comma in ${name} matcher`, this.options).message,
				);
			}
		}
		this.consume("rparen");
		return { type: "matcher", name, args };
	}
}

const mergeMatches = (
	left: TraefikRuleMatch,
	right: TraefikRuleMatch,
	warnings: CaddyMigrationWarning[],
	options: ParseOptions,
): TraefikRuleMatch | null => {
	const hosts = [...new Set([...left.hosts, ...right.hosts])];
	const pathPrefix = left.pathPrefix ?? right.pathPrefix ?? null;
	const pathExact = left.pathExact ?? right.pathExact ?? null;

	if (
		left.pathPrefix &&
		right.pathPrefix &&
		left.pathPrefix !== right.pathPrefix
	) {
		warnings.push(
			warning(
				`Multiple PathPrefix matchers cannot be represented as one Caddy route: ${left.pathPrefix}, ${right.pathPrefix}`,
				options,
			),
		);
		return null;
	}
	if (left.pathExact && right.pathExact && left.pathExact !== right.pathExact) {
		warnings.push(
			warning(
				`Multiple Path matchers cannot be represented as one Caddy route: ${left.pathExact}, ${right.pathExact}`,
				options,
			),
		);
		return null;
	}
	if (pathPrefix && pathExact) {
		warnings.push(
			warning(
				`Combined Path and PathPrefix matchers cannot be represented as one Caddy route: ${pathExact}, ${pathPrefix}`,
				options,
			),
		);
		return null;
	}

	return { hosts, pathPrefix, pathExact };
};

const expandRuleNode = (
	node: RuleNode,
	warnings: CaddyMigrationWarning[],
	options: ParseOptions,
): TraefikRuleMatch[] => {
	if (node.type === "matcher") {
		if (node.name === "Host") {
			return [{ hosts: [...new Set(node.args)] }];
		}
		if (node.name === "PathPrefix") {
			return node.args.map((pathPrefix) => ({ hosts: [], pathPrefix }));
		}
		if (node.name === "Path") {
			return node.args.map((pathExact) => ({ hosts: [], pathExact }));
		}
		warnings.push(
			warning(
				`Unsupported Traefik matcher "${node.name}" in rule`,
				options,
				"unsupported-matcher",
			),
		);
		return [];
	}

	const left = expandRuleNode(node.left, warnings, options);
	const right = expandRuleNode(node.right, warnings, options);
	if (node.type === "or") {
		return [...left, ...right];
	}

	const merged: TraefikRuleMatch[] = [];
	for (const leftMatch of left) {
		for (const rightMatch of right) {
			const match = mergeMatches(leftMatch, rightMatch, warnings, options);
			if (match) {
				merged.push(match);
			}
		}
	}
	return merged;
};

const normalizeMatches = (
	matches: TraefikRuleMatch[],
	warnings: CaddyMigrationWarning[],
	options: ParseOptions,
) => {
	const grouped = new Map<string, TraefikRuleMatch>();
	for (const match of matches) {
		if (!match.hosts.length) {
			warnings.push(
				warning("Traefik rule did not include a Host matcher", options),
			);
			continue;
		}

		const key = `${match.pathPrefix ?? ""}\u0000${match.pathExact ?? ""}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.hosts = [...new Set([...existing.hosts, ...match.hosts])];
		} else {
			grouped.set(key, {
				...match,
				hosts: [...new Set(match.hosts)],
			});
		}
	}
	return [...grouped.values()];
};

export const parseTraefikRule = (
	rule: string,
	options: ParseOptions = {},
): { matches: TraefikRuleMatch[]; warnings: CaddyMigrationWarning[] } => {
	const warnings: CaddyMigrationWarning[] = [];
	try {
		const tokens = tokenizeRule(rule, options);
		const ast = new RuleParser(tokens, options).parse();
		const matches = normalizeMatches(
			expandRuleNode(ast, warnings, options),
			warnings,
			options,
		);
		return { matches, warnings };
	} catch (error) {
		return {
			matches: [],
			warnings: [
				warning(
					error instanceof Error
						? error.message
						: "Failed to parse Traefik rule",
					options,
				),
			],
		};
	}
};
