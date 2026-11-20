import { apiDeleteCompose } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("apiDeleteCompose", () => {
	it("defaults deleteVolumes to false when omitted", () => {
		const result = apiDeleteCompose.parse({ composeId: "compose-1" });
		expect(result.deleteVolumes).toBe(false);
	});

	it("keeps an explicit deleteVolumes value", () => {
		const result = apiDeleteCompose.parse({
			composeId: "compose-1",
			deleteVolumes: true,
		});
		expect(result.deleteVolumes).toBe(true);
	});
});
