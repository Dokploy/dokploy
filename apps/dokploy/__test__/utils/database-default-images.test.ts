import { describe, expect, it } from "vitest";
import { dockerImageDefaultPlaceholder } from "@/components/dashboard/project/database-default-images";

describe("dockerImageDefaultPlaceholder", () => {
	it("uses redis 8 as the default redis image", () => {
		expect(dockerImageDefaultPlaceholder.redis).toBe("redis:8");
	});
});
