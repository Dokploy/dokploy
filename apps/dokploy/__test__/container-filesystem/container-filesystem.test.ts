import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getContainerMock, getRemoteDockerMock, listContainersMock } =
	vi.hoisted(() => ({
		getContainerMock: vi.fn(),
		getRemoteDockerMock: vi.fn(),
		listContainersMock: vi.fn(),
	}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const {
	ContainerFilesystemError,
	getContainerFileDownload,
	getApplicationFilesystemContainer,
	getApplicationFilesystemContainers,
	listContainerDirectory,
	normalizeContainerPath,
	pipeContainerFileArchive,
	readContainerFile,
} = await import("@dokploy/server/services/container-filesystem");

const APPLICATION_CONTAINER_ID = "a".repeat(64);
const OTHER_CONTAINER_ID = "b".repeat(64);
const containerHandle = { getArchive: vi.fn() };

const dockerContainer = (overrides: Record<string, unknown> = {}) => ({
	Id: APPLICATION_CONTAINER_ID,
	Names: ["/test-app.1.xxxxxxxxx"],
	Image: "example:latest",
	Labels: { "com.docker.swarm.service.name": "test-app" },
	State: "running",
	Status: "Up 1 minute",
	...overrides,
});

type DockerArchiveStat = {
	mode?: number;
	size?: number;
	linkTarget?: string;
};

type DockerArchiveResponse = Readable & {
	headers?: Record<string, string>;
};

const createArchiveResponse = (
	stat?: DockerArchiveStat,
): DockerArchiveResponse => {
	const response = Readable.from([]) as DockerArchiveResponse;
	if (stat) {
		response.headers = {
			"x-docker-container-path-stat": Buffer.from(
				JSON.stringify(stat),
			).toString("base64"),
		};
	}
	return response;
};

const writeTarString = (
	header: Buffer,
	offset: number,
	length: number,
	value: string,
) => {
	header.write(value.slice(0, length), offset, length, "utf8");
};

const writeTarOctal = (
	header: Buffer,
	offset: number,
	length: number,
	value: number,
) => {
	header.write(
		`${value.toString(8).padStart(length - 1, "0")}\0`,
		offset,
		length,
		"ascii",
	);
};

const createTarEntry = (
	name: string,
	type: "directory" | "file",
	content: Buffer<ArrayBufferLike> = Buffer.alloc(0),
) => {
	const header = Buffer.alloc(512);
	writeTarString(header, 0, 100, name);
	writeTarOctal(header, 100, 8, type === "directory" ? 0o755 : 0o644);
	writeTarOctal(header, 108, 8, 0);
	writeTarOctal(header, 116, 8, 0);
	writeTarOctal(header, 124, 12, content.length);
	writeTarOctal(header, 136, 12, 0);
	header.fill(0x20, 148, 156);
	writeTarString(header, 156, 1, type === "directory" ? "5" : "0");
	writeTarString(header, 257, 6, "ustar\0");
	writeTarString(header, 263, 2, "00");
	const checksum = header.reduce((total, byte) => total + byte, 0);
	writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);

	const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
	return Buffer.concat([header, content, padding]);
};

const createDirectoryArchive = (): DockerArchiveResponse => {
	const archive = Readable.from([
		Buffer.concat([
			createTarEntry("data/", "directory"),
			createTarEntry("data/hello.txt", "file", Buffer.from("hello")),
			createTarEntry("data/nested/", "directory"),
			createTarEntry("data/nested/config.json", "file", Buffer.from("{}")),
			Buffer.alloc(1024),
		]),
	]) as DockerArchiveResponse;
	archive.headers = {
		"x-docker-container-path-stat": Buffer.from(
			JSON.stringify({ mode: 0x80000000, size: 0 }),
		).toString("base64"),
	};
	return archive;
};

const createRootDirectoryArchive = (): DockerArchiveResponse => {
	const archive = Readable.from([
		Buffer.concat([
			createTarEntry("/", "directory"),
			createTarEntry("/.dockerenv", "file"),
			createTarEntry("/app/", "directory"),
			createTarEntry("/app/data/", "directory"),
			Buffer.alloc(1024),
		]),
	]) as DockerArchiveResponse;
	archive.headers = {
		"x-docker-container-path-stat": Buffer.from(
			JSON.stringify({ mode: 0x80000000, size: 0 }),
		).toString("base64"),
	};
	return archive;
};

const createFileArchive = (
	content: Buffer<ArrayBufferLike>,
): DockerArchiveResponse => {
	const archive = Readable.from([
		Buffer.concat([
			createTarEntry("hello.txt", "file", content),
			Buffer.alloc(1024),
		]),
	]) as DockerArchiveResponse;
	archive.headers = {
		"x-docker-container-path-stat": Buffer.from(
			JSON.stringify({ mode: 0o644, size: content.length }),
		).toString("base64"),
	};
	return archive;
};

const createInfoArchiveContainer = (
	pathStats: DockerArchiveStat[],
	archive: Readable = createArchiveResponse(),
) => {
	const getArchiveMock = vi.fn().mockResolvedValue(archive);
	const headResponses: Array<{
		response: DockerArchiveResponse;
		resumeSpy: ReturnType<typeof vi.spyOn>;
	}> = [];
	const infoArchiveMock = vi.fn().mockImplementation(async () => {
		const response = createArchiveResponse(pathStats.shift());
		headResponses.push({
			response,
			resumeSpy: vi.spyOn(response, "resume"),
		});
		return response;
	});

	return {
		container: {
			getArchive: getArchiveMock,
			infoArchive: infoArchiveMock,
		} as unknown as Parameters<typeof listContainerDirectory>[0],
		getArchiveMock,
		headResponses,
		infoArchiveMock,
	};
};

beforeEach(() => {
	vi.clearAllMocks();
	getRemoteDockerMock.mockResolvedValue({
		getContainer: getContainerMock,
		listContainers: listContainersMock,
	});
	getContainerMock.mockReturnValue(containerHandle);
	listContainersMock.mockResolvedValue([]);
});

describe("normalizeContainerPath", () => {
	it("normalizes an absolute POSIX path while preserving the container root", () => {
		expect(normalizeContainerPath("/")).toBe("/");
		expect(normalizeContainerPath("/var//logs/./today")).toBe(
			"/var/logs/today",
		);
	});

	it.each([
		["an empty path", "", "INVALID_PATH"],
		["a relative path", "var/log/app.log", "INVALID_PATH"],
		["a Windows separator", "/var\\log\\app.log", "INVALID_PATH"],
		["a traversal segment", "/var/log/../secrets", "INVALID_PATH"],
		["a control character", "/var/log/\0app.log", "INVALID_PATH"],
		["the proc filesystem", "/proc/1/environ", "RESTRICTED_PATH"],
		["a normalized proc path", "/proc/./1/environ", "RESTRICTED_PATH"],
		["the secret mount", "/run/secrets/database-password", "RESTRICTED_PATH"],
	])("rejects %s", (_description, path, code) => {
		expect(() => normalizeContainerPath(path)).toThrow(
			ContainerFilesystemError,
		);
		try {
			normalizeContainerPath(path);
		} catch (error) {
			expect(error).toMatchObject({ code });
		}
	});

	it("rejects paths beyond the bounded input size", () => {
		const tooLongPath = `/${"a".repeat(4096)}`;
		expect(() => normalizeContainerPath(tooLongPath)).toThrow(
			ContainerFilesystemError,
		);
	});

	it("rejects paths with too many nested components", () => {
		const tooDeepPath = `/${Array.from({ length: 129 }, () => "a").join("/")}`;
		expect(() => normalizeContainerPath(tooDeepPath)).toThrow(
			ContainerFilesystemError,
		);
	});
});

describe("application container ownership", () => {
	it("lists only the application's running Swarm containers and maps their safe display data", async () => {
		listContainersMock.mockResolvedValue([
			dockerContainer({
				Id: OTHER_CONTAINER_ID,
				Names: ["/zeta.1.xxxxxxxxx"],
			}),
			dockerContainer({ Names: ["/alpha.1.xxxxxxxxx"] }),
		]);

		await expect(
			getApplicationFilesystemContainers("test-app", "server-1"),
		).resolves.toEqual([
			{
				containerId: APPLICATION_CONTAINER_ID,
				image: "example:latest",
				name: "alpha.1.xxxxxxxxx",
				state: "running",
				status: "Up 1 minute",
			},
			{
				containerId: OTHER_CONTAINER_ID,
				image: "example:latest",
				name: "zeta.1.xxxxxxxxx",
				state: "running",
				status: "Up 1 minute",
			},
		]);

		expect(getRemoteDockerMock).toHaveBeenCalledWith("server-1");
		expect(listContainersMock).toHaveBeenCalledWith({
			filters: JSON.stringify({
				status: ["running"],
				label: ["com.docker.swarm.service.name=test-app"],
			}),
		});
	});

	it("does not trust a Docker list response with a mismatched service label", async () => {
		listContainersMock.mockResolvedValue([
			dockerContainer(),
			dockerContainer({
				Id: OTHER_CONTAINER_ID,
				Labels: { "com.docker.swarm.service.name": "another-app" },
			}),
		]);

		await expect(
			getApplicationFilesystemContainers("test-app", "server-1"),
		).resolves.toMatchObject([
			{
				containerId: APPLICATION_CONTAINER_ID,
			},
		]);
	});

	it("resolves a container handle only after exact membership in the application's running set", async () => {
		listContainersMock.mockResolvedValue([dockerContainer()]);

		await expect(
			getApplicationFilesystemContainer(
				"test-app",
				APPLICATION_CONTAINER_ID,
				"server-1",
			),
		).resolves.toEqual({
			container: containerHandle,
			containerInfo: {
				containerId: APPLICATION_CONTAINER_ID,
				image: "example:latest",
				name: "test-app.1.xxxxxxxxx",
				state: "running",
				status: "Up 1 minute",
			},
		});

		expect(getContainerMock).toHaveBeenCalledExactlyOnceWith(
			APPLICATION_CONTAINER_ID,
		);
	});

	it("rejects a valid-looking container ID not owned by the application", async () => {
		listContainersMock.mockResolvedValue([dockerContainer()]);

		await expect(
			getApplicationFilesystemContainer(
				"test-app",
				OTHER_CONTAINER_ID,
				"server-1",
			),
		).rejects.toMatchObject({ code: "CONTAINER_NOT_FOUND" });

		expect(getRemoteDockerMock).toHaveBeenCalledWith("server-1");
		expect(listContainersMock).toHaveBeenCalledOnce();
		expect(getContainerMock).not.toHaveBeenCalled();
	});

	it("rejects a short ID prefix rather than letting Docker resolve it ambiguously", async () => {
		listContainersMock.mockResolvedValue([dockerContainer()]);

		await expect(
			getApplicationFilesystemContainer(
				"test-app",
				APPLICATION_CONTAINER_ID.slice(0, 12),
				"server-1",
			),
		).rejects.toMatchObject({ code: "CONTAINER_NOT_FOUND" });

		expect(getContainerMock).not.toHaveBeenCalled();
	});

	it("rejects malformed IDs before opening a Docker connection", async () => {
		await expect(
			getApplicationFilesystemContainer(
				"test-app",
				"not-a-container-id; rm -rf /",
				"server-1",
			),
		).rejects.toMatchObject({ code: "CONTAINER_NOT_FOUND" });

		expect(getRemoteDockerMock).not.toHaveBeenCalled();
	});
});

describe("archive access safeguards", () => {
	it("lists direct children from Docker root archives with absolute entry names", async () => {
		const { container } = createInfoArchiveContainer(
			[{ mode: 0x80000000, size: 0 }],
			createRootDirectoryArchive(),
		);

		const result = await listContainerDirectory(container, "/");

		expect(result.path).toBe("/");
		expect(result.entries).toEqual([
			expect.objectContaining({
				name: ".dockerenv",
				path: "/.dockerenv",
				type: "file",
			}),
			expect.objectContaining({
				name: "app",
				path: "/app",
				type: "directory",
			}),
		]);
	});

	it("lists direct children from Docker archives rooted at the requested directory basename", async () => {
		const archive = createDirectoryArchive();
		const { container } = createInfoArchiveContainer(
			[
				{ mode: 0x80000000, size: 0 },
				{ mode: 0x80000000, size: 0 },
			],
			archive,
		);

		const result = await listContainerDirectory(container, "/app/data");

		expect(result.path).toBe("/app/data");
		expect(result.entries).toEqual([
			expect.objectContaining({
				name: "hello.txt",
				path: "/app/data/hello.txt",
				type: "file",
				size: 5,
				mode: "644",
			}),
			expect.objectContaining({
				name: "nested",
				path: "/app/data/nested",
				type: "directory",
				size: 0,
				mode: "755",
			}),
		]);
	});

	it("inspects every path component before reading the requested archive", async () => {
		const archive = createArchiveResponse({ mode: 0o644, size: 10 });
		const { container, getArchiveMock, headResponses, infoArchiveMock } =
			createInfoArchiveContainer(
				[
					{ mode: 0x80000000, size: 0 },
					{ mode: 0x80000000, size: 0 },
					{ mode: 0o644, size: 10 },
				],
				archive,
			);

		await expect(
			getContainerFileDownload(container, "/data/current/private.txt"),
		).resolves.toMatchObject({
			fileName: "private.txt",
			path: "/data/current/private.txt",
		});

		expect(
			infoArchiveMock.mock.calls.map(
				([input]) => (input as { path: string }).path,
			),
		).toEqual(["/data", "/data/current", "/data/current/private.txt"]);
		const abortSignals = infoArchiveMock.mock.calls.map(
			([input]) => (input as { abortSignal?: AbortSignal }).abortSignal,
		);
		expect(abortSignals.every((signal) => signal === abortSignals[0])).toBe(
			true,
		);
		expect(headResponses).toHaveLength(3);
		for (const { resumeSpy } of headResponses) {
			expect(resumeSpy).toHaveBeenCalledOnce();
		}
		expect(getArchiveMock).toHaveBeenCalledWith(
			expect.objectContaining({ path: "/data/current/private.txt" }),
		);
	});

	it("fails closed when an intermediate path is marked as a Go-mode symlink", async () => {
		const { container, getArchiveMock, headResponses, infoArchiveMock } =
			createInfoArchiveContainer([
				{ mode: 0x80000000, size: 0 },
				{ mode: 0x08000000, size: 0 },
			]);

		await expect(
			listContainerDirectory(container, "/data/current/private"),
		).rejects.toMatchObject({ code: "SYMLINK_NOT_SUPPORTED" });

		expect(
			infoArchiveMock.mock.calls.map(
				([input]) => (input as { path: string }).path,
			),
		).toEqual(["/data", "/data/current"]);
		expect(headResponses).toHaveLength(2);
		for (const { resumeSpy } of headResponses) {
			expect(resumeSpy).toHaveBeenCalledOnce();
		}
		expect(getArchiveMock).not.toHaveBeenCalled();
	});

	it("fails closed when an intermediate path exposes a link target", async () => {
		const { container, getArchiveMock, infoArchiveMock } =
			createInfoArchiveContainer([
				{ mode: 0x80000000, size: 0 },
				{ mode: 0o777, size: 0, linkTarget: "/host/secrets" },
			]);

		await expect(
			readContainerFile(container, "/data/current/private.txt"),
		).rejects.toMatchObject({ code: "SYMLINK_NOT_SUPPORTED" });

		expect(
			infoArchiveMock.mock.calls.map(
				([input]) => (input as { path: string }).path,
			),
		).toEqual(["/data", "/data/current"]);
		expect(getArchiveMock).not.toHaveBeenCalled();
	});

	it.each([
		["missing", createArchiveResponse()],
		[
			"invalid",
			Object.assign(createArchiveResponse(), {
				headers: { "x-docker-container-path-stat": "not-valid-base64-json" },
			}),
		],
	])(
		"rejects %s GET archive metadata after safe HEAD checks",
		async (_kind, archive) => {
			const { container, getArchiveMock, infoArchiveMock } =
				createInfoArchiveContainer(
					[
						{ mode: 0x80000000, size: 0 },
						{ mode: 0o644, size: 10 },
					],
					archive,
				);

			await expect(
				readContainerFile(container, "/data/private.txt"),
			).rejects.toMatchObject({ code: "ARCHIVE_UNAVAILABLE" });

			expect(infoArchiveMock).toHaveBeenCalledTimes(2);
			expect(getArchiveMock).toHaveBeenCalledWith(
				expect.objectContaining({ path: "/data/private.txt" }),
			);
		},
	);

	it("rejects a non-regular filesystem object before opening an archive", async () => {
		const archive = createArchiveResponse({ mode: 0x02000000, size: 0 });
		const { container, getArchiveMock, infoArchiveMock } =
			createInfoArchiveContainer(
				[
					{ mode: 0x80000000, size: 0 },
					{ mode: 0x02000000, size: 0 },
				],
				archive,
			);

		await expect(
			getContainerFileDownload(container, "/data/socket"),
		).rejects.toMatchObject({ code: "NOT_A_FILE" });

		expect(infoArchiveMock).toHaveBeenCalledTimes(2);
		expect(getArchiveMock).not.toHaveBeenCalled();
	});

	it("does not forward the chunk that exceeds the download size cap", async () => {
		const chunks: Buffer[] = [];
		const destination = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		});

		await expect(
			pipeContainerFileArchive(
				createFileArchive(Buffer.from("hello")),
				destination,
				4,
			),
		).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

		expect(Buffer.concat(chunks)).toHaveLength(0);
	});
});
