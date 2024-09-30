import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "@/server/constants";
const { APPLICATIONS_PATH } = paths();
import type { ApplicationNested } from "@dokploy/builders";
import { unzipDrop } from "@dokploy/builders";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (typeof window === "undefined") {
	const undici = require("undici");
	globalThis.File = undici.File as any;
	globalThis.FileList = undici.FileList as any;
}

const baseApp: ApplicationNested = {
	applicationId: "",
	applicationStatus: "done",
	appName: "",
	autoDeploy: true,
	serverId: "",
	branch: null,
	dockerBuildStage: "",
	buildArgs: null,
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
	projectId: "",
	publishDirectory: null,
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
};
//
vi.mock("@/server/constants", () => ({
	paths: () => ({
		APPLICATIONS_PATH: "./__test__/drop/zips/output",
	}),
	// APPLICATIONS_PATH: "./__test__/drop/zips/output",
}));

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
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/single-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, baseApp);

		const files = await fs.readdir(outputPath, { withFileTypes: true });
		expect(files.some((f) => f.name === "test.txt")).toBe(true);
	});

	it("should correctly extract a zip with a single root folder and a subfolder", async () => {
		baseApp.appName = "folderwithfile";
		// const appName = "folderwithfile";
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/folder-with-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, baseApp);

		const files = await fs.readdir(outputPath, { withFileTypes: true });
		expect(files.some((f) => f.name === "folder1.txt")).toBe(true);
	});

	it("should correctly extract a zip with multiple root folders", async () => {
		baseApp.appName = "two-folders";
		// const appName = "two-folders";
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/two-folders.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, baseApp);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "folder2")).toBe(true);
	});

	it("should correctly extract a zip with a single root with a file", async () => {
		baseApp.appName = "nested";
		// const appName = "nested";
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/nested.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, baseApp);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "folder2")).toBe(true);
		expect(files.some((f) => f.name === "folder3")).toBe(true);
	});

	it("should correctly extract a zip with a single root with a folder", async () => {
		baseApp.appName = "folder-with-sibling-file";
		// const appName = "folder-with-sibling-file";
		const outputPath = path.join(APPLICATIONS_PATH, baseApp.appName, "code");
		const zip = new AdmZip("./__test__/drop/zips/folder-with-sibling-file.zip");

		const zipBuffer = zip.toBuffer();
		const file = new File([zipBuffer], "single.zip");
		await unzipDrop(file, baseApp);

		const files = await fs.readdir(outputPath, { withFileTypes: true });

		expect(files.some((f) => f.name === "folder1")).toBe(true);
		expect(files.some((f) => f.name === "test.txt")).toBe(true);
	});
});
