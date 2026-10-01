import { truncateErrorMessage } from "@dokploy/server/utils/notifications/build-error";
import { describe, expect, it } from "vitest";

describe("truncateErrorMessage", () => {
	it("returns the message unchanged when within the limit", () => {
		const message = "short build error";
		expect(truncateErrorMessage(message)).toBe(message);
	});

	it("returns the message unchanged when exactly at the limit", () => {
		const message = "x".repeat(800);
		expect(truncateErrorMessage(message)).toBe(message);
	});

	it("keeps the END of the message, not the start", () => {
		// The actual build error is at the bottom of the log; truncating from the
		// front would hide it.
		const startMarker = "TOP_OF_LOG_SHOULD_BE_DROPPED";
		const noise = "noise ".repeat(200); // pushes the start past the 800 limit
		const realError = "#5 ERROR: failed to build the application";
		const message = `${startMarker}${noise}${realError}`;

		const result = truncateErrorMessage(message);

		expect(result.length).toBeLessThanOrEqual(800 + 3); // "..." prefix
		expect(result).toContain(realError);
		expect(result).not.toContain(startMarker);
		expect(result.startsWith("...")).toBe(true);
	});

	it("respects a custom limit", () => {
		const message = "abcdefghij"; // 10 chars
		expect(truncateErrorMessage(message, 4)).toBe("...ghij");
	});
});
