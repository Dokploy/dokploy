import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeploymentJob } from "../../server/queues/queue-types";

type MockQueueState = "waiting" | "delayed" | "active";

vi.mock("bullmq", () => {
	type MockJob = {
		id: string;
		data: DeploymentJob;
		state: MockQueueState;
		remove: () => Promise<void>;
	};

	const jobsByQueue = new Map<string, MockJob[]>();
	let jobCounter = 0;

	const createJob = (
		queueName: string,
		data: DeploymentJob,
		state: MockQueueState,
	): MockJob => {
		const jobId = `${queueName}-${++jobCounter}`;
		return {
			id: jobId,
			data,
			state,
			remove: async () => {
				const jobs = jobsByQueue.get(queueName) || [];
				jobsByQueue.set(
					queueName,
					jobs.filter((job) => job.id !== jobId),
				);
			},
		};
	};

	class Queue {
		name: string;

		constructor(name: string) {
			this.name = name;
			if (!jobsByQueue.has(name)) {
				jobsByQueue.set(name, []);
			}
		}

		on() {
			return this;
		}

		async add(_name: string, data: DeploymentJob) {
			const job = createJob(this.name, data, "waiting");
			const queueJobs = jobsByQueue.get(this.name) || [];
			queueJobs.push(job);
			jobsByQueue.set(this.name, queueJobs);
			return job;
		}

		async getJobs(states?: MockQueueState[]) {
			const requestedStates = new Set(states || ["waiting", "delayed", "active"]);
			return (jobsByQueue.get(this.name) || []).filter((job) =>
				requestedStates.has(job.state),
			);
		}

		async close() {
			return;
		}
	}

	return {
		Queue,
		__mock: {
			reset: () => {
				jobsByQueue.clear();
				jobCounter = 0;
			},
			seedJobs: (
				queueName: string,
				jobs: Array<{
					data: DeploymentJob;
					state: MockQueueState;
				}>,
			) => {
				const queueJobs = jobsByQueue.get(queueName) || [];
				for (const job of jobs) {
					queueJobs.push(createJob(queueName, job.data, job.state));
				}
				jobsByQueue.set(queueName, queueJobs);
			},
			getJobs: (queueName: string) => jobsByQueue.get(queueName) || [],
		},
	};
});

vi.mock("@dokploy/server", () => ({
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findServerById: vi.fn(),
	getAllServers: vi.fn(),
	getWebServerSettings: vi.fn(),
	IS_CLOUD: false,
}));

vi.mock("../../server/queues/deployments-queue", () => {
	type MockWorker = {
		queueName: string;
		concurrency: number;
		on: ReturnType<typeof vi.fn>;
		run: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
		cancelAllJobs: ReturnType<typeof vi.fn>;
	};

	const workersByQueue = new Map<string, MockWorker[]>();
	const createDeploymentWorker = vi.fn((queueName: string, concurrency = 1) => {
		const worker: MockWorker = {
			queueName,
			concurrency,
			on: vi.fn(),
			run: vi.fn().mockResolvedValue(undefined),
			close: vi.fn().mockResolvedValue(undefined),
			cancelAllJobs: vi.fn(),
		};
		const workers = workersByQueue.get(queueName) || [];
		workers.push(worker);
		workersByQueue.set(queueName, workers);
		return worker;
	});

	return {
		createDeploymentWorker,
		__mock: {
			reset: () => {
				createDeploymentWorker.mockClear();
				workersByQueue.clear();
			},
			getWorkers: (queueName: string) => workersByQueue.get(queueName) || [],
			getLatestWorker: (queueName: string) => {
				const workers = workersByQueue.get(queueName) || [];
				return workers.at(-1);
			},
		},
	};
});

const LOCAL_QUEUE = "deployments:local";
const SERVER_QUEUE = "deployments:server:server-1";
const BUILD_SERVER_QUEUE = "deployments:server:build-1";

const createDeferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

