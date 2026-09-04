import { constants, promises as fs } from "node:fs";
import { TRPCError } from "@trpc/server";
import { Client, type SFTPWrapper, type Stats } from "ssh2";
import { findServerById } from "../../services/server";

export interface FileAccess {
	lstat(
		path: string,
	): Promise<Pick<Stats, "size" | "isSymbolicLink" | "isDirectory" | "isFile">>;
	realpath(path: string): Promise<string>;
	readdir(path: string): Promise<string[]>;
	read(path: string, start: number, length: number): Promise<Buffer>;
	close(): void;
}

export const localFiles: FileAccess = {
	lstat: (path) => fs.lstat(path),
	realpath: (path) => fs.realpath(path),
	readdir: (path) => fs.readdir(path),
	async read(path, start, length) {
		const file = await fs.open(
			path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			if (!(await file.stat()).isFile())
				throw new Error("Only regular files can be read");
			const buffer = Buffer.alloc(length);
			let offset = 0;
			while (offset < length) {
				const { bytesRead } = await file.read(
					buffer,
					offset,
					length - offset,
					start + offset,
				);
				if (!bytesRead) break;
				offset += bytesRead;
			}
			return buffer.subarray(0, offset);
		} finally {
			await file.close();
		}
	},
	close() {},
};

export async function openFiles(serverId?: string | null): Promise<FileAccess> {
	if (!serverId) return localFiles;
	const server = await findServerById(serverId);
	if (!server.sshKey?.privateKey)
		throw new Error("No SSH key available for source/log access");
	const client = new Client();
	let sftp: SFTPWrapper;
	try {
		sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
			const timer = setTimeout(() => {
				client.destroy();
				reject(new Error("Remote file connection timed out"));
			}, 15000);
			client
				.on("error", (error) => {
					clearTimeout(timer);
					reject(error);
				})
				.once("ready", () => {
					client.sftp((error, session) => {
						clearTimeout(timer);
						error ? reject(error) : resolve(session);
					});
				})
				.connect({
					host: server.ipAddress,
					port: server.port,
					username: server.username,
					privateKey: server.sshKey?.privateKey,
					readyTimeout: 15000,
				});
		});
	} catch (error) {
		client.end();
		if (
			error &&
			typeof error === "object" &&
			"level" in error &&
			error.level === "client-authentication"
		)
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "SSH authentication failed for source access",
			});
		throw error;
	}
	// Each operation has its own deadline; no idle connection survives analysis cleanup.
	const call = <T>(
		operation: (
			done: (error: Error | undefined | null, value: T) => void,
		) => void,
	) =>
		new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				client.destroy();
				reject(new Error("Remote file read timed out"));
			}, 15000);
			try {
				operation((error, value) => {
					clearTimeout(timer);
					error ? reject(error) : resolve(value);
				});
			} catch (error) {
				clearTimeout(timer);
				reject(error);
			}
		});
	return {
		lstat: (path) => call<Stats>((done) => sftp.lstat(path, done)),
		realpath: (path) => call<string>((done) => sftp.realpath(path, done)),
		readdir: async (path) =>
			(
				await call<Array<{ filename: string }>>((done) =>
					sftp.readdir(path, done),
				)
			).map((entry) => entry.filename),
		async read(path, start, length) {
			const handle = await call<Buffer>((done) => sftp.open(path, "r", done));
			try {
				const stat = await call<Stats>((done) => sftp.fstat(handle, done));
				if (!stat.isFile()) throw new Error("Only regular files can be read");
				const buffer = Buffer.alloc(length);
				let offset = 0;
				while (offset < length) {
					const count = await call<number>((done) =>
						sftp.read(
							handle,
							buffer,
							offset,
							length - offset,
							start + offset,
							(error, bytes) => done(error, bytes),
						),
					);
					if (!count) break;
					offset += count;
				}
				return buffer.subarray(0, offset);
			} finally {
				await call<void>((done) =>
					sftp.close(handle, (error) => done(error, undefined)),
				);
			}
		},
		close: () => {
			client.end();
		},
	};
}
