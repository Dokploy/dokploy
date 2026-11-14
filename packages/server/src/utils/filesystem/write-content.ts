import { randomUUID } from "node:crypto";
import {
	appendFile,
	chmod,
	mkdir,
	open,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { ExecError, execAsyncRemote } from "../process/execAsync";

export interface WriteContentOptions {
	mode?: number;
	append?: boolean;
	label?: string;
}

// Interrupted SSH input must not truncate the destination; PIPE handles closed stderr.
const verifiedTransferCommand = (
	content: string | Buffer,
	createTemporaryFile: string,
	complete: string,
	context: string,
) =>
	`set -e; tmp=$(${createTemporaryFile}) || { echo ${quote([`Unable to create ${context} staging file`])} >&2; exit 1; }; trap 'rc=$?; rm -f "$tmp" || rc=1; exit "$rc"' 0; trap 'rm -f "$tmp"; exit 1' HUP INT TERM PIPE; cat > "$tmp"; size=$(wc -c < "$tmp"); [ "$size" -eq ${Buffer.byteLength(content)} ] || { echo ${quote([`Incomplete ${context} transfer`])} >&2; exit 1; }; ${complete}`;

export const writeContentToPath = async (
	serverId: string | null | undefined,
	path: string,
	content: string,
	options: WriteContentOptions = {},
): Promise<void> => {
	const { mode, append = false, label = "compose" } = options;
	if (
		mode !== undefined &&
		(!Number.isInteger(mode) || mode < 0 || mode > 0o7777)
	) {
		throw new RangeError("Invalid file mode");
	}

	if (serverId) {
		const temporaryPath = quote([
			join(dirname(path), `.${basename(path)}.XXXXXX`),
		]);
		const destination = quote([path]);
		let complete = `cat "$tmp" ${append ? ">>" : ">"} ${destination}`;
		if (mode !== undefined) {
			complete += `; chmod ${mode.toString(8)} ${destination}`;
		}
		const command = verifiedTransferCommand(
			content,
			`mktemp ${temporaryPath} 2>/dev/null || mktemp`,
			complete,
			label,
		);
		await execAsyncRemote(serverId, command, undefined, content);
	} else {
		if (append) {
			await appendFile(path, content, "utf8");
		} else {
			await writeFile(path, content, "utf8");
		}
		if (mode !== undefined) {
			await chmod(path, mode);
		}
	}
};

const contentCleanup = (serverId: string | null | undefined, path: string) => {
	let pending: Promise<void> | undefined;
	return (): Promise<void> => {
		pending ??= (async () => {
			try {
				if (serverId) {
					await execAsyncRemote(serverId, `rm -f ${quote([path])}`);
				} else {
					await rm(path, { force: true });
				}
			} catch {
				return;
			}
		})();
		return pending;
	};
};

export const stageContent = async (
	serverId: string | null | undefined,
	content: string | Buffer,
): Promise<{ path: string; cleanup: () => Promise<void> }> => {
	const directory = join(paths(!!serverId).BASE_PATH, ".staging");
	if (serverId) {
		const command = `set -e; umask 077; mkdir -p ${quote([directory])}; chmod 700 ${quote([directory])}; ${verifiedTransferCommand(
			content,
			`mktemp ${quote([join(directory, "content.XXXXXX")])}`,
			`chmod 600 "$tmp"; printf '%s\\n' "$tmp"; trap - 0 HUP INT TERM PIPE`,
			"content",
		)}`;
		const { stdout } = await execAsyncRemote(
			serverId,
			command,
			undefined,
			content,
		);
		const path = stdout.trim();
		return { path, cleanup: contentCleanup(serverId, path) };
	}

	await mkdir(directory, { recursive: true, mode: 0o700 });
	await chmod(directory, 0o700);
	const path = join(directory, `content.${randomUUID()}`);
	const file = await open(path, "wx", 0o600);
	const cleanup = contentCleanup(serverId, path);
	try {
		await file.writeFile(content, "utf8");
		await file.chmod(0o600);
		await file.close();
	} catch (error) {
		await file.close().catch(() => undefined);
		await cleanup();
		throw error;
	}
	return { path, cleanup };
};

export const createContentStaging = (serverId: string | null | undefined) => {
	const files: Awaited<ReturnType<typeof stageContent>>[] = [];
	return {
		stage: async (content: string): Promise<string> => {
			try {
				const file = await stageContent(serverId, content);
				files.push(file);
				return file.path;
			} catch (error) {
				// These failures precede deployment log redirection, so retain SSH stderr here.
				if (error instanceof ExecError) {
					throw new Error(
						`${error.message}${error.stderr ? `: ${error.stderr.trim()}` : ""}`,
						{ cause: error },
					);
				}
				throw error;
			}
		},
		cleanup: async (): Promise<void> => {
			await Promise.all(files.map((file) => file.cleanup()));
		},
	};
};

export type ContentStaging = ReturnType<typeof createContentStaging>;
