import { describe, expect, it } from "vitest";
import { getPreviewDeploymentJobType } from "@/server/utils/preview-deployment-jobs";

describe("getPreviewDeploymentJobType", () => {
	it("uses deploy for a new preview deployment", () => {
		expect(getPreviewDeploymentJobType(false)).toBe("deploy");
	});

	it("uses redeploy for an existing preview deployment", () => {
		expect(getPreviewDeploymentJobType(true)).toBe("redeploy");
	});
});
