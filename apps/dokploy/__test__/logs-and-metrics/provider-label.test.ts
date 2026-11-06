import { describe, expect, it } from "vitest";
import { providerLabel } from "@/components/dashboard/settings/logs-and-metrics/show-servers";

describe("providerLabel", () => {
	it("names what the provider sends next to its name", () => {
		expect(providerLabel({ name: "Loki prod", signals: ["logs"] })).toBe(
			"Loki prod (logs)",
		);
		expect(providerLabel({ name: "Splunk", signals: ["metrics"] })).toBe(
			"Splunk (metrics)",
		);
		expect(
			providerLabel({ name: "Datadog", signals: ["logs", "metrics"] }),
		).toBe("Datadog (logs and metrics)");
	});
});
