
import { existsSync } from "node:fs";
import path from "node:path";
import type { ApplicationNested } from "@dokploy/server";
import { paths } from "@dokploy/server/constants";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_TEST_TIMEOUT = 180000; // 3 minutes

// Mock constants to avoid load error
vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({
		LOGS_PATH: "/tmp/dokploy-test-real/logs",
		APPLICATIONS_PATH: "/tmp/dokploy-test-real/applications",
		PATCH_REPOS_PATH: "/tmp/dokploy-test-real/patch-repos",
	}),
	IS_CLOUD: false,
	docker: {},
}));

// Mock ONLY database and notifications
vi.mock("@dokploy/server/db", () => {
	const createChainableMock = (): any => {
		const chain: any = {
			set: vi.fn(() => chain),
			where: vi.fn(() => chain),
			returning: vi.fn().mockResolvedValue([{}]),
		};
		return chain;
	};

	return {
		db: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn(() => createChainableMock()),
			delete: vi.fn(),
			query: {
				applications: {
					findFirst: vi.fn(),
				},
			},
		},
	};
});

vi.mock("@dokploy/server/services/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/application")
	>("@dokploy/server/services/application");
	return {
		...actual,
		findApplicationById: vi.fn(),
		updateApplicationStatus: vi.fn(),
	};
});

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn().mockResolvedValue("http://localhost:3000"),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
	updateDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/build-success", () => ({
	sendBuildSuccessNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/build-error", () => ({
	sendBuildErrorNotifications: vi.fn(),
}));

vi.mock("@dokploy/server/services/rollbacks", () => ({
	createRollback: vi.fn(),
}));

vi.mock("@dokploy/server/services/patch", async (importOriginal) => {
	const actual = await importOriginal<
		typeof import("@dokploy/server/services/patch")
	>();
	return {
		...actual,
		findPatchesByApplicationId: vi.fn().mockResolvedValue([]),
	};
});

// NOT mocked (executed for real):
// - execAsync
// - cloneGitRepository
// - getBuildCommand
// - mechanizeDockerContainer (requires Docker Swarm)

import { db } from "@dokploy/server/db";
import * as adminService from "@dokploy/server/services/admin";
import * as applicationService from "@dokploy/server/services/application";
import { deployApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as patchService from "@dokploy/server/services/patch";
import { generatePatch } from "@dokploy/server/services/patch";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const createMockApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		applicationId: "test-app-id",
		name: "Real Test App",
		appName: `real-test-${Date.now()}`,
		sourceType: "git" as const,
		customGitUrl: "https://github.com/Dokploy/examples.git",
		customGitBranch: "main",
		customGitSSHKeyId: null,
		customGitBuildPath: "/astro",
		buildType: "nixpacks" as const,
		env: "NODE_ENV=production",
		serverId: null,
		rollbackActive: false,
		enableSubmodules: false,
		environmentId: "env-id",
		environment: {
			projectId: "project-id",
			env: "",
			name: "production",
			project: {
				name: "Test Project",
				organizationId: "org-id",
				env: "",
			},
		},
		domains: [],
		mounts: [],
		security: [],
		redirects: [],
		ports: [],
		registry: null,
		...overrides,
	}) as ApplicationNested;

const createMockDeployment = async (appName: string) => {
	const { LOGS_PATH } = paths(false); // false = local, no remote server
	const formattedDateTime = format(new Date(), "yyyy-MM-dd:HH:mm:ss");
	const fileName = `${appName}-${formattedDateTime}.log`;
	const logFilePath = path.join(LOGS_PATH, appName, fileName);

	// Actually create the log directory
	await execAsync(`mkdir -p ${path.dirname(logFilePath)}`);
	await execAsync(`echo "Initializing deployment" > ${logFilePath}`);

	return {
		deploymentId: "deployment-id",
		logPath: logFilePath,
	};
};

async function cleanupDocker(appName: string) {
	try {
		await execAsync(`docker stop ${appName} 2>/dev/null || true`);
		await execAsync(`docker rm ${appName} 2>/dev/null || true`);
		await execAsync(`docker rmi ${appName} 2>/dev/null || true`);
	} catch (error) {
		console.log("Docker cleanup completed");
	}
}

