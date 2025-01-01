import { describe, it, expect, beforeEach } from "vitest";
import {
	shouldMonitorContainer,
	getContainerConfig,
} from "../src/containers/config";

describe("Container monitoring", () => {
	beforeEach(() => {
		// Reset process.env before each test
		process.env.CONTAINER_MONITORING_CONFIG = "";
	});

	describe("shouldMonitorContainer", () => {
		it("should match exact container names", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [{ appName: "dokploy-postgres", maxFileSizeMB: 15 }],
				excludeServices: [],
			});

			expect(
				shouldMonitorContainer("dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn"),
			).toBe(true);
			expect(shouldMonitorContainer("testing-postgres-123")).toBe(false);
		});

		it("should handle multiple postgres instances correctly", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [{ appName: "postgres", maxFileSizeMB: 15 }],
				excludeServices: [],
			});

			// Este test demuestra el bug actual:
			// Al usar 'postgres' como appName, coincide con cualquier contenedor que tenga 'postgres' en su nombre
			expect(
				shouldMonitorContainer("dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn"),
			).toBe(false); // debería ser false
			expect(
				shouldMonitorContainer("testing-plausible-9cc9fd-plausible_db-1"),
			).toBe(false);
			expect(
				shouldMonitorContainer(
					"testing-fdghdfgh-pukqqe.1.31mn5ve9qs2xmdadahwtl659r",
				),
			).toBe(false);
		});

		it("should handle compose project monitoring", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [
					{ appName: "testing-plausible-9cc9fd", maxFileSizeMB: 15 },
				],
				excludeServices: [],
			});

			// Debería coincidir con todos los contenedores del proyecto compose
			expect(
				shouldMonitorContainer("testing-plausible-9cc9fd-plausible-1"),
			).toBe(true);
			expect(
				shouldMonitorContainer("testing-plausible-9cc9fd-plausible_db-1"),
			).toBe(true);
			expect(
				shouldMonitorContainer(
					"testing-plausible-9cc9fd-plausible_events_db-1",
				),
			).toBe(true);
			expect(
				shouldMonitorContainer("dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn"),
			).toBe(false);
		});

		it("should handle service replicas", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [
					{ appName: "testing-testing-1cosrk", maxFileSizeMB: 15 },
				],
				excludeServices: [],
			});

			// Ambas réplicas deberían coincidir
			expect(
				shouldMonitorContainer(
					"testing-testing-1cosrk.1.klqzvggx7382en2itijsvd199",
				),
			).toBe(true);
			expect(
				shouldMonitorContainer(
					"testing-testing-1cosrk.2.piajmzb7v7uclfdgz8lar4wbw",
				),
			).toBe(true);
		});

		it("should handle docker swarm services", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [{ appName: "dokploy-traefik", maxFileSizeMB: 15 }],
				excludeServices: [],
			});

			expect(
				shouldMonitorContainer("dokploy-traefik.1.u3uplxcs58rjiv4s4ty7gfidz"),
			).toBe(true);
			expect(shouldMonitorContainer("other-traefik.1.xyz")).toBe(false);
		});

		it("should handle specific service monitoring", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [
					{ appName: "testing-plausible-9cc9fd", maxFileSizeMB: 15 },
				],
				excludeServices: [],
			});

			// Debería coincidir con todos los contenedores del servicio plausible
			expect(
				shouldMonitorContainer("testing-plausible-9cc9fd-plausible-1"),
			).toBe(true);
			expect(
				shouldMonitorContainer("testing-plausible-9cc9fd-plausible_db-1"),
			).toBe(true);
			expect(
				shouldMonitorContainer(
					"testing-plausible-9cc9fd-plausible_events_db-1",
				),
			).toBe(true);
			expect(
				shouldMonitorContainer("dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn"),
			).toBe(false);
		});

		it("should handle docker compose service replicas", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [
					{ appName: "testing-testing-1cosrk", maxFileSizeMB: 15 },
				],
				excludeServices: [],
			});

			// Ambas réplicas deberían coincidir
			expect(
				shouldMonitorContainer(
					"testing-testing-1cosrk.1.klqzvggx7382en2itijsvd199",
				),
			).toBe(true);
			expect(
				shouldMonitorContainer(
					"testing-testing-1cosrk.2.piajmzb7v7uclfdgz8lar4wbw",
				),
			).toBe(true);
		});
	});

	describe("getContainerConfig", () => {
		it("should return correct config for matched container", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [{ appName: "dokploy-postgres", maxFileSizeMB: 15 }],
				excludeServices: [],
			});

			const config = getContainerConfig(
				"dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn",
			);
			expect(config).toEqual({
				appName: "dokploy-postgres",
				maxFileSizeMB: 15,
			});
		});

		it("should return default config for non-matched container", () => {
			process.env.CONTAINER_MONITORING_CONFIG = JSON.stringify({
				includeServices: [{ appName: "dokploy-postgres", maxFileSizeMB: 15 }],
				excludeServices: [],
			});

			const config = getContainerConfig("some-other-container");
			expect(config).toEqual({ appName: "*", maxFileSizeMB: 10 });
		});
	});
});
