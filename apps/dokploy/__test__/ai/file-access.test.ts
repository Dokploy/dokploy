import { EventEmitter } from "node:events";
import { openFiles } from "@dokploy/server/utils/ai/file-access";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	server: vi.fn(),
	connect: vi.fn(),
	end: vi.fn(),
	destroy: vi.fn(),
	session: {
		lstat: vi.fn(),
		realpath: vi.fn(),
		readdir: vi.fn(),
		open: vi.fn(),
		fstat: vi.fn(),
		read: vi.fn(),
		close: vi.fn(),
	},
	authError: false,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.server,
}));
vi.mock("ssh2", () => ({
	Client: class extends EventEmitter {
		connect(config: unknown) {
			mocks.connect(config);
			queueMicrotask(() =>
				mocks.authError
					? this.emit(
							"error",
							Object.assign(new Error("Authentication failed"), {
								level: "client-authentication",
							}),
						)
					: this.emit("ready"),
			);
			return this;
		}
		sftp(done: (error: null, session: typeof mocks.session) => void) {
			done(null, mocks.session);
		}
		end() {
			mocks.end();
		}
		destroy() {
			mocks.destroy();
		}
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.authError = false;
	mocks.server.mockResolvedValue({
		ipAddress: "127.0.0.1",
		port: 2222,
		username: "test",
		sshKey: { privateKey: "test-key" },
	});
	mocks.session.open.mockImplementation((_path, _mode, done) =>
		done(null, Buffer.from("handle")),
	);
	mocks.session.fstat.mockImplementation((_handle, done) =>
		done(null, { isFile: () => true }),
	);
	mocks.session.close.mockImplementation((_handle, done) => done(null));
});
describe("remote read-only file access", () => {
	it("uses configured SSH credentials and reads a bounded range across partial SFTP reads", async () => {
		const content = Buffer.from("0123456789");
		mocks.session.read.mockImplementation(
			(_handle, buffer, offset, length, position, done) => {
				const size = Math.min(length, 2, content.length - position);
				content.copy(buffer, offset, position, position + size);
				done(null, size);
			},
		);
		const files = await openFiles("server");
		expect((await files.read("/checkout/app.ts", 3, 4)).toString()).toBe(
			"3456",
		);
		expect(mocks.session.open).toHaveBeenCalledWith(
			"/checkout/app.ts",
			"r",
			expect.any(Function),
		);
		expect(mocks.session.close).toHaveBeenCalledOnce();
		expect(mocks.connect).toHaveBeenCalledWith(
			expect.objectContaining({
				host: "127.0.0.1",
				privateKey: "test-key",
				username: "test",
				port: 2222,
			}),
		);
		files.close();
		expect(mocks.end).toHaveBeenCalledOnce();
	});
	it("closes the handle on failed reads", async () => {
		mocks.session.read.mockImplementation(
			(_handle, _buffer, _offset, _length, _position, done) =>
				done(new Error("read failed")),
		);
		const files = await openFiles("server");
		await expect(files.read("/checkout/app.ts", 0, 10)).rejects.toThrow(
			"read failed",
		);
		expect(mocks.session.close).toHaveBeenCalledOnce();
		files.close();
	});
	it("refuses non-regular remote files", async () => {
		mocks.session.fstat.mockImplementation((_handle, done) =>
			done(null, { isFile: () => false }),
		);
		const files = await openFiles("server");
		await expect(files.read("/checkout/pipe", 0, 10)).rejects.toThrow(
			"regular files",
		);
		expect(mocks.session.read).not.toHaveBeenCalled();
		files.close();
	});
	it("propagates SSH authentication failures as authorization errors", async () => {
		mocks.authError = true;
		await expect(openFiles("server")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(mocks.end).toHaveBeenCalledOnce();
	});
});
