import { describe, expect, it } from "vitest";
import { externalPortFormSchema } from "@/components/dashboard/shared/external-port-schema";

const parse = (input: unknown) =>
	externalPortFormSchema.safeParse({ externalPort: input });

const getPort = (data: unknown): unknown =>
	(data as { externalPort?: unknown } | null)?.externalPort;

describe("externalPort client preprocess (G7-G12)", () => {
	it("G7: empty string '' -> null (clearing revokes exposure, no client parse error)", () => {
		const result = parse("");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBeNull();
		}
	});

	it("G8: undefined -> null (DB row started with null, form submitted undefined)", () => {
		const result = parse(undefined);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBeNull();
		}
	});

	it("G8b: null -> null (passed through)", () => {
		const result = parse(null);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBeNull();
		}
	});

	it("G9 + G10: numeric string '3306' -> 3306 (unchanged numeric value re-saves)", () => {
		const result = parse("3306");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(3306);
		}
	});

	it("G9b: number 3306 -> 3306 (reset numeric value re-saves without z.string().parse(number) throw)", () => {
		const result = parse(3306);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(3306);
		}
	});

	it("boundaries: 0 -> 0 (valid, lowest port)", () => {
		const result = parse(0);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(0);
		}
	});

	it("boundaries: '0' -> 0", () => {
		const result = parse("0");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(0);
		}
	});

	it("boundaries: 65535 -> 65535 (valid, highest port)", () => {
		const result = parse(65535);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(65535);
		}
	});

	it("G11: 65536 -> rejected with 'Range must be 0 - 65535'", () => {
		const result = parse(65536);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain(
				"Range must be 0 - 65535",
			);
		}
	});

	it("G11b: -1 -> rejected with 'Range must be 0 - 65535'", () => {
		const result = parse(-1);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toContain(
				"Range must be 0 - 65535",
			);
		}
	});

	it("G11c: '99999' -> rejected", () => {
		const result = parse("99999");
		expect(result.success).toBe(false);
	});

	it("G12: non-numeric garbage 'abc' -> NaN maps to null (existing behavior preserved)", () => {
		const result = parse("abc");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBeNull();
		}
	});

	it("whitespace string '  12  ' -> NaN -> null (parseInt('  12  ')=12 but String then parseInt handles trim)", () => {
		const result = parse("  12  ");
		expect(result.success).toBe(true);
		if (result.success) {
			expect(getPort(result.data)).toBe(12);
		}
	});
});
