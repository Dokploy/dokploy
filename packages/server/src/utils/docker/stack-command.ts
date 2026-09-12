import { posix } from "node:path";
import { parse } from "shell-quote";

type OptionKind = "boolean" | "value" | "file";
type Options = Readonly<Record<string, OptionKind>>;

const ROOT_OPTIONS: Options = {
	"--config": "value",
	"--context": "value",
	"-c": "value",
	"--host": "value",
	"-H": "value",
	"--log-level": "value",
	"-l": "value",
	"--tlscacert": "value",
	"--tlscert": "value",
	"--tlskey": "value",
	"--debug": "boolean",
	"-D": "boolean",
	"--help": "boolean",
	"-h": "boolean",
	"--tls": "boolean",
	"--tlsverify": "boolean",
	"--version": "boolean",
	"-v": "boolean",
};
const STACK_OPTIONS: Options = { "--orchestrator": "value" };
const DEPLOY_OPTIONS: Options = {
	...STACK_OPTIONS,
	"--compose-file": "file",
	"-c": "file",
	"--resolve-image": "value",
	"--detach": "boolean",
	"-d": "boolean",
	"--quiet": "boolean",
	"-q": "boolean",
	"--prune": "boolean",
	"--with-registry-auth": "boolean",
	"--help": "boolean",
	"-h": "boolean",
};

const tokenize = (command: string): string[] => {
	const tokens: string[] = [];
	for (const entry of parse(command, {})) {
		if (typeof entry === "string") tokens.push(entry);
		else if ("op" in entry) {
			if (entry.op === "glob") tokens.push(entry.pattern);
			else if (entry.op === "&&") break;
			else return [];
		}
	}
	return tokens;
};

// Docker's short boolean flags accept =VALUE; value flags consume the rest
// of a short cluster or the next token, even when that token starts with '-'.
const consumeOption = (
	tokens: readonly string[],
	index: number,
	options: Options,
): { next: number; file?: string } | null => {
	const token = tokens[index];
	if (!token?.startsWith("-") || token === "-" || token === "--") return null;
	const long = token.startsWith("--");
	let offset = long ? 2 : 1;
	while (offset < token.length) {
		const equals = token.indexOf("=", offset);
		const name = long
			? token.slice(0, equals < 0 ? undefined : equals)
			: `-${token[offset]}`;
		const kind = options[name];
		if (!kind) return null;
		const rest = long
			? equals < 0
				? ""
				: token.slice(equals)
			: token.slice(offset + 1);
		if (kind === "boolean") {
			if (long || rest.startsWith("=")) return { next: index + 1 };
			offset += 1;
			continue;
		}
		const attached = rest.length > 0;
		const value = attached ? rest.replace(/^=/, "") : tokens[index + 1];
		if (value === undefined) return null;
		return {
			next: index + (attached ? 1 : 2),
			...(kind === "file" ? { file: value } : {}),
		};
	}
	return { next: index + 1 };
};

const commandIndex = (
	tokens: readonly string[],
	start: number,
	options: Options,
	root = false,
): number => {
	let index = start;
	while (tokens[index]?.startsWith("-")) {
		if (root && tokens[index] === "--") return index + 1;
		const option = consumeOption(tokens, index, options);
		if (!option) return -1;
		index = option.next;
	}
	return index;
};

const deploymentIndex = (tokens: readonly string[]): number => {
	const stack = commandIndex(tokens, 0, ROOT_OPTIONS, true);
	if (stack < 0 || tokens[stack] !== "stack") return -1;
	const deploy = commandIndex(tokens, stack + 1, STACK_OPTIONS);
	return deploy >= 0 && (tokens[deploy] === "deploy" || tokens[deploy] === "up")
		? deploy
		: -1;
};

export const isStackDeployCommand = (command: string): boolean =>
	deploymentIndex(tokenize(command)) >= 0;

export const STACK_COMPOSE_INPUT_ERROR =
	"Custom Stack deployments must select exactly one Dokploy-managed Compose file. Use the configured Compose path with -c; alternate files, multiple files, CSV lists, stdin, absolute paths and parent traversal are not supported.";

const isManagedPath = (selected: string, managed: string): boolean => {
	if (
		!selected ||
		selected === "-" ||
		/[,"]/.test(selected) ||
		posix.isAbsolute(selected) ||
		selected.split("/").includes("..")
	)
		return false;
	return posix.normalize(selected) === posix.normalize(managed);
};

// Only the configured document receives Dokploy's patches, domains and name
// transforms. Confining Stack input avoids reading or merging arbitrary files.
export const validateStackComposeInput = (
	command: string,
	managedPath: string,
): void => {
	const tokens = tokenize(command);
	const deploy = deploymentIndex(tokens);
	if (deploy < 0) return;
	const files: string[] = [];
	let index = deploy + 1;
	while (index < tokens.length) {
		if (tokens[index] === "--") break;
		if (!tokens[index]?.startsWith("-")) {
			index += 1;
			continue;
		}
		const option = consumeOption(tokens, index, DEPLOY_OPTIONS);
		if (!option) throw new Error(STACK_COMPOSE_INPUT_ERROR);
		if (option.file !== undefined) files.push(option.file);
		index = option.next;
	}
	if (
		files.length !== 1 ||
		!files.every((file) => isManagedPath(file, managedPath))
	)
		throw new Error(STACK_COMPOSE_INPUT_ERROR);
};
