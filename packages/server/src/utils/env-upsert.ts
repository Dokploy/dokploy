import { createHmac } from "node:crypto";
import { parse } from "dotenv";
import { betterAuthSecret } from "../lib/auth-secret";

export type EnvUpsertAction = "created" | "updated" | "unchanged";

export type EnvUpsertVariableResult = {
	name: string;
	action: EnvUpsertAction;
	secret: boolean;
};

export type EnvUpsertResult = {
	env: string;
	changed: boolean;
	variables: EnvUpsertVariableResult[];
};

const ENV_ASSIGNMENT_REGEX =
	/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;

const SECRET_NAME_REGEX =
	/(^|_)(AUTH|CREDENTIAL|KEY|PASS|PASSWORD|PRIVATE|SECRET|TOKEN|WEBHOOK)($|_)/i;

export const isSecretEnvName = (name: string) => SECRET_NAME_REGEX.test(name);

export const getApplicationEnvRevision = (
	applicationId: string,
	env: string | null | undefined,
) =>
	`env:${createHmac("sha256", betterAuthSecret)
		.update(applicationId)
		.update("\0")
		.update(env ?? "")
		.digest("base64url")
		.slice(0, 32)}`;

const serializeEnvValue = (value: string) => {
	if (value === "") {
		return "";
	}

	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
		return value;
	}

	return `"${value
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/"/g, '\\"')}"`;
};

const splitEnvLines = (env: string) => {
	const normalized = env.replace(/\r\n/g, "\n");
	const trailingNewline = normalized.endsWith("\n");
	const lines = normalized.length > 0 ? normalized.split("\n") : [];

	if (trailingNewline) {
		lines.pop();
	}

	return {
		lines,
		trailingNewline,
	};
};

export const upsertEnvVariables = (
	currentEnv: string | null | undefined,
	variables: Record<string, string>,
): EnvUpsertResult => {
	const env = currentEnv ?? "";
	const currentValues = parse(env);
	const { lines, trailingNewline } = splitEnvLines(env);
	const lastLineByName = new Map<string, number>();

	lines.forEach((line, index) => {
		const match = ENV_ASSIGNMENT_REGEX.exec(line);
		if (match) {
			lastLineByName.set(match[2]!, index);
		}
	});

	let changed = false;
	const variableResults: EnvUpsertVariableResult[] = [];

	for (const [name, value] of Object.entries(variables)) {
		const currentValue = currentValues[name];
		const action =
			currentValue === undefined
				? "created"
				: currentValue === value
					? "unchanged"
					: "updated";

		variableResults.push({
			name,
			action,
			secret: isSecretEnvName(name),
		});

		if (action === "unchanged") {
			continue;
		}

		changed = true;
		const serializedValue = serializeEnvValue(value);
		const existingLineIndex = lastLineByName.get(name);

		if (existingLineIndex !== undefined) {
			const match = ENV_ASSIGNMENT_REGEX.exec(lines[existingLineIndex]!);
			if (match) {
				lines[existingLineIndex] =
					`${match[1]!}${name}${match[3]!}${serializedValue}`;
			}
			continue;
		}

		lines.push(`${name}=${serializedValue}`);
	}

	const nextEnv = lines.join("\n");

	return {
		env: trailingNewline && nextEnv.length > 0 ? `${nextEnv}\n` : nextEnv,
		changed,
		variables: variableResults,
	};
};
