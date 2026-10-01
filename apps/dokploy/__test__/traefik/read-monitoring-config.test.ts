import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMonitoringConfig } from "@dokploy/server/utils/traefik/application";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "access-log-"));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({ ...actual.paths(), DYNAMIC_TRAEFIK_PATH: dir }),
	};
});

describe("readMonitoringConfig", () => {
	beforeAll(() => {
		const lines = [];
		for (let i = 0; i < 600; i++) {
			lines.push(JSON.stringify({ n: i, ServiceName: "app@docker" }));
		}
		lines.push(JSON.stringify({ n: 600, ServiceName: "dokploy-service-app@file" }));
		fs.writeFileSync(path.join(dir, "access.log"), `${lines.join("\n")}\n`);
	});
	afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

	it("returns the 500 most recent valid entries", async () => {
		const out = (await readMonitoringConfig()) as string;
		const logs = out.trim().split("\n").map((l) => JSON.parse(l));
		expect(logs).toHaveLength(500);
		expect(logs[0].n).toBe(100);
		expect(logs[499].n).toBe(599);
	});
});
