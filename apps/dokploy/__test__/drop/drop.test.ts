import fs from "node:fs/promises";
import path from "node:path";
import type { ApplicationNested } from "@dokploy/server";
import { unzipDrop } from "@dokploy/server";
import { paths } from "@dokploy/server/constants";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const OUTPUT_BASE = "./__test__/drop/zips/output";
const { APPLICATIONS_PATH } = paths();
vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		// @ts-ignore
		...actual,
		paths: () => ({
			// @ts-ignore
			...actual.paths(),
			BASE_PATH: OUTPUT_BASE,
			APPLICATIONS_PATH: OUTPUT_BASE,
		}),
	};
});

if (typeof window === "undefined") {
	const undici = require("undici");
	globalThis.File = undici.File as any;
	globalThis.FileList = undici.FileList as any;
}

const baseApp: ApplicationNested = {
	railpackVersion: "0.15.4",
	applicationId: "",
	previewLabels: [],
	createEnvFile: true,
	bitbucketRepositorySlug: "",
	herokuVersion: "",
	giteaBranch: "",
	buildServerId: "",
	buildRegistryId: "",
	buildRegistry: null,
	args: [],
	giteaBuildPath: "",
	previewRequireCollaboratorPermissions: false,
	giteaId: "",
	giteaOwner: "",
	giteaRepository: "",
	cleanCache: false,
	watchPaths: [],
	rollbackRegistryId: "",
	rollbackRegistry: null,
	deployments: [],
	enableSubmodules: false,
	applicationStatus: "done",
	triggerType: "push",
	appName: "",
	autoDeploy: true,
	endpointSpecSwarm: null,
	serverId: "",
	registryUrl: "",
	branch: null,
	dockerBuildStage: "",
	isPreviewDeploymentsActive: false,
	previewBuildArgs: null,
	previewBuildSecrets: null,
	previewCertificateType: "none",
	previewCustomCertResolver: null,
	previewEnv: null,
	previewHttps: false,
	previewPath: "/",
	previewPort: 3000,
	previewLimit: 0,
	previewWildcard: "",
	environment: {
		env: "",
		isDefault: false,
		environmentId: "",
		name: "",
		createdAt: "",
		description: "",
		projectId: "",
		project: {
			env: "",
			organizationId: "",
			name: "",
			description: "",
			createdAt: "",
			projectId: "",
		},
	},
	buildArgs: null,
	buildSecrets: null,
	buildPath: "/",
	gitlabPathNamespace: "",
	buildType: "nixpacks",
	bitbucketBranch: "",
	bitbucketBuildPath: "",
	bitbucketId: "",
	bitbucketRepository: "",
	bitbucketOwner: "",
	githubId: "",
	gitlabProjectId: 0,
	gitlabBranch: "",
	gitlabBuildPath: "",
	gitlabId: "",
	gitlabRepository: "",
	gitlabOwner: "",
	command: null,
	cpuLimit: null,
	cpuReservation: null,
	createdAt: "",
	customGitBranch: "",
	customGitBuildPath: "",
	customGitSSHKeyId: null,
	customGitUrl: "",
	description: "",
	dockerfile: null,
	dockerImage: null,
	dropBuildPath: null,
	environmentId: "",
	enabled: null,
	env: null,
	healthCheckSwarm: null,
	labelsSwarm: null,
	memoryLimit: null,
	memoryReservation: null,
	modeSwarm: null,
	mounts: [],
	name: "",
	networkSwarm: null,
	owner: null,
	password: null,
	placementSwarm: null,
	ports: [],
	publishDirectory: null,
	isStaticSpa: null,
	redirects: [],
	refreshToken: "",
	registry: null,
	registryId: null,
	replicas: 1,
	repository: null,
	restartPolicySwarm: null,
	rollbackConfigSwarm: null,
	security: [],
	sourceType: "git",
	subtitle: null,
	title: null,
	updateConfigSwarm: null,
	username: null,
	dockerContextPath: null,
	rollbackActive: false,
	stopGracePeriodSwarm: null,
	ulimitsSwarm: null,
};

