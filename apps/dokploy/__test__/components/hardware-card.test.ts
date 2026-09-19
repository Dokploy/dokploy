import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HardwareCard } from "@/components/dashboard/docker/health/hardware-card";
import type { RouterOutputs } from "@/utils/api";

type Hardware = RouterOutputs["docker"]["getServerHardware"];
const base: Hardware = {
	checkedAt: "2026-09-19T00:00:00Z",
	architecture: "aarch64",
	gpu: {
		detection: "unavailable",
		unavailableReason: "nvidia-smi-not-found",
		devices: [],
	},
};
const render = (
	hardware: Hardware | undefined,
	isFetching = false,
	serverId?: string,
) =>
	renderToStaticMarkup(
		createElement(HardwareCard, {
			hardware,
			isFetching,
			hasError: false,
			serverId,
		}),
	);

describe("hardware card", () => {
	it("shows a loading state when the initial request is pending", () => {
		expect(render(undefined, true)).toContain('role="status"');
	});
	it("explains local GPU visibility when NVIDIA tooling is missing", () => {
		const html = render(base);
		expect(html).toContain("Dokploy container");
		expect(html).toContain("aarch64");
		expect(html).not.toContain("No NVIDIA GPUs reported");
	});
	it("describes the remote host when a server is selected", () => {
		const html = render(base, false, "remote");
		expect(html).toContain("on this server");
		expect(html).not.toContain("Dokploy container");
	});
	it("distinguishes a successful empty inventory from failed detection", () => {
		expect(
			render({ ...base, gpu: { detection: "available", devices: [] } }),
		).toContain("No NVIDIA GPUs reported");
	});
	it("preserves successful GPU fields and unknown values when a probe partially fails", () => {
		const html = render({
			...base,
			architecture: null,
			error: "probe failed",
			gpu: {
				detection: "available",
				devices: [
					{
						index: 0,
						uuid: "GPU-a",
						name: "NVIDIA T4",
						vendor: "nvidia",
						computeCapability: null,
						memoryTotalMiB: 15360,
						memoryFreeMiB: 0,
						driverVersion: "575",
					},
				],
			},
		});
		expect(html).toContain('role="alert"');
		expect(html).toContain("NVIDIA T4");
		expect(html).toContain("0 MiB free");
		expect(html).toContain("Unknown");
	});
	it("keeps cached facts with a refresh error", () => {
		const html = renderToStaticMarkup(
			createElement(HardwareCard, {
				hardware: base,
				isFetching: false,
				hasError: true,
			}),
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("aarch64");
	});
});
