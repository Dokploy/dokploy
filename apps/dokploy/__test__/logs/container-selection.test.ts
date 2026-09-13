import { describe, expect, it } from "vitest";
import { resolveContainerSelection } from "@/components/dashboard/docker/logs/utils";

const containers = [
	{ containerId: "first-container" },
	{ containerId: "selected-container" },
];

describe("resolveContainerSelection", () => {
	it("selects the first container when no container is selected", () => {
		expect(resolveContainerSelection(undefined, containers)).toBe(
			"first-container",
		);
	});

	it("preserves a manual selection when refreshed data contains it", () => {
		const refreshedContainers = containers.map((container) => ({
			...container,
		}));

		expect(
			resolveContainerSelection("selected-container", refreshedContainers),
		).toBe("selected-container");
	});

	it("falls back to the first container when the selection disappears", () => {
		expect(resolveContainerSelection("removed-container", containers)).toBe(
			"first-container",
		);
	});

	it("keeps the current selection while container data is loading", () => {
		expect(resolveContainerSelection("selected-container", undefined)).toBe(
			"selected-container",
		);
	});

	it("clears the selection when no containers are available", () => {
		expect(resolveContainerSelection("selected-container", [])).toBeUndefined();
	});
});