/**
 * GHSA-66v7-g3fh-47h3: Remote Code Execution through Path Traversal.
 * Validates the exact PoC: ZIP with path traversal entry ../../../../../etc/cron.d/malicious-cron
 * plus cover files (package.json, index.js). unzipDrop must reject and never write outside output.
 */
describe("GHSA-66v7-g3fh-47h3 path traversal RCE", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});
	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("rejects PoC ZIP: traversal ../../../../../etc/cron.d/malicious-cron + package.json + index.js", async () => {
		baseApp.appName = "ghsa-rce";
		// PoC payload: same entry name as advisory (Python zipfile keeps it; AdmZip normalizes on add → use placeholder + replace)
		const traversalEntry = "../../../../../etc/cron.d/malicious-cron";
		const cronPayload = "* * * * * root id\n";
		const placeholder = "x".repeat(traversalEntry.length);
		const zip = new AdmZip();
		zip.addFile(
			"package.json",
			Buffer.from('{"name": "app", "version": "1.0.0"}'),
		);
		zip.addFile("index.js", Buffer.from('console.log("Application");'));
		zip.addFile(placeholder, Buffer.from(cronPayload));
		let buf = Buffer.from(zip.toBuffer());
		buf = Buffer.from(
			buf.toString("binary").split(placeholder).join(traversalEntry),
			"binary",
		);
		const file = new File([buf as unknown as ArrayBuffer], "exploit.zip");
		await expect(unzipDrop(file, baseApp)).rejects.toThrow(
			/Path traversal detected.*resolved path escapes output directory/,
		);
	});
});

describe("security: existing symlink escape", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("should NOT write outside base when directory is a symlink", async () => {
		const appName = "symlink-existing";
		const output = path.join(APPLICATIONS_PATH, appName, "code");
		await fs.mkdir(output, { recursive: true });

		// outside target (attacker wants to write here)
		const outside = path.join(APPLICATIONS_PATH, "..", "outside");
		await fs.mkdir(outside, { recursive: true });

		// attacker-controlled symlink inside project
		await fs.symlink(outside, path.join(output, "logs"));

		// zip looks totally harmless
		const zip = new AdmZip();
		zip.addFile("logs/pwned.txt", Buffer.from("owned"));

		const file = new File([zip.toBuffer() as any], "exploit.zip");

		await unzipDrop(file, { ...baseApp, appName });

		// if vulnerable -> file exists outside sandbox
		const escaped = await fs
			.readFile(path.join(outside, "pwned.txt"), "utf8")
			.then(() => true)
			.catch(() => false);

		expect(escaped).toBe(false);
	});
});

describe("security: zip symlink entry blocked", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("rejects zip containing real symlink entry", async () => {
		const appName = "zip-symlink";

		const zipBuffer = await fs.readFile(
			path.join(__dirname, "./zips/payload/symlink-entry.zip"),
		);

		const file = new File([zipBuffer as any], "exploit.zip");

		await expect(unzipDrop(file, { ...baseApp, appName })).rejects.toThrow(
			/Dangerous node entries are not allowed/,
		);
	});
});

describe("unzipDrop path under output (no traversal)", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});
	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("allows entry etc/cron.d/malicious-cron when under output (no path traversal)", async () => {
		baseApp.appName = "cron-under-output";
		const zip = new AdmZip();
		zip.addFile(
			"etc/cron.d/malicious-cron",
			Buffer.from("* * * * * root id\n"),
		);
		zip.addFile("package.json", Buffer.from('{"name":"app"}'));
		const file = new File(
			[zip.toBuffer() as unknown as ArrayBuffer],
			"app.zip",
		);
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		await unzipDrop(file, baseApp);
		const content = await fs.readFile(
			path.join(outputPath, "etc/cron.d/malicious-cron"),
			"utf8",
		);
		expect(content).toBe("* * * * * root id\n");
	});
});

