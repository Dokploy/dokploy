import copy from "copy-to-clipboard";
import { toast } from "sonner";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { copyToClipboard } from "@/components/shared/copy-input";

vi.mock("copy-to-clipboard", () => ({ default: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("copyToClipboard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("copies the value to the clipboard", () => {
		copyToClipboard("admin");
		expect(copy).toHaveBeenCalledWith("admin");
	});

	test("shows a success toast", () => {
		copyToClipboard("admin");
		expect(toast.success).toHaveBeenCalledWith("Value is copied to clipboard");
	});

	test("returns the copied value", () => {
		expect(copyToClipboard("admin")).toBe("admin");
	});

	test("falls back to an empty string for undefined", () => {
		expect(copyToClipboard(undefined)).toBe("");
		expect(copy).toHaveBeenCalledWith("");
	});
});