async function cleanupFiles(appName: string) {
	try {
		const { LOGS_PATH, APPLICATIONS_PATH } = paths(false);

		// Clean cloned code directories
		const appPath = path.join(APPLICATIONS_PATH, appName);
		await execAsync(`rm -rf ${appPath} 2>/dev/null || true`);

		// Clean logs for appName - removes entire folder
		const logPath = path.join(LOGS_PATH, appName);
		await execAsync(`rm -rf ${logPath} 2>/dev/null || true`);

		console.log(`✅ Cleaned up files and logs for ${appName}`);
	} catch (error) {
		console.error(`⚠️ Error during cleanup for ${appName}:`, error);
	}
}

describe(
	"deployApplication - REAL Execution Tests",
	() => {
		let currentAppName: string;
		let currentDeployment: any;
		const allTestAppNames: string[] = [];

		beforeEach(async () => {
			vi.clearAllMocks();
			currentAppName = `real-test-${Date.now()}`;
			currentDeployment = await createMockDeployment(currentAppName);
			allTestAppNames.push(currentAppName);

			const mockApp = createMockApplication({ appName: currentAppName });

			vi.mocked(db.query.applications.findFirst).mockResolvedValue(
				mockApp as any,
			);
			vi.mocked(applicationService.findApplicationById).mockResolvedValue(
				mockApp as any,
			);
			vi.mocked(adminService.getDokployUrl).mockResolvedValue(
				"http://localhost:3000",
			);
			vi.mocked(deploymentService.createDeployment).mockResolvedValue(
				currentDeployment as any,
			);
			vi.mocked(deploymentService.updateDeploymentStatus).mockResolvedValue(
				undefined as any,
			);
			vi.mocked(applicationService.updateApplicationStatus).mockResolvedValue(
				{} as any,
			);
			vi.mocked(deploymentService.updateDeployment).mockResolvedValue(
				{} as any,
			);
		});

		afterEach(async () => {
			// ALWAYS cleanup, even if test failed or passed
			console.log(`\n🧹 Cleaning up test: ${currentAppName}`);

			// Clean current appName
			try {
				await cleanupDocker(currentAppName);
				await cleanupFiles(currentAppName);
			} catch (error) {
				console.error("⚠️ Error cleaning current app:", error);
			}

			// Clean ALL test folders just in case
			try {
				const { LOGS_PATH, APPLICATIONS_PATH } = paths(false);
				await execAsync(`rm -rf ${LOGS_PATH}/real-* 2>/dev/null || true`);
				await execAsync(
					`rm -rf ${APPLICATIONS_PATH}/real-* 2>/dev/null || true`,
				);
				console.log("✅ Cleaned up all test artifacts");
			} catch (error) {
				console.error("⚠️ Error cleaning all artifacts:", error);
			}

			console.log("✅ Cleanup completed\n");
		});

		it(
			"should REALLY clone git repo and build with nixpacks",
			async () => {
				console.log(`\n🚀 Testing real deployment with app: ${currentAppName}`);

				const result = await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Nixpacks Test",
					descriptionLog: "Testing real execution",
				});

				expect(result).toBe(true);

				// Verify that Docker image was actually created
				const { stdout: dockerImages } = await execAsync(
					`docker images ${currentAppName} --format "{{.Repository}}"`,
				);
				console.log("dockerImages", dockerImages);
				expect(dockerImages.trim()).toBe(currentAppName);
				console.log(`✅ Docker image created: ${currentAppName}`);

				// Verify log exists and has content
				expect(existsSync(currentDeployment.logPath)).toBe(true);
				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				expect(logContent).toContain("Cloning");
				expect(logContent).toContain("nixpacks");
				console.log(`✅ Build log created with ${logContent.length} chars`);

				// Verify update functions were called
				expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
					"deployment-id",
					"done",
				);
			},
			REAL_TEST_TIMEOUT,
		);

		it.skip(
			"should REALLY build with railpack (SKIPPED: requires special permissions)",
			async () => {
				const railpackAppName = `real-railpack-${Date.now()}`;
				const railpackApp = createMockApplication({
					appName: railpackAppName,
					buildType: "railpack",
					railpackVersion: "3",
				});
				currentAppName = railpackAppName;
				allTestAppNames.push(railpackAppName);

				vi.mocked(db.query.applications.findFirst).mockResolvedValue(
					railpackApp as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					railpackApp as any,
				);

				console.log(`\n🚀 Testing real railpack deployment: ${currentAppName}`);

				const result = await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Railpack Test",
					descriptionLog: "",
				});

				expect(result).toBe(true);

				const { stdout: dockerImages } = await execAsync(
					`docker images ${currentAppName} --format "{{.Repository}}"`,
				);
				expect(dockerImages.trim()).toBe(currentAppName);
				console.log(`✅ Railpack image created: ${currentAppName}`);

				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				expect(logContent).toContain("railpack");
				console.log("✅ Railpack build completed");
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should handle REAL git clone errors",
			async () => {
				const errorAppName = `real-error-${Date.now()}`;
				const errorApp = createMockApplication({
					appName: errorAppName,
					customGitUrl:
						"https://github.com/invalid/nonexistent-repo-123456.git",
				});
				currentAppName = errorAppName;
				allTestAppNames.push(errorAppName);

				vi.mocked(db.query.applications.findFirst).mockResolvedValue(
					errorApp as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					errorApp as any,
				);

				console.log(`\n🚀 Testing real error handling: ${currentAppName}`);

				await expect(
					deployApplication({
						applicationId: "test-app-id",
						titleLog: "Real Error Test",
						descriptionLog: "",
					}),
				).rejects.toThrow();

				// Verify error status was called
				expect(deploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
					"deployment-id",
					"error",
				);

				// Verify log contains error
				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				expect(logContent.toLowerCase()).toContain("error");
				console.log("✅ Error handling verified");
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should REALLY clone with submodules when enabled",
			async () => {
				const submodulesAppName = `real-submodules-${Date.now()}`;
				const submodulesApp = createMockApplication({
					appName: submodulesAppName,
					enableSubmodules: true,
				});
				currentAppName = submodulesAppName;
				allTestAppNames.push(submodulesAppName);

				vi.mocked(db.query.applications.findFirst).mockResolvedValue(
					submodulesApp as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					submodulesApp as any,
				);

				console.log(`\n🚀 Testing real submodules support: ${currentAppName}`);

				const result = await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Submodules Test",
					descriptionLog: "",
				});

				expect(result).toBe(true);

				// Verify deployment completed successfully
				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				expect(logContent).toContain("Cloning");
				expect(logContent.length).toBeGreaterThan(100);
				console.log("✅ Submodules deployment completed");

				// Verify image
				const { stdout: dockerImages } = await execAsync(
					`docker images ${currentAppName} --format "{{.Repository}}"`,
				);
				expect(dockerImages.trim()).toBe(currentAppName);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should verify REAL commit info extraction",
			async () => {
				console.log(`\n🚀 Testing real commit info: ${currentAppName}`);

				await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Commit Test",
					descriptionLog: "",
				});

				// Verify updateDeployment was called with commit info
				expect(deploymentService.updateDeployment).toHaveBeenCalled();
				const updateCall = vi.mocked(deploymentService.updateDeployment).mock
					.calls[0];

				// Real commit info should have title and hash
				expect(updateCall?.[1]).toHaveProperty("title");
				expect(updateCall?.[1]).toHaveProperty("description");
				expect(updateCall?.[1]?.description).toContain("Commit:");

				console.log(
					`✅ Real commit extracted: ${updateCall?.[1]?.title?.substring(0, 50)}...`,
				);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should REALLY build with Dockerfile",
			async () => {
				const dockerfileAppName = `real-dockerfile-${Date.now()}`;
				const dockerfileApp = createMockApplication({
					appName: dockerfileAppName,
					buildType: "dockerfile",
					customGitBuildPath: "/deno",
					dockerfile: "Dockerfile",
				});
				currentAppName = dockerfileAppName;
				allTestAppNames.push(dockerfileAppName);

				vi.mocked(db.query.applications.findFirst).mockResolvedValue(
					dockerfileApp as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					dockerfileApp as any,
				);

				console.log(`\n🚀 Testing real Dockerfile build: ${currentAppName}`);

				const result = await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Dockerfile Test",
					descriptionLog: "",
				});

				expect(result).toBe(true);

				// Verify log
				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				expect(logContent).toContain("Building");
				expect(logContent).toContain(dockerfileAppName);
				console.log("✅ Dockerfile build log verified");

				// Verify image
				const { stdout: dockerImages } = await execAsync(
					`docker images ${currentAppName} --format "{{.Repository}}"`,
				);
				console.log("dockerImages", dockerImages);
				expect(dockerImages.trim()).toBe(currentAppName);
				console.log(`✅ Docker image created: ${currentAppName}`);
			},
			REAL_TEST_TIMEOUT,
		);
		it(
			"should REALLY apply patches from database during deployment",
			async () => {
				// 1. Setup local temporary git repo
				const tempRepo = await mkdtemp(join(tmpdir(), "real-patch-repo-"));
				// Helper for local git commands
				const execLocal = async (cmd: string) => execAsync(cmd, { cwd: tempRepo });

				await execLocal("git init");
				await execLocal("git config user.email 'test@dokploy.com'");
				await execLocal("git config user.name 'Dokploy Test'");

				// Create a simple Dockerfile and server script
				// We use a simple python server to verify output
				await writeFile(join(tempRepo, "app.py"), "print('Original App')\n");
				await writeFile(
					join(tempRepo, "Dockerfile"),
					"FROM python:3.9-slim\nCOPY app.py .\nCMD [\"python\", \"app.py\"]\n",
				);

				await execLocal("git add .");
				await execLocal("git commit -m 'Initial commit'");
				// Ensure master/main branch exists (git init might create master or main depending on config)
				// We force create a branch named 'main' to be consistent
				await execLocal("git checkout -b main || git checkout main");

				// 2. Mock Application to use this local repo
				const patchAppName = `real-patch-app-${Date.now()}`;
				const patchApp = createMockApplication({
					appName: patchAppName,
					buildType: "dockerfile",
					customGitUrl: `file://${tempRepo}`,
					customGitBranch: "main",
					dockerfile: "Dockerfile",
				});
				currentAppName = patchAppName;
				allTestAppNames.push(patchAppName);

				// Setup standard mocks
				vi.mocked(db.query.applications.findFirst).mockResolvedValue(
					patchApp as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					patchApp as any,
				);

				// 3. Generate a patch
				// We modify the file, generate patch, and then reset.
				const newContent = "print('Patched App')\n";
				const patchContent = await generatePatch({
					codePath: tempRepo,
					filePath: "app.py",
					newContent,
					serverId: null,
				});

				// 4. Mock patch service to return this patch
				vi.mocked(patchService.findPatchesByApplicationId).mockResolvedValue([
					{
						patchId: "test-patch-1",
						applicationId: "test-app-id",
						composeId: null,
						filePath: "app.py",
						content: patchContent,
						enabled: true,
						createdAt: new Date().toISOString(),
					} as any,
				]);

				console.log(`\n🚀 Testing deployment with patch: ${currentAppName}`);

				// 5. Deploy
				const result = await deployApplication({
					applicationId: "test-app-id",
					titleLog: "Real Patch Test",
					descriptionLog: "Testing patch application",
				});

				expect(result).toBe(true);

				// 6. Verify Log contains "Applying patch"
				const { stdout: logContent } = await execAsync(
					`cat ${currentDeployment.logPath}`,
				);
				// The implementation logs "Applying patch: ..."
				expect(logContent).toContain("Applying patch");
				expect(logContent).toContain("app.py");
				console.log("✅ Verified patch execution logs");

				// 7. Verify the deployed image contains the patched code
				// We run the image and check output
				const { stdout: runOutput } = await execAsync(
					`docker run --rm ${patchAppName}`,
				);
				expect(runOutput.trim()).toBe("Patched App");
				console.log("✅ Verified patched output:", runOutput.trim());
			},
			REAL_TEST_TIMEOUT,
		);
	},
	REAL_TEST_TIMEOUT,
);