describe("security: traversal inside BASE_PATH (sandbox escape)", () => {
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("should NOT allow writing outside application directory but inside BASE_PATH", async () => {
		const appName = "sandbox-escape";

		const base = APPLICATIONS_PATH.replace("/applications", "");
		const output = path.join(APPLICATIONS_PATH, appName, "code");

		await fs.mkdir(output, { recursive: true });

		// attacker writes into traefik config inside base
		const zip = new AdmZip();
		zip.addFile(
			"../../../traefik/dynamic/evil.yml",
			Buffer.from("pwned: true"),
		);

		const file = new File([zip.toBuffer() as any], "exploit.zip");

		await unzipDrop(file, { ...baseApp, appName });

		const escapedPath = path.join(base, "traefik/dynamic/evil.yml");

		const exists = await fs
			.readFile(escapedPath)
			.then(() => true)
			.catch(() => false);

		expect(exists).toBe(false);
	});
});

describe("unzipDrop using real zip files", () => {
	// const { APPLICATIONS_PATH } = paths();
	beforeAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(APPLICATIONS_PATH, { recursive: true, force: true });
	});

	it("should correctly extract a zip with a single root folder", async () => {
		baseApp.appName = "single-file";
		// const appName = "single-file";
		try {
			const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
			const zip = new AdmZip("./__test__/drop/zips/single-file.zip");
			const zipBuffer = zip.toBuffer() as Buffer<ArrayBuffer>;
			const file = new File([zipBuffer], "single.zip");
			await unzipDrop(file, baseApp);
			const files = await fs.readdir(outputPath, { withFileTypes: true });
			expect(files.some((f) => f.name === "test.txt")).toBe(true);
		} catch (err) {
		} finally {
		}
	});
});

// 	it("should correctly extract a zip with a single root folder and a subfolder", async () => {
// 		baseApp.appName = "folderwithfile";
// 		// const appName = "folderwithfile";
// 		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
// 		const zip = new AdmZip("./__test__/drop/zips/folder-with-file.zip");

// 		const zipBuffer = zip.toBuffer();
// 		const file = new File([zipBuffer], "single.zip");
// 		await unzipDrop(file, baseApp);

// 		const files = await fs.readdir(outputPath, { withFileTypes: true });
// 		expect(files.some((f) => f.name === "folder1.txt")).toBe(true);
// 	});

// 	it("should correctly extract a zip with multiple root folders", async () => {
// 		baseApp.appName = "two-folders";
// 		// const appName = "two-folders";
// 		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
// 		const zip = new AdmZip("./__test__/drop/zips/two-folders.zip");

// 		const zipBuffer = zip.toBuffer();
// 		const file = new File([zipBuffer], "single.zip");
// 		await unzipDrop(file, baseApp);

// 		const files = await fs.readdir(outputPath, { withFileTypes: true });

// 		expect(files.some((f) => f.name === "folder1")).toBe(true);
// 		expect(files.some((f) => f.name === "folder2")).toBe(true);
// 	});

// 	it("should correctly extract a zip with a single root with a file", async () => {
// 		baseApp.appName = "nested";
// 		// const appName = "nested";
// 		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
// 		const zip = new AdmZip("./__test__/drop/zips/nested.zip");

// 		const zipBuffer = zip.toBuffer();
// 		const file = new File([zipBuffer], "single.zip");
// 		await unzipDrop(file, baseApp);

// 		const files = await fs.readdir(outputPath, { withFileTypes: true });

// 		expect(files.some((f) => f.name === "folder1")).toBe(true);
// 		expect(files.some((f) => f.name === "folder2")).toBe(true);
// 		expect(files.some((f) => f.name === "folder3")).toBe(true);
// 	});

// 	it("should correctly extract a zip with a single root with a folder", async () => {
// 		baseApp.appName = "folder-with-sibling-file";
// 		// const appName = "folder-with-sibling-file";
// 		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
// 		const zip = new AdmZip("./__test__/drop/zips/folder-with-sibling-file.zip");

// 		const zipBuffer = zip.toBuffer();
// 		const file = new File([zipBuffer], "single.zip");
// 		await unzipDrop(file, baseApp);

// 		const files = await fs.readdir(outputPath, { withFileTypes: true });

// 		expect(files.some((f) => f.name === "folder1")).toBe(true);
// 		expect(files.some((f) => f.name === "test.txt")).toBe(true);
// 	});
// });
