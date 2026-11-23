import {
	AUTOSCALER_SERVICE,
	buildAutoscalerServiceSpec,
	ensureAutoscalerService,
} from "@dokploy/server/setup/autoscaler-setup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type Docker = NonNullable<Parameters<typeof ensureAutoscalerService>[0]>;

interface Task {
	ContainerSpec: {
		Image?: string;
		Env?: string[];
		Secrets?: unknown;
		Mounts?: unknown;
		Command?: string[];
		HealthCheck?: { Test?: string[] };
	};
	Networks?: unknown;
	Placement?: unknown;
}

const dokploySpec = {
	Name: "dokploy",
	TaskTemplate: {
		ContainerSpec: {
			Image: "dokploy/dokploy:v1@sha256:abc",
			Env: [
				"ADVERTISE_ADDR=10.0.0.1",
				"POSTGRES_PASSWORD_FILE=/run/secrets/pg",
			],
			Secrets: [{ SecretID: "s1", SecretName: "dokploy_postgres_password" }],
			Mounts: [
				{
					Type: "bind",
					Source: "/var/run/docker.sock",
					Target: "/var/run/docker.sock",
				},
				{ Type: "bind", Source: "/etc/dokploy", Target: "/etc/dokploy" },
			],
		},
		Networks: [{ Target: "dokploy-network" }],
		Placement: { Constraints: ["node.role==manager"] },
	},
	Mode: { Replicated: { Replicas: 1 } },
	EndpointSpec: { Ports: [{ TargetPort: 3000, PublishedPort: 3000 }] },
};

const notFound = () =>
	Object.assign(new Error("not found"), { statusCode: 404 });

const fakeDocker = (services: Record<string, unknown>) => {
	const created: unknown[] = [];
	const updated: unknown[] = [];
	const removed: string[] = [];
	const docker = {
		getService: (name: string) => ({
			inspect: async () => {
				if (!(name in services)) throw notFound();
				return services[name];
			},
			update: async (options: unknown) => {
				updated.push(options);
			},
			remove: async () => {
				removed.push(name);
			},
		}),
		createService: async (spec: unknown) => {
			created.push(spec);
		},
	} as unknown as Docker;
	return { docker, created, updated, removed };
};

describe("autoscaler service", () => {
	beforeEach(() => {
		delete process.env.DOKPLOY_AUTOSCALER;
	});
	afterEach(() => {
		delete process.env.DOKPLOY_AUTOSCALER;
	});

	it("runs Dokploy's image with its environment, secrets, mounts and network", () => {
		const spec = buildAutoscalerServiceSpec(dokploySpec as never);
		const task = spec.TaskTemplate as Task;
		const container = task.ContainerSpec;

		expect(spec.Name).toBe(AUTOSCALER_SERVICE);
		expect(container?.Image).toBe(dokploySpec.TaskTemplate.ContainerSpec.Image);
		expect(container?.Env).toEqual([
			...dokploySpec.TaskTemplate.ContainerSpec.Env,
			"AUTOSCALER_HEALTH_PORT=3100",
		]);
		expect(container?.Secrets).toEqual(
			dokploySpec.TaskTemplate.ContainerSpec.Secrets,
		);
		expect(container?.Mounts).toEqual(
			dokploySpec.TaskTemplate.ContainerSpec.Mounts,
		);
		expect(task.Networks).toEqual([{ Target: "dokploy-network" }]);
		expect(task.Placement).toEqual({
			Constraints: ["node.role==manager"],
		});
		expect(container?.Command?.join(" ")).toContain("dist/autoscaler.mjs");
		expect(container?.HealthCheck?.Test).toEqual([
			"CMD",
			"curl",
			"-fs",
			"http://127.0.0.1:3100/health",
		]);
		expect(spec.Mode).toEqual({ Replicated: { Replicas: 1 } });
		expect(spec).not.toHaveProperty("EndpointSpec");
	});

	it("creates it, leaves a matching one alone and updates a different one", async () => {
		const empty = fakeDocker({ dokploy: { Spec: dokploySpec } });
		await expect(ensureAutoscalerService(empty.docker)).resolves.toBe(
			"created",
		);
		expect(empty.created).toHaveLength(1);

		const spec = buildAutoscalerServiceSpec(dokploySpec as never);
		const same = fakeDocker({
			dokploy: { Spec: dokploySpec },
			[AUTOSCALER_SERVICE]: { Spec: spec, Version: { Index: 7 } },
		});
		await expect(ensureAutoscalerService(same.docker)).resolves.toBe(
			"unchanged",
		);

		const upgraded = {
			...dokploySpec,
			TaskTemplate: {
				...dokploySpec.TaskTemplate,
				ContainerSpec: {
					...dokploySpec.TaskTemplate.ContainerSpec,
					Image: "dokploy/dokploy:v2",
				},
			},
		};
		const stale = fakeDocker({
			dokploy: { Spec: upgraded },
			[AUTOSCALER_SERVICE]: { Spec: spec, Version: { Index: 7 } },
		});
		await expect(ensureAutoscalerService(stale.docker)).resolves.toBe(
			"updated",
		);
		expect(stale.updated[0]).toMatchObject({
			version: 7,
			TaskTemplate: {
				ContainerSpec: { Image: "dokploy/dokploy:v2" },
			},
		});
	});

	it("does nothing when Dokploy is not a swarm service", async () => {
		const none = fakeDocker({});
		await expect(ensureAutoscalerService(none.docker)).resolves.toBe("skipped");
		expect(none.created).toHaveLength(0);
	});

	it("removes it when turned off", async () => {
		process.env.DOKPLOY_AUTOSCALER = "off";
		const running = fakeDocker({
			dokploy: { Spec: dokploySpec },
			[AUTOSCALER_SERVICE]: { Spec: {}, Version: { Index: 1 } },
		});
		await expect(ensureAutoscalerService(running.docker)).resolves.toBe(
			"removed",
		);
		expect(running.removed).toEqual([AUTOSCALER_SERVICE]);
	});
});
