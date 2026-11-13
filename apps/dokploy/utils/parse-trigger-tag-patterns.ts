/** Split a comma-separated list without splitting glob groups or escaped commas. */
export const parseTriggerTagPatterns = (input: string): string[] => {
	const patterns = new Set<string>();
	const closingDelimiters: string[] = [];
	let quoted = false;
	let start = 0;

	const addPattern = (end: number) => {
		const pattern = input.slice(start, end).trim();
		if (pattern) patterns.add(pattern);
	};

	for (let index = 0; index < input.length; index++) {
		const character = input[index];
		// Keep the escape itself for micromatch, but skip the escaped character.
		if (character === "\\") {
			index++;
			continue;
		}

		// Braces and parentheses inside a character class are literals.
		if (closingDelimiters.at(-1) === "]") {
			if (character === "]") closingDelimiters.pop();
			continue;
		}

		if (character === '"') {
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;

		if (character === "{") closingDelimiters.push("}");
		else if (character === "[") closingDelimiters.push("]");
		else if (character === "(") closingDelimiters.push(")");
		else if (character === closingDelimiters.at(-1)) closingDelimiters.pop();
		else if (character === "," && closingDelimiters.length === 0) {
			addPattern(index);
			start = index + 1;
		}
	}

	// Preserve incomplete patterns as entered; this parser does not validate globs.
	addPattern(input.length);
	return [...patterns];
};