beforeEach(async () => {
	vi.resetModules();

	const bullmq = (await import("bullmq")) as any;
	bullmq.__mock.reset();

	const deploymentsQueue = (await import(
		"../../server/queues/deployments-queue"
	)) as any;
	deploymentsQueue.__mock.reset();

	const server = await import("@dokploy/server");
	vi.mocked(server.findApplicationById).mockReset();
	vi.mocked(server.findComposeById).mockReset();
	vi.mocked(server.findServerById).mockReset();
	vi.mocked(server.getAllServers).mockReset();
	vi.mocked(server.getWebServerSettings).mockReset();

	vi.mocked(server.findApplicationById).mockImplementation(
		async (applicationId: string) =>
			({
				applicationId,
				serverId: null,
				buildServerId: null,
			}) as any,
	);
	vi.mocked(server.findComposeById).mockImplementation(
		async (composeId: string) =>
			({
				composeId,
				serverId: null,
			}) as any,
	);
	vi.mocked(server.findServerById).mockImplementation(
		async (serverId: string) =>
			({
				serverId,
				name: `Server ${serverId}`,
				deploymentConcurrency: 1,
			}) as any,
	);
	vi.mocked(server.getAllServers).mockResolvedValue([]);
	vi.mocked(server.getWebServerSettings).mockResolvedValue({
		localDeploymentConcurrency: 1,
	} as any);
});

