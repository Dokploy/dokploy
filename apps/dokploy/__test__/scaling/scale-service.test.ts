import {
	ScaleRejectedError,
	scaleService,
} from "@dokploy/server/services/scaling/scale-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const baseSpec = {
	Name: "web-app",
	Labels: { "traefik.enable": "true" },
	TaskTemplate: {
		ContainerSpec: {
			Image: "registry.example.com/web-app:latest@sha256:abc",
			Env: ["SECRET=value"],
		},
		ForceUpdate: 4,
	},
	Mode: { Replicated: { Replicas: 2 } },
	UpdateConfig: { Parallelism: 1, Order: "start-first" },
};

const inspectMock = vi.fn();
const updateMock = vi.fn();
const docker = {
	getService: vi.fn(() => ({ inspect: inspectMock, update: updateMock })),
} as unknown as Parameters<typeof scaleService>[0]["docker"];

const serviceInfo = (overrides: Record<string, unknown> = {}) => ({
	ID: "svc-1",
	Version: { Index: 42 },
	Spec: structuredClone(baseSpec),
	...overrides,
});

const outOfSequence = () =>
	Object.assign(
		new Error(
			"(HTTP code 500) server error - rpc error: code = Unknown desc = update out of sequence",
		),
		{ statusCode: 500 },
	);

describe("scaleService", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		updateMock.mockReset();
		updateMock.mockResolvedValue(undefined);
	});

	it("resubmits the inspected spec with only the replica count changed", async () => {
		inspectMock.mockResolvedValue(serviceInfo());

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 4,
		});

		expect(result).toEqual({ from: 2, to: 4, changed: true });
		expect(updateMock).toHaveBeenCalledTimes(1);
		const [payload] = updateMock.mock.calls[0] ?? [];
		expect(payload).toEqual({
			_query: { version: 42 },
			_body: { ...baseSpec, Mode: { Replicated: { Replicas: 4 } } },
		});
		expect(payload._body.TaskTemplate.ForceUpdate).toBe(4);
	});

	it("sends no registry auth so Swarm keeps the stored pull credentials", async () => {
		inspectMock.mockResolvedValue(serviceInfo());

		await scaleService({ docker, serviceName: "web-app", replicas: 3 });

		expect(updateMock.mock.calls[0]).toHaveLength(1);
		expect(updateMock.mock.calls[0]?.[0]).not.toHaveProperty("authconfig");
	});

	it("does nothing when the service already runs that many replicas", async () => {
		inspectMock.mockResolvedValue(serviceInfo());

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 2,
		});

		expect(result).toEqual({ from: 2, to: 2, changed: false });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("re-inspects and retries when the spec version is stale", async () => {
		inspectMock
			.mockResolvedValueOnce(serviceInfo())
			.mockResolvedValueOnce(serviceInfo({ Version: { Index: 43 } }));
		updateMock.mockRejectedValueOnce(outOfSequence());

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 5,
			retryDelayMs: 0,
		});

		expect(result.changed).toBe(true);
		expect(updateMock).toHaveBeenCalledTimes(2);
		expect(updateMock.mock.calls[1]?.[0]._query).toEqual({ version: 43 });
	});

	it("gives up after the retry budget", async () => {
		inspectMock.mockResolvedValue(serviceInfo());
		updateMock.mockRejectedValue(outOfSequence());

		await expect(
			scaleService({
				docker,
				serviceName: "web-app",
				replicas: 5,
				retryDelayMs: 0,
			}),
		).rejects.toThrow("update out of sequence");
		expect(updateMock).toHaveBeenCalledTimes(3);
	});

	it("does not retry other update errors", async () => {
		inspectMock.mockResolvedValue(serviceInfo());
		updateMock.mockRejectedValue(new Error("network unreachable"));

		await expect(
			scaleService({ docker, serviceName: "web-app", replicas: 5 }),
		).rejects.toThrow("network unreachable");
		expect(updateMock).toHaveBeenCalledTimes(1);
	});

	it.each(["updating", "paused", "rollback_started", "rollback_paused"])(
		"refuses while the rollout is %s",
		async (state) => {
			inspectMock.mockResolvedValue(
				serviceInfo({ UpdateStatus: { State: state } }),
			);

			const error = await scaleService({
				docker,
				serviceName: "web-app",
				replicas: 3,
			}).catch((e: unknown) => e);

			expect(error).toBeInstanceOf(ScaleRejectedError);
			expect((error as ScaleRejectedError).reason).toBe("rollout_in_progress");
			expect(updateMock).not.toHaveBeenCalled();
		},
	);

	it("scales during a rollout when explicitly allowed", async () => {
		inspectMock.mockResolvedValue(
			serviceInfo({ UpdateStatus: { State: "paused" } }),
		);

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 0,
			allowDuringRollout: true,
		});

		expect(result).toEqual({ from: 2, to: 0, changed: true });
		expect(updateMock).toHaveBeenCalledTimes(1);
	});

	it("allows scaling once a rollout has completed", async () => {
		inspectMock.mockResolvedValue(
			serviceInfo({ UpdateStatus: { State: "completed" } }),
		);

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 3,
		});

		expect(result.changed).toBe(true);
	});

	it("refuses services that are not replicated", async () => {
		inspectMock.mockResolvedValue(
			serviceInfo({ Spec: { ...baseSpec, Mode: { Global: {} } } }),
		);

		await expect(
			scaleService({ docker, serviceName: "web-app", replicas: 3 }),
		).rejects.toMatchObject({ reason: "unsupported_mode" });
	});

	it("refuses when someone else changed the count since it was read", async () => {
		inspectMock.mockResolvedValue(serviceInfo());

		await expect(
			scaleService({
				docker,
				serviceName: "web-app",
				replicas: 4,
				expectedFrom: 3,
			}),
		).rejects.toMatchObject({ reason: "replicas_changed" });
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("treats a concurrent change to the same target as done", async () => {
		inspectMock.mockResolvedValue(
			serviceInfo({
				Spec: { ...baseSpec, Mode: { Replicated: { Replicas: 4 } } },
			}),
		);

		const result = await scaleService({
			docker,
			serviceName: "web-app",
			replicas: 4,
			expectedFrom: 2,
		});

		expect(result).toEqual({ from: 4, to: 4, changed: false });
	});

	it.each([-1, 1.5, Number.NaN])(
		"rejects invalid count %s",
		async (replicas) => {
			await expect(
				scaleService({ docker, serviceName: "web-app", replicas }),
			).rejects.toThrow("Invalid replica count");
			expect(inspectMock).not.toHaveBeenCalled();
		},
	);
});
