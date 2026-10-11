import type { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	copyToClipboard,
	handleTerminalKeyDown,
	isCopyEvent,
	isMacOsAltKeyEvent,
	setupTerminalKeyboard,
	type TerminalSelectionTarget,
} from "@/lib/terminal-keyboard";

describe("Terminal Keyboard Handler", () => {
	let originalNavigator: unknown;
	let originalDocument: unknown;
	let mockClipboard: {
		writeText: ReturnType<typeof vi.fn>;
		readText?: ReturnType<typeof vi.fn>;
	};
	let mockDocument: {
		createElement: ReturnType<typeof vi.fn>;
		body: {
			appendChild: ReturnType<typeof vi.fn>;
			removeChild: ReturnType<typeof vi.fn>;
		};
		execCommand: ReturnType<typeof vi.fn>;
	};

	const createMockTerminal = (
		selection = "",
		hasSelection = Boolean(selection),
	): TerminalSelectionTarget & {
		attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
	} => ({
		hasSelection: vi.fn(() => hasSelection),
		getSelection: vi.fn(() => selection),
		input: vi.fn(),
		focus: vi.fn(),
		attachCustomKeyEventHandler: vi.fn(),
	});

	const createKeyboardEvent = (
		options: Partial<KeyboardEvent> = {},
	): KeyboardEvent => {
		return {
			type: "keydown",
			key: "",
			code: "",
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			metaKey: false,
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
			...options,
		} as unknown as KeyboardEvent;
	};

	beforeEach(() => {
		originalNavigator = global.navigator;
		originalDocument = global.document;

		mockClipboard = {
			writeText: vi.fn().mockResolvedValue(undefined),
		};

		const textareaMock = {
			value: "",
			style: {} as Record<string, string>,
			focus: vi.fn(),
			select: vi.fn(),
			setAttribute: vi.fn(),
		};

		mockDocument = {
			createElement: vi.fn(() => textareaMock),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
			execCommand: vi.fn().mockReturnValue(true),
		};

		Object.defineProperty(global, "navigator", {
			value: {
				platform: "Linux x86_64",
				clipboard: mockClipboard,
			},
			configurable: true,
			writable: true,
		});

		Object.defineProperty(global, "document", {
			value: mockDocument,
			configurable: true,
			writable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(global, "navigator", {
			value: originalNavigator,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(global, "document", {
			value: originalDocument,
			configurable: true,
			writable: true,
		});
		vi.restoreAllMocks();
	});

	it("Test 1: Ctrl+C with active selection copies selected text to clipboard via navigator.clipboard.writeText and returns false", () => {
		const term = createMockTerminal("echo hello world", true);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
		});

		expect(isCopyEvent(event)).toBe(true);

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.writeText).toHaveBeenCalledWith("echo hello world");
	});

	it("Test 1b: Ctrl+C key-repeat with active selection suppresses SIGINT and does not duplicate clipboard write", () => {
		const term = createMockTerminal("echo hello world", true);
		const repeatEvent = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
			repeat: true,
		});

		const result = handleTerminalKeyDown(repeatEvent, term);

		expect(result).toBe(false);
		expect(repeatEvent.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	it("Test 2: Ctrl+C with NO selection returns true (allows SIGINT to pass to xterm/shell)", () => {
		const term = createMockTerminal("", false);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(true);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	it("Test 3: Ctrl+Insert with active selection copies selected text to clipboard and returns false", () => {
		const term = createMockTerminal("docker ps -a", true);
		const event = createKeyboardEvent({
			key: "Insert",
			code: "Insert",
			ctrlKey: true,
		});

		expect(isCopyEvent(event)).toBe(true);

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.writeText).toHaveBeenCalledWith("docker ps -a");
	});

	it("Test 4: Ctrl+Insert with NO selection returns true", () => {
		const term = createMockTerminal("", false);
		const event = createKeyboardEvent({
			key: "Insert",
			code: "Insert",
			ctrlKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(true);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	it("Test 4b: Ctrl+Shift+C with active selection copies selected text and returns false", () => {
		const term = createMockTerminal("git status", true);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
			shiftKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.writeText).toHaveBeenCalledWith("git status");
	});

	it("Test 4c: Ctrl+Shift+C with NO selection returns false and prevents default to block browser DevTools", () => {
		const term = createMockTerminal("", false);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
			shiftKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	it("Test 4d: Shift+Insert reads clipboard and pastes into terminal", async () => {
		mockClipboard.readText = vi.fn().mockResolvedValue("pasted command");
		const term = {
			...createMockTerminal("", false),
			paste: vi.fn(),
		};
		const event = createKeyboardEvent({
			key: "Insert",
			code: "Insert",
			shiftKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		expect(mockClipboard.readText).toHaveBeenCalledTimes(1);
		expect(term.paste).toHaveBeenCalledWith("pasted command");
	});

	it("Test 4e: Shift+Insert keyup event returns true and does not paste", () => {
		mockClipboard.readText = vi.fn().mockResolvedValue("pasted command");
		const term = {
			...createMockTerminal("", false),
			paste: vi.fn(),
		};
		const event = createKeyboardEvent({
			type: "keyup",
			key: "Insert",
			code: "Insert",
			shiftKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(true);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(mockClipboard.readText).not.toHaveBeenCalled();
		expect(term.paste).not.toHaveBeenCalled();
	});

	it("Test 4f: Shift+Insert key-repeat suppresses repeated paste calls", () => {
		mockClipboard.readText = vi.fn().mockResolvedValue("pasted command");
		const term = {
			...createMockTerminal("", false),
			paste: vi.fn(),
		};
		const event = createKeyboardEvent({
			key: "Insert",
			code: "Insert",
			shiftKey: true,
			repeat: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(false);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(mockClipboard.readText).not.toHaveBeenCalled();
		expect(term.paste).not.toHaveBeenCalled();
	});

	it("Test 5: macOS Cmd+C is not intercepted and returns true (leaving native macOS copy intact)", () => {
		Object.defineProperty(global, "navigator", {
			value: {
				platform: "MacIntel",
				clipboard: mockClipboard,
			},
			configurable: true,
			writable: true,
		});

		const term = createMockTerminal("npm run dev", true);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			metaKey: true,
			ctrlKey: false,
		});

		expect(isCopyEvent(event)).toBe(false);

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(true);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	it("Test 5b: macOS Ctrl+C with active selection returns true (allowing SIGINT to pass to shell without intercepting)", () => {
		Object.defineProperty(global, "navigator", {
			value: {
				platform: "MacIntel",
				clipboard: mockClipboard,
			},
			configurable: true,
			writable: true,
		});

		const term = createMockTerminal("ping 8.8.8.8", true);
		const event = createKeyboardEvent({
			key: "c",
			code: "KeyC",
			ctrlKey: true,
		});

		const result = handleTerminalKeyDown(event, term);

		expect(result).toBe(true);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});

	describe("Test 6: Fallback to document.execCommand('copy')", () => {
		it("falls back to document.execCommand('copy') when navigator.clipboard is unavailable", async () => {
			Object.defineProperty(global, "navigator", {
				value: {
					platform: "Linux x86_64",
					clipboard: undefined,
				},
				configurable: true,
				writable: true,
			});

			const term = createMockTerminal("systemctl restart nginx", true);
			const event = createKeyboardEvent({
				key: "c",
				code: "KeyC",
				ctrlKey: true,
			});

			const result = handleTerminalKeyDown(event, term);
			await Promise.resolve();

			expect(result).toBe(false);
			expect(event.preventDefault).toHaveBeenCalledTimes(1);
			expect(mockDocument.createElement).toHaveBeenCalledWith("textarea");
			expect(mockDocument.execCommand).toHaveBeenCalledWith("copy");
			expect(mockDocument.body.appendChild).toHaveBeenCalled();
			expect(mockDocument.body.removeChild).toHaveBeenCalled();
			expect(term.focus).toHaveBeenCalledTimes(1);
		});

		it("falls back to document.execCommand('copy') when navigator.clipboard.writeText rejects", async () => {
			mockClipboard.writeText.mockRejectedValue(
				new Error("Clipboard permission denied"),
			);

			const success = await copyToClipboard("curl https://api.dokploy.com");

			expect(mockClipboard.writeText).toHaveBeenCalledWith(
				"curl https://api.dokploy.com",
			);
			expect(mockDocument.createElement).toHaveBeenCalledWith("textarea");
			expect(mockDocument.execCommand).toHaveBeenCalledWith("copy");
			expect(success).toBe(true);
		});

		it("ensures textarea element cleanup in finally block even if document.execCommand throws", async () => {
			Object.defineProperty(global, "navigator", {
				value: {
					platform: "Linux x86_64",
					clipboard: undefined,
				},
				configurable: true,
				writable: true,
			});
			mockDocument.execCommand.mockImplementation(() => {
				throw new Error("DOMException: execCommand failed");
			});

			const term = createMockTerminal("test error cleanup", true);
			const success = await copyToClipboard("test error cleanup", term);

			expect(success).toBe(false);
			expect(mockDocument.body.appendChild).toHaveBeenCalled();
			expect(mockDocument.body.removeChild).toHaveBeenCalled();
			expect(term.focus).toHaveBeenCalledTimes(1);
		});
	});

	describe("Test 7: Preserves macOS Alt key handling on Darwin/Mac platforms", () => {
		it("intercepts single-character Option/Alt key and inputs to term on macOS", () => {
			Object.defineProperty(global, "navigator", {
				value: {
					platform: "MacIntel",
					clipboard: mockClipboard,
				},
				configurable: true,
				writable: true,
			});

			const term = createMockTerminal();
			const event = createKeyboardEvent({
				key: "@",
				altKey: true,
				ctrlKey: false,
				metaKey: false,
			});

			expect(isMacOsAltKeyEvent(event)).toBe(true);

			const result = handleTerminalKeyDown(event, term);

			expect(result).toBe(false);
			expect(event.preventDefault).toHaveBeenCalledTimes(1);
			expect(term.input).toHaveBeenCalledWith("@");
		});

		it("does not intercept Alt key combinations on non-Mac platforms (Linux/Windows)", () => {
			Object.defineProperty(global, "navigator", {
				value: {
					platform: "Linux x86_64",
					clipboard: mockClipboard,
				},
				configurable: true,
				writable: true,
			});

			const term = createMockTerminal();
			const event = createKeyboardEvent({
				key: "l",
				altKey: true,
				ctrlKey: false,
				metaKey: false,
			});

			expect(isMacOsAltKeyEvent(event)).toBe(false);

			const result = handleTerminalKeyDown(event, term);

			expect(result).toBe(true);
			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(term.input).not.toHaveBeenCalled();
		});
	});

	describe("Test 8: Does not interfere with normal key typing, enter, tab, arrow keys, backspace", () => {
		const regularKeys = [
			{ name: "normal character 'a'", key: "a" },
			{ name: "number '1'", key: "1" },
			{ name: "symbol '$'", key: "$" },
			{ name: "Enter", key: "Enter" },
			{ name: "Tab", key: "Tab" },
			{ name: "ArrowUp", key: "ArrowUp" },
			{ name: "ArrowDown", key: "ArrowDown" },
			{ name: "ArrowLeft", key: "ArrowLeft" },
			{ name: "ArrowRight", key: "ArrowRight" },
			{ name: "Backspace", key: "Backspace" },
			{ name: "Ctrl+D (EOF/exit)", key: "d", ctrlKey: true },
			{ name: "Ctrl+Z (suspend)", key: "z", ctrlKey: true },
			{ name: "Ctrl+L (clear)", key: "l", ctrlKey: true },
			{ name: "Ctrl+R (reverse search)", key: "r", ctrlKey: true },
		];

		for (const testCase of regularKeys) {
			it(`allows ${testCase.name} to pass through untouched`, () => {
				const term = createMockTerminal("existing selection", true);
				const event = createKeyboardEvent({
					key: testCase.key,
					ctrlKey: testCase.ctrlKey || false,
				});

				const result = handleTerminalKeyDown(event, term);

				expect(result).toBe(true);
				expect(event.preventDefault).not.toHaveBeenCalled();
				expect(mockClipboard.writeText).not.toHaveBeenCalled();
			});
		}
	});

	describe("setupTerminalKeyboard integration", () => {
		it("attaches the custom key event handler to the terminal instance", () => {
			const term = {
				attachCustomKeyEventHandler: vi.fn(),
				hasSelection: vi.fn(() => false),
				getSelection: vi.fn(() => ""),
				input: vi.fn(),
			} as unknown as Terminal;

			setupTerminalKeyboard(term);

			expect(term.attachCustomKeyEventHandler).toHaveBeenCalledTimes(1);
			expect(term.attachCustomKeyEventHandler).toHaveBeenCalledWith(
				expect.any(Function),
			);
		});
	});
});
