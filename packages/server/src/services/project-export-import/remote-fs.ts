import { dirname, join } from "node:path";
import type { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { paths } from "@dokploy/server/constants";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import {
	openProcessStream,
	type ProcessStream,
	pipeBetweenServers,
} from "@dokploy/server/utils/process/remoteStream";

export type Location = { serverId: string | null; path: string };

export const at = (base: Location, ...segments: string[]): Location => ({
	serverId: base.serverId,
	path: join(base.path, ...segments),
});

export const transferRoot = (
	jobId: string,
	serverId: string | null,
	pathsFn: typeof paths = paths,
): Location => ({
	serverId,
	path: join(pathsFn(serverId !== null).PROJECT_EXPORT_IMPORT_PATH, jobId),
});

export const prepareRoot = (root: Location): Promise<void> => mkdirp(root);

export const escapeShellArg = (value: string): string =>
	`'${value.replace(/'/g, "'\\''")}'`;

export const run = (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> =>
	serverId
		? execAsyncRemote(serverId, command)
		: execAsync(command, { shell: "/bin/bash" });

export const mkdirp = async (loc: Location): Promise<void> => {
	await run(loc.serverId, `mkdir -p ${escapeShellArg(loc.path)}`);
};

export const remove = async (loc: Location): Promise<void> => {
	await run(loc.serverId, `rm -rf ${escapeShellArg(loc.path)}`);
};

export const exists = async (loc: Location): Promise<boolean> => {
	const { stdout } = await run(
		loc.serverId,
		`test -e ${escapeShellArg(loc.path)} && echo yes || echo no`,
	);
	return stdout.trim() === "yes";
};

export const fileSize = async (loc: Location): Promise<number> => {
	const { stdout } = await run(
		loc.serverId,
		`wc -c < ${escapeShellArg(loc.path)}`,
	);
	return Number.parseInt(stdout.trim(), 10) || 0;
};

export const readFile = async (loc: Location): Promise<Buffer> => {
	const proc = await openProcessStream(
		loc.serverId,
		`cat ${escapeShellArg(loc.path)}`,
	);
	const chunks: Buffer[] = [];
	const errors: string[] = [];
	proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
	proc.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
	proc.stdin.end();
	const code = await proc.exit;
	if (code !== 0) {
		throw new Error(
			`Reading ${loc.path} failed with code ${code}: ${errors.join("").trim()}`,
		);
	}
	return Buffer.concat(chunks);
};

export const writeFile = async (
	loc: Location,
	content: string | Buffer,
): Promise<void> => {
	const proc = await openProcessStream(
		loc.serverId,
		`mkdir -p ${escapeShellArg(dirname(loc.path))} && cat > ${escapeShellArg(loc.path)}`,
	);
	const errors: string[] = [];
	proc.stdout.resume();
	proc.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
	proc.stdin.on("error", () => {});
	proc.stdin.end(content);
	const code = await proc.exit;
	if (code !== 0) {
		throw new Error(
			`Writing ${loc.path} failed with code ${code}: ${errors.join("").trim()}`,
		);
	}
};

const sameServer = (a: Location, b: Location) => a.serverId === b.serverId;

export const runToFile = async (
	serverId: string | null,
	command: string,
	to: Location,
): Promise<void> => {
	try {
		if (serverId === to.serverId) {
			await run(
				serverId,
				`mkdir -p ${escapeShellArg(dirname(to.path))} && { ${command}; } > ${escapeShellArg(to.path)}`,
			);
			return;
		}
		await pipeBetweenServers({
			source: { serverId, command },
			target: {
				serverId: to.serverId,
				command: `mkdir -p ${escapeShellArg(dirname(to.path))} && cat > ${escapeShellArg(to.path)}`,
			},
		});
	} catch (error) {
		await remove(to).catch(() => {});
		throw error;
	}
};

export const copyFile = async (from: Location, to: Location): Promise<void> => {
	if (sameServer(from, to)) {
		await run(
			from.serverId,
			`mkdir -p ${escapeShellArg(dirname(to.path))} && cp ${escapeShellArg(from.path)} ${escapeShellArg(to.path)}`,
		);
		return;
	}
	await runToFile(from.serverId, `cat ${escapeShellArg(from.path)}`, to);
};

export const copyDir = async (
	from: Location,
	to: Location,
	opts: { exclude?: string[] } = {},
): Promise<void> => {
	const excludeFlags = (opts.exclude ?? [])
		.map((pattern) => `--exclude=${escapeShellArg(pattern)}`)
		.join(" ");
	const pack = `tar -czf - ${excludeFlags} -C ${escapeShellArg(from.path)} .`;
	const unpack = `mkdir -p ${escapeShellArg(to.path)} && tar -xzf - -C ${escapeShellArg(to.path)}`;
	if (sameServer(from, to)) {
		await run(
			from.serverId,
			`mkdir -p ${escapeShellArg(to.path)} && ${pack} | tar -xzf - -C ${escapeShellArg(to.path)}`,
		);
		return;
	}
	await pipeBetweenServers({
		source: { serverId: from.serverId, command: pack },
		target: { serverId: to.serverId, command: unpack },
	});
};

export const pipeThrough = async (
	from: Location,
	transform: Transform,
	to: Location,
): Promise<void> => {
	const source = await openProcessStream(
		from.serverId,
		`cat ${escapeShellArg(from.path)}`,
	);
	const target = await openProcessStream(
		to.serverId,
		`mkdir -p ${escapeShellArg(dirname(to.path))} && cat > ${escapeShellArg(to.path)}`,
	);
	const errors: string[] = [];
	source.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
	target.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
	target.stdout.resume();
	source.stdin.end();
	try {
		await pipeline(source.stdout, transform, target.stdin);
		const [sourceCode, targetCode] = await Promise.all([
			source.exit,
			target.exit,
		]);
		if (sourceCode !== 0 || targetCode !== 0) {
			throw new Error(
				`Transfer failed (exit ${sourceCode}/${targetCode}): ${errors.join("").trim()}`,
			);
		}
	} catch (error) {
		source.close();
		target.close();
		await remove(to).catch(() => {});
		throw error;
	}
};

export const streamProcessToResponse = (
	proc: ProcessStream,
	res: NodeJS.WritableStream & {
		on: (event: string, listener: (...args: unknown[]) => void) => unknown;
		destroy: () => void;
		writableFinished?: boolean;
	},
): Promise<void> => {
	proc.stdin.end();
	proc.stderr.resume();
	return new Promise<void>((resolve, reject) => {
		let finished = false;
		proc.stdout.on("error", (error: Error) => {
			res.destroy();
			reject(error);
		});
		res.on("finish", () => {
			finished = true;
			resolve();
		});
		res.on("close", () => {
			if (!finished) {
				proc.close();
				reject(new Error("Connection closed before the download finished"));
			}
		});
		proc.stdout.pipe(res);
	}).then(async () => {
		if ((await proc.exit) !== 0) {
			throw new Error("The bundle stream ended with an error");
		}
	});
};

export const safeErrorMessage = (error: unknown): string => {
	if (error instanceof ExecError) {
		const parts = [
			error.exitCode !== undefined ? `exit code ${error.exitCode}` : null,
			error.stderr?.trim() || null,
		].filter(Boolean);
		return parts.length > 0 ? parts.join(": ") : "Command failed";
	}
	return error instanceof Error ? error.message : String(error);
};
