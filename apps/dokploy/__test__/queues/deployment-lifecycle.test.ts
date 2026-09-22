import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import * as schema from "@dokploy/server/db/schema";
import type { DeploymentJob } from "@dokploy/server/queues/deployment-job";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("persisted deployment lifecycle", () => {
	const userId = randomUUID();
	const environmentId = randomUUID();
	const applicationId = randomUUID();
	const otherApplicationId = randomUUID();
	const composeId = randomUUID();
	const previewDeploymentId = randomUUID();
	let client: ReturnType<typeof postgres>;
	let database: ReturnType<typeof drizzle<typeof schema>>;
	let lifecycle: typeof import("@dokploy/server/services/deployment-lifecycle");
	let deploymentQueue: typeof import("@/server/queues/queueSetup");
	let deploymentService: typeof import("@dokploy/server/services/deployment");
	let logDirectory: string | undefined;
	let executeDeployment: typeof import("@dokploy/server/queues/execute-deployment").executeDeployment;

	const job = (id: string = applicationId): DeploymentJob => ({
		applicationType: "application",
		applicationId: id,
		titleLog: "Deployment",
		descriptionLog: "",
		type: "deploy",
	});

	beforeAll(async () => {
		if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
		client = postgres(databaseUrl, { onnotice: () => {} });
		database = drizzle(client, { schema });
		await migrate(database, { migrationsFolder: path.resolve("drizzle") });
		// Replace the suite-wide DB stub with real PostgreSQL for this module.
		vi.doMock("@dokploy/server/db", () => ({ db: database }));
		lifecycle = await import("@dokploy/server/services/deployment-lifecycle");
		deploymentService = await import("@dokploy/server/services/deployment");
		deploymentQueue = await import("@/server/queues/queueSetup");
		({ executeDeployment } = await import(
			"@dokploy/server/queues/execute-deployment"
		));
		await database.insert(schema.user).values({
			id: userId,
			email: `${userId}@example.test`,
			emailVerified: false,
			updatedAt: new Date(),
		});
		await database.insert(schema.organization).values({
			id: userId,
			name: "Deployment tests",
			ownerId: userId,
			createdAt: new Date(),
		});
		await database.insert(schema.projects).values({
			projectId: userId,
			name: "Deployment tests",
			organizationId: userId,
		});
		await database.insert(schema.environments).values({
			environmentId,
			name: "Deployment tests",
			projectId: userId,
		});
		await database.insert(schema.applications).values([
			{
				applicationId,
				environmentId,
				name: "Application",
				appName: applicationId,
			},
			{
				applicationId: otherApplicationId,
				environmentId,
				name: "Other application",
				appName: otherApplicationId,
			},
		]);
		await database.insert(schema.compose).values({
			composeId,
			environmentId,
			name: "Compose",
			appName: composeId,
		});
		await database.insert(schema.previewDeployments).values({
			previewDeploymentId,
			applicationId,
			appName: previewDeploymentId,
			branch: "preview",
			pullRequestId: "1",
			pullRequestNumber: "1",
			pullRequestURL: "https://example.test/pull/1",
			pullRequestTitle: "Preview",
			pullRequestCommentId: "1",
		});
	}, 30_000);

	beforeEach(async () => {
		await deploymentQueue.cleanAllDeploymentQueue();
	});

	afterAll(async () => {
		if (database)
			await database.delete(schema.user).where(eq(schema.user.id, userId));
		if (client) await client.end();
		if (logDirectory) await rm(logDirectory, { recursive: true, force: true });
		vi.doUnmock("@dokploy/server/db");
	});

	it("keeps one record and preserves queued siblings when a deployment finishes", async () => {
		const first = await lifecycle.queueDeployment(job());
		const second = await lifecycle.queueDeployment(job());
		expect(first).toMatchObject({
			status: "queued",
			startedAt: null,
			finishedAt: null,
			logPath: "",
		});
		const running = await deploymentService.createDeployment({
			applicationId,
			title: "Deployment",
			deploymentId: first.deploymentId,
		});
		if (!running) throw new Error("Deployment was not claimed");
		logDirectory = path.dirname(running.logPath);
		expect(await readFile(running.logPath, "utf8")).toContain(
			"Initializing deployment",
		);
		expect(running).toMatchObject({
			deploymentId: first.deploymentId,
			status: "running",
		});
		expect(running?.startedAt).toBeTruthy();
		await lifecycle.finishDeployment(first.deploymentId, "done");
		expect(
			await database.query.applications.findFirst({
				where: eq(schema.applications.applicationId, applicationId),
			}),
		).toMatchObject({ applicationStatus: "queued" });
		await lifecycle.claimQueuedDeployment(second.deploymentId, second);
		const done = await lifecycle.finishDeployment(second.deploymentId, "done");
		expect(done).toMatchObject({
			deploymentId: second.deploymentId,
			status: "done",
		});
		expect(done?.finishedAt).toBeTruthy();
	});

	it("cleans only the requested service from persisted and in-memory queues", async () => {
		const application = await deploymentQueue.enqueueDeployment(job());
		const preview = await deploymentQueue.enqueueDeployment({
			...job(),
			applicationType: "application-preview",
			applicationId,
			previewDeploymentId,
		});
		const compose = await deploymentQueue.enqueueDeployment({
			...job(),
			applicationType: "compose",
			composeId,
		});
		await deploymentQueue.cleanQueuesByApplication(applicationId);
		expect(
			(await deploymentQueue.getDeploymentJobs())
				.map(({ data }) => data.deploymentId)
				.sort(),
		).toEqual([preview.deploymentId, compose.deploymentId].sort());
		expect(
			await database.query.deployments.findFirst({
				where: eq(schema.deployments.deploymentId, application.deploymentId),
			}),
		).toMatchObject({ status: "cancelled" });
		expect(
			await database.query.previewDeployments.findFirst({
				where: eq(
					schema.previewDeployments.previewDeploymentId,
					previewDeploymentId,
				),
			}),
		).toMatchObject({ previewStatus: "queued" });
	});

	it("records dispatch failures and leaves no waiting attempt behind", async () => {
		const queue = globalThis.__dokployDeploymentQueue;
		if (!queue) throw new Error("Self-hosted queue is missing");
		const add = vi
			.spyOn(queue, "add")
			.mockRejectedValueOnce(new Error("Queue closed"));
		try {
			await expect(deploymentQueue.enqueueDeployment(job())).rejects.toThrow(
				"Queue closed",
			);
			expect(
				await database.query.applications.findFirst({
					where: eq(schema.applications.applicationId, applicationId),
				}),
			).toMatchObject({ applicationStatus: "error" });
			const attempts = await database.query.deployments.findMany({
				where: eq(schema.deployments.applicationId, applicationId),
			});
			expect(attempts.some((attempt) => attempt.status === "queued")).toBe(
				false,
			);
			expect(
				attempts.find((attempt) => attempt.errorMessage === "Queue closed"),
			).toMatchObject({ status: "error", startedAt: null });
		} finally {
			add.mockRestore();
		}
	});

	it("never reclaims cancelled attempts or overwrites their terminal state", async () => {
		const queued = await lifecycle.queueDeployment(job());
		expect(await lifecycle.cancelQueuedDeployments()).toContain(
			queued.deploymentId,
		);
		expect(
			await lifecycle.claimQueuedDeployment(queued.deploymentId, queued),
		).toBeUndefined();
		expect(
			await lifecycle.finishDeployment(queued.deploymentId, "done"),
		).toBeUndefined();
		expect(
			await lifecycle.failQueuedDeployment(
				queued.deploymentId,
				new Error("late response"),
			),
		).toBeUndefined();
		expect(
			await database.query.deployments.findFirst({
				where: eq(schema.deployments.deploymentId, queued.deploymentId),
			}),
		).toMatchObject({ status: "cancelled", startedAt: null });
	});

	it("does not cancel an enqueue arriving after the cleanup snapshot", async () => {
		const queued = await lifecycle.queueDeployment(job());
		const blocker = await client.reserve();
		let cancelling: Promise<string[]> | undefined;
		try {
			await blocker`begin`;
			await blocker`select 1 from application where "applicationId" = ${applicationId} for update`;
			cancelling = lifecycle.cancelQueuedDeployments();
			await vi.waitFor(async () => {
				const waiting =
					await client`select pid from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
				expect(waiting.length).toBeGreaterThan(0);
			});
			const later = await lifecycle.queueDeployment(job(otherApplicationId));
			await blocker`commit`;
			expect(await cancelling).toEqual([queued.deploymentId]);
			expect(
				await lifecycle.claimQueuedDeployment(later.deploymentId, later),
			).toMatchObject({ status: "running" });
			await lifecycle.finishDeployment(later.deploymentId, "done");
		} finally {
			await blocker`rollback`;
			blocker.release();
			await cancelling;
		}
	});

	it("skips cancelled jobs in the shared worker for every service type", async () => {
		const requests: DeploymentJob[] = [
			job(),
			{ ...job(), applicationType: "compose", composeId },
			{
				...job(),
				applicationType: "application-preview",
				applicationId,
				previewDeploymentId,
			},
		];
		for (const request of requests) {
			const queued = await lifecycle.queueDeployment(request);
			await lifecycle.cancelQueuedDeployments();
			expect(
				await executeDeployment({
					...request,
					deploymentId: queued.deploymentId,
				}),
			).toBe(false);
			expect(
				await database.query.deployments.findFirst({
					where: eq(schema.deployments.deploymentId, queued.deploymentId),
				}),
			).toMatchObject({ status: "cancelled", logPath: "", startedAt: null });
		}
	});

	it("recovers interrupted attempts without cancelling remote scheduled work", async () => {
		const queued = await lifecycle.queueDeployment(job());
		const preview = await lifecycle.queueDeployment({
			...job(),
			applicationType: "application-preview",
			applicationId,
			previewDeploymentId,
		});
		await lifecycle.claimQueuedDeployment(preview.deploymentId, preview);
		const scheduleId = randomUUID();
		await database
			.insert(schema.schedules)
			.values({
				scheduleId,
				name: "Remote schedule",
				applicationId,
				cronExpression: "* * * * *",
				command: "true",
				scheduleType: "application",
			});
		const [scheduled] = await database
			.insert(schema.deployments)
			.values({
				scheduleId,
				title: "Scheduled command",
				status: "running",
				logPath: "",
			})
			.returning();
		if (!scheduled) throw new Error("Missing scheduled attempt");
		const { initCancelDeployments } = await import(
			"@dokploy/server/utils/startup/cancel-deployments"
		);
		await initCancelDeployments();
		for (const attempt of [queued, preview]) {
			expect(
				await database.query.deployments.findFirst({
					where: eq(schema.deployments.deploymentId, attempt.deploymentId),
				}),
			).toMatchObject({ status: "cancelled" });
		}
		expect(
			await database.query.previewDeployments.findFirst({
				where: eq(
					schema.previewDeployments.previewDeploymentId,
					previewDeploymentId,
				),
			}),
		).toMatchObject({ previewStatus: "idle" });
		expect(
			await database.query.deployments.findFirst({
				where: eq(schema.deployments.deploymentId, scheduled.deploymentId),
			}),
		).toMatchObject({ status: "running" });
	});

	it("serializes concurrent completion and enqueue without losing the active status", async () => {
		for (let attempt = 0; attempt < 5; attempt++) {
			const running = await lifecycle.queueDeployment(job());
			await lifecycle.claimQueuedDeployment(running.deploymentId, running);
			const [queued] = await Promise.all([
				lifecycle.queueDeployment(job()),
				lifecycle.finishDeployment(running.deploymentId, "done"),
			]);
			expect(
				await database.query.applications.findFirst({
					where: eq(schema.applications.applicationId, applicationId),
				}),
			).toMatchObject({ applicationStatus: "queued" });
			await lifecycle.claimQueuedDeployment(queued.deploymentId, queued);
			await lifecycle.finishDeployment(queued.deploymentId, "done");
		}
	});

	it("keeps Compose and preview attempts attached to their own service", async () => {
		const composeAttempt = await lifecycle.queueDeployment({
			applicationType: "compose",
			composeId,
			titleLog: "Compose",
			descriptionLog: "",
			type: "deploy",
			freshVolumes: true,
		});
		const preview = await lifecycle.queueDeployment({
			applicationType: "application-preview",
			applicationId,
			previewDeploymentId,
			titleLog: "Preview",
			descriptionLog: "",
			type: "deploy",
		});
		expect(preview).toMatchObject({
			previewDeploymentId,
			applicationId: null,
			composeId: null,
		});
		expect(
			await lifecycle.claimQueuedDeployment(
				preview.deploymentId,
				composeAttempt,
			),
		).toBeUndefined();
		await lifecycle.claimQueuedDeployment(
			composeAttempt.deploymentId,
			composeAttempt,
		);
		await lifecycle.claimQueuedDeployment(preview.deploymentId, preview);
		await lifecycle.finishDeployment(
			composeAttempt.deploymentId,
			"error",
			"Build failed",
		);
		await lifecycle.finishDeployment(preview.deploymentId, "done");
		expect(
			await database.query.compose.findFirst({
				where: eq(schema.compose.composeId, composeId),
			}),
		).toMatchObject({ composeStatus: "error" });
		expect(
			await database.query.previewDeployments.findFirst({
				where: eq(
					schema.previewDeployments.previewDeploymentId,
					previewDeploymentId,
				),
			}),
		).toMatchObject({ previewStatus: "done" });
	});
});
