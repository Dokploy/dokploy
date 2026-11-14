import { parse } from "dotenv";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const assertEnvKey = (key: string) => {
	if (!ENV_KEY.test(key)) {
		throw new Error(`Invalid environment variable name: ${key}`);
	}
};

// Read with the same dotenv parser prepareEnvironmentVariables uses, so the
// value is the one the container receives; a repeated key resolves to its
// last line there too.
export const readEnvVar = (
	env: string | null | undefined,
	key: string,
): string | null => {
	assertEnvKey(key);
	return parse(env ?? "")[key] ?? null;
};

export const setEnvVar = (
	env: string | null | undefined,
	key: string,
	value: string | null,
): string => {
	assertEnvKey(key);
	// A line break would end this line and start another variable in the
	// application env.
	if (value !== null && /[\r\n]/.test(value)) {
		throw new Error(`The value of ${key} contains a line break`);
	}
	// Dokploy replaces ${{...}} with a project, environment or service variable
	// when it deploys (prepareEnvironmentVariables in utils/docker/utils.ts).
	if (value?.includes("${{")) {
		throw new Error(
			`The value of ${key} contains \${{, which Dokploy would resolve when it deploys`,
		);
	}
	// Matches every form dotenv accepts as a definition of the key.
	const definesKey = new RegExp(`^\\s*(?:export\\s+)?${key}(?:\\s*=|:\\s)`);
	const lines = env ? env.split("\n") : [];
	const kept: string[] = [];
	let written = false;
	for (const line of lines) {
		if (!definesKey.test(line)) {
			kept.push(line);
		} else if (value !== null && !written) {
			kept.push(`${key}=${value}`);
			written = true;
		}
	}
	if (value !== null && !written) {
		const endsWithNewline = kept.at(-1) === "";
		kept.splice(
			endsWithNewline ? kept.length - 1 : kept.length,
			0,
			`${key}=${value}`,
		);
	}
	const result = kept.join("\n");
	// An unquoted value that dotenv would trim or cut at a # reaches the
	// container changed, so it is refused instead.
	if (value !== null && readEnvVar(result, key) !== value) {
		throw new Error(
			`The value of ${key} cannot be stored as an unquoted environment line`,
		);
	}
	return result;
};

const containerEnvKey = (entry: string) => {
	const separator = entry.indexOf("=");
	return separator === -1 ? entry : entry.slice(0, separator);
};

export const mergeContainerEnv = (
	base: string[],
	overrides: string[],
): string[] => {
	const overrideKeys = new Set<string>();
	for (const entry of overrides) {
		const key = containerEnvKey(entry);
		if (!entry.includes("=") || !ENV_KEY.test(key)) {
			throw new Error(`Invalid container environment override: ${key}`);
		}
		if (overrideKeys.has(key)) {
			throw new Error(`Duplicate container environment override: ${key}`);
		}
		overrideKeys.add(key);
	}
	return [
		...base.filter((entry) => !overrideKeys.has(containerEnvKey(entry))),
		...overrides,
	];
};
