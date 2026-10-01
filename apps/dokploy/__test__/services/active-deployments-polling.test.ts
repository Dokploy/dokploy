import { describe, expect, it } from "vitest";
import {
	activeDeploymentPollInterval,
	changesDeploymentStatus,
} from "@/utils/active-deployments";

describe("active deployment refresh policy", () => {
	it("backs off when idle and bounds active polling", () => {
		expect(activeDeploymentPollInterval(0)).toBe(60_000);
		expect(activeDeploymentPollInterval(1)).toBe(15_000);
		expect(activeDeploymentPollInterval(100)).toBe(15_000);
	});
	it.each([
		"application",
		"compose",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"libsql",
	])("refreshes after %s deployment actions", (router) => {
		expect(changesDeploymentStatus([[router, "deploy"]])).toBe(true);
		expect(changesDeploymentStatus([[router, "remove"]])).toBe(true);
		expect(changesDeploymentStatus([[router, "update"]])).toBe(false);
	});
	it("ignores unrelated and malformed mutations", () => {
		expect(changesDeploymentStatus(undefined)).toBe(false);
		expect(changesDeploymentStatus(["application.deploy"])).toBe(false);
		expect(changesDeploymentStatus([["user", "update"]])).toBe(false);
		expect(changesDeploymentStatus([["application", "cleanQueues"]])).toBe(
			true,
		);
	});
});