describe("queueSetup regressions", () => {
	it("routes preview deployments to build server queue when buildServerId is configured", async () => {
		const server = await import("@dokploy/server");
		vi.mocked(server.findApplicationById).mockResolvedValue({
			applicationId: "app-1",
			serverId: "server-1",
			buildServerId: "build-1",
		} as any);

		const queueSetup = await import("../../server/queues/queueSetup");
		await queueSetup.enqueueDeploymentJob({
			applicationId: "app-1",
			previewDeploymentId: "preview-1",
			titleLog: "Preview deployment",
			descriptionLog: "",
			type: "deploy",
			applicationType: "application-preview",
		});

		const deploymentsQueue = (await import(
			"../../server/queues/deployments-queue"
		)) as any;
		expect(
			deploymentsQueue.createDeploymentWorker.mock.calls.some(
				(call: [string, number]) => call[0] === BUILD_SERVER_QUEUE,
			),
		).toBe(true);

		const bullmq = (await import("bullmq")) as any;
		expect(bullmq.__mock.getJobs(BUILD_SERVER_QUEUE)).toHaveLength(1);
	});

	it("cleanAllDeploymentQueue cancels active workers and clears waiting/delayed jobs", async () => {
		const server = await import("@dokploy/server");
		vi.mocked(server.getAllServers).mockResolvedValue([
			{
				serverId: "server-1",
				name: "Server 1",
			},
		] as any);
		vi.mocked(server.findApplicationById).mockImplementation(
			async (applicationId: string) =>
				({
					applicationId,
					serverId: null,
					buildServerId: null,
				}) as any,
		);
		vi.mocked(server.findComposeById).mockResolvedValue({
			composeId: "compose-1",
			serverId: "server-1",
		} as any);

		const queueSetup = await import("../../server/queues/queueSetup");
		await queueSetup.enqueueDeploymentJob({
			applicationId: "app-local",
			titleLog: "Local",
			descriptionLog: "",
			type: "deploy",
			applicationType: "application",
		});
		await queueSetup.enqueueDeploymentJob({
			composeId: "compose-1",
			titleLog: "Compose",
			descriptionLog: "",
			type: "deploy",
			applicationType: "compose",
		});

		const bullmq = (await import("bullmq")) as any;
		bullmq.__mock.seedJobs(LOCAL_QUEUE, [
			{
				data: {
					applicationId: "app-local",
					titleLog: "Delayed",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application",
				},
				state: "delayed",
			},
		]);
		bullmq.__mock.seedJobs(SERVER_QUEUE, [
			{
				data: {
					composeId: "compose-1",
					titleLog: "Delayed Compose",
					descriptionLog: "",
					type: "deploy",
					applicationType: "compose",
				},
				state: "delayed",
			},
		]);

		await queueSetup.cleanAllDeploymentQueue();

		const deploymentsQueue = (await import(
			"../../server/queues/deployments-queue"
		)) as any;
		const localWorker = deploymentsQueue.__mock.getLatestWorker(LOCAL_QUEUE);
		const serverWorker = deploymentsQueue.__mock.getLatestWorker(SERVER_QUEUE);

		expect(localWorker.cancelAllJobs).toHaveBeenCalledWith(
			"User requested cancellation",
		);
		expect(serverWorker.cancelAllJobs).toHaveBeenCalledWith(
			"User requested cancellation",
		);

		const localQueuedJobs = bullmq
			.__mock.getJobs(LOCAL_QUEUE)
			.filter((job: { state: MockQueueState }) =>
				job.state === "waiting" || job.state === "delayed",
			);
		const serverQueuedJobs = bullmq
			.__mock.getJobs(SERVER_QUEUE)
			.filter((job: { state: MockQueueState }) =>
				job.state === "waiting" || job.state === "delayed",
			);

		expect(localQueuedJobs).toHaveLength(0);
		expect(serverQueuedJobs).toHaveLength(0);
	});

	it("coalesces concurrent refresh requests and applies latest concurrency", async () => {
		const server = await import("@dokploy/server");
		let localConcurrency = 1;
		vi.mocked(server.getWebServerSettings).mockImplementation(
			async () =>
				({
					localDeploymentConcurrency: localConcurrency,
				}) as any,
		);

		const queueSetup = await import("../../server/queues/queueSetup");
		await queueSetup.enqueueDeploymentJob({
			applicationId: "app-local",
			titleLog: "Initial",
			descriptionLog: "",
			type: "deploy",
			applicationType: "application",
		});

		const deploymentsQueue = (await import(
			"../../server/queues/deployments-queue"
		)) as any;
		const firstWorker = deploymentsQueue.__mock.getLatestWorker(LOCAL_QUEUE);
		const closeGate = createDeferred();
		firstWorker.close.mockImplementationOnce(() => closeGate.promise);

		localConcurrency = 3;
		const firstRefresh = queueSetup.refreshLocalDeploymentWorker();

		localConcurrency = 5;
		const secondRefresh = queueSetup.refreshLocalDeploymentWorker();

		closeGate.resolve();
		await Promise.all([firstRefresh, secondRefresh]);

		const localCreateCalls = deploymentsQueue.createDeploymentWorker.mock.calls
			.filter((call: [string, number]) => call[0] === LOCAL_QUEUE)
			.map((call: [string, number]) => call[1]);

		expect(localCreateCalls[0]).toBe(1);
		expect(localCreateCalls).toHaveLength(3);
		expect(localCreateCalls.at(-1)).toBe(5);
	});

	it("includes preview jobs in application queue summary", async () => {
		const server = await import("@dokploy/server");
		vi.mocked(server.findApplicationById).mockResolvedValue({
			applicationId: "app-1",
			serverId: "server-1",
			buildServerId: null,
		} as any);
		vi.mocked(server.findServerById).mockResolvedValue({
			serverId: "server-1",
			name: "Server 1",
			deploymentConcurrency: 4,
		} as any);

		const bullmq = (await import("bullmq")) as any;
		bullmq.__mock.seedJobs(SERVER_QUEUE, [
			{
				data: {
					applicationId: "app-1",
					titleLog: "App deploy",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application",
				},
				state: "waiting",
			},
			{
				data: {
					applicationId: "app-1",
					previewDeploymentId: "preview-1",
					titleLog: "Preview deploy",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application-preview",
				},
				state: "delayed",
			},
			{
				data: {
					applicationId: "app-2",
					previewDeploymentId: "preview-2",
					titleLog: "Other preview",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application-preview",
				},
				state: "waiting",
			},
			{
				data: {
					composeId: "compose-1",
					titleLog: "Active compose",
					descriptionLog: "",
					type: "deploy",
					applicationType: "compose",
				},
				state: "active",
			},
		]);

		const queueSetup = await import("../../server/queues/queueSetup");
		const summary = await queueSetup.getQueueSummaryByType("application", "app-1");

		expect(summary.targetId).toBe("server-1");
		expect(summary.concurrencyLimit).toBe(4);
		expect(summary.runningOnTarget).toBe(1);
		expect(summary.queuedOnTarget).toBe(3);
		expect(summary.queuedForService).toBe(2);
		expect(summary.nextServiceJobPosition).toBe(1);
	});
});
