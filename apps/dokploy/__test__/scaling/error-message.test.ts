import { describe, expect, it } from "vitest";
import { readableErrorMessage } from "@/utils/error-message";

describe("readableErrorMessage", () => {
	it("prefers the first validation issue over the raw JSON message", () => {
		expect(
			readableErrorMessage(
				{
					message: '[{"code":"custom","path":["cpuReservation"]}]',
					data: {
						zodError: {
							formErrors: [],
							fieldErrors: {
								cpuReservation: ["CPU reservation cannot exceed the CPU limit"],
							},
						},
					},
				},
				"fallback",
			),
		).toBe("CPU reservation cannot exceed the CPU limit");
	});

	it("uses the message of other API errors", () => {
		expect(
			readableErrorMessage(
				{ message: "Only 2 of 4 replicas fit", data: { zodError: null } },
				"fallback",
			),
		).toBe("Only 2 of 4 replicas fit");
	});

	it("falls back when there is nothing readable", () => {
		expect(readableErrorMessage(undefined, "fallback")).toBe("fallback");
		expect(
			readableErrorMessage(
				{ message: "[]", data: { zodError: { fieldErrors: {} } } },
				"fallback",
			),
		).toBe("fallback");
	});
});
