import {
	CodeIcon,
	EyeIcon,
	EyeOffIcon,
	GripVerticalIcon,
	PlusIcon,
	Rows3Icon,
	Trash2Icon,
} from "lucide-react";
import {
	type ClipboardEvent,
	type CSSProperties,
	type DragEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type ViewMode = "raw" | "rows";
type Row = { id: string; key: string; value: string };

export interface EnvEditorProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	rawClassName?: string;
	className?: string;
}

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const unquoteDouble = (raw: string): string =>
	// Inside double quotes, backslash escapes `"` and `\` (and \n / \r / \t for convenience).
	raw.replace(/\\(["\\nrt])/g, (_match, ch: string) => {
		if (ch === "n") return "\n";
		if (ch === "r") return "\r";
		if (ch === "t") return "\t";
		return ch;
	});

const parseEnv = (text: string): Row[] => {
	if (!text) return [];
	const rows: Row[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) {
			rows.push({ id: createId(), key: trimmed, value: "" });
			continue;
		}
		let key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (key.startsWith("export ")) key = key.slice(7).trim();
		if (
			value.length >= 2 &&
			value.startsWith('"') &&
			value.endsWith('"')
		) {
			value = unquoteDouble(value.slice(1, -1));
		} else if (
			value.length >= 2 &&
			value.startsWith("'") &&
			value.endsWith("'")
		) {
			// POSIX-style single quotes: content is literal, no escape processing.
			value = value.slice(1, -1);
		}
		rows.push({ id: createId(), key, value });
	}
	return rows;
};

const needsQuoting = (value: string): boolean => {
	if (value === "") return false;
	// Quote whenever the value has whitespace, a leading/trailing space, a
	// comment marker, quotes, backslash, `$`, or backtick — anything a shell
	// or dotenv parser could reinterpret if left bare.
	if (/[\s#"'\\$`]/.test(value)) return true;
	if (value !== value.trim()) return true;
	return false;
};

const quoteValue = (value: string): string => {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r");
	return `"${escaped}"`;
};

const serializeRows = (rows: Row[]): string =>
	rows
		.filter((r) => r.key.trim() !== "")
		.map((r) => {
			const key = r.key.trim();
			const value = needsQuoting(r.value) ? quoteValue(r.value) : r.value;
			return `${key}=${value}`;
		})
		.join("\n");

const looksLikeEnvPaste = (text: string) => {
	if (!text.includes("=")) return false;
	return /\r?\n/.test(text);
};

export const EnvEditor = ({
	value,
	onChange,
	placeholder,
	disabled = false,
	rawClassName = "h-96",
	className,
}: EnvEditorProps) => {
	const [isObscured, setIsObscured] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>("raw");
	const [rows, setRows] = useState<Row[]>([]);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const lastSerializedRef = useRef<string>("");
	const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

	const setRowRef = useCallback(
		(id: string) => (el: HTMLDivElement | null) => {
			if (el) rowRefs.current.set(id, el);
			else rowRefs.current.delete(id);
		},
		[],
	);

	useLayoutEffect(() => {
		if (viewMode !== "rows") {
			prevRectsRef.current.clear();
			return;
		}
		const prev = prevRectsRef.current;
		const next = new Map<string, DOMRect>();
		rowRefs.current.forEach((el, id) => {
			next.set(id, el.getBoundingClientRect());
		});
		prev.forEach((prevRect, id) => {
			const nextRect = next.get(id);
			const el = rowRefs.current.get(id);
			if (!el || !nextRect) return;
			const dy = prevRect.top - nextRect.top;
			if (Math.abs(dy) < 0.5) return;
			el.style.transition = "none";
			el.style.transform = `translateY(${dy}px)`;
			requestAnimationFrame(() => {
				el.style.transition =
					"transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
				el.style.transform = "";
			});
		});
		prevRectsRef.current = next;
	}, [rows, viewMode]);

	useEffect(() => {
		if (viewMode !== "rows") return;
		if (value === lastSerializedRef.current) return;
		const parsed = parseEnv(value);
		setRows(parsed);
		lastSerializedRef.current = serializeRows(parsed);
	}, [value, viewMode]);

	const commitRows = (next: Row[]) => {
		setRows(next);
		const serialized = serializeRows(next);
		lastSerializedRef.current = serialized;
		onChange(serialized);
	};

	const handleKeyChange = (id: string, key: string) => {
		commitRows(rows.map((r) => (r.id === id ? { ...r, key } : r)));
	};

	const handleValueChange = (id: string, nextValue: string) => {
		commitRows(rows.map((r) => (r.id === id ? { ...r, value: nextValue } : r)));
	};

	const handleRemove = (id: string) => {
		commitRows(rows.filter((r) => r.id !== id));
	};

	const handleAdd = () => {
		commitRows([...rows, { id: createId(), key: "", value: "" }]);
	};

	const handleDragStart =
		(id: string) => (e: DragEvent<HTMLButtonElement>) => {
			if (disabled) return;
			setDraggingId(id);
			e.dataTransfer.effectAllowed = "move";
			try {
				e.dataTransfer.setData("text/plain", id);
			} catch {
				// Safari can throw in rare cases; the drag still works.
			}
		};

	const handleDragEnd = () => setDraggingId(null);

	const handleDragOver =
		(id: string) => (e: DragEvent<HTMLDivElement>) => {
			if (!draggingId || disabled) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			if (draggingId === id) return;
			const rect = e.currentTarget.getBoundingClientRect();
			const isAbove = e.clientY < rect.top + rect.height / 2;
			const fromIdx = rows.findIndex((r) => r.id === draggingId);
			const targetIdx = rows.findIndex((r) => r.id === id);
			if (fromIdx === -1 || targetIdx === -1) return;
			let newIdx = isAbove ? targetIdx : targetIdx + 1;
			if (fromIdx < newIdx) newIdx -= 1;
			if (fromIdx === newIdx) return;
			const next = [...rows];
			const [moved] = next.splice(fromIdx, 1);
			if (!moved) return;
			next.splice(newIdx, 0, moved);
			commitRows(next);
		};

	const handlePaste = (id: string, e: ClipboardEvent<HTMLInputElement>) => {
		if (disabled) return;
		const text = e.clipboardData.getData("text");
		if (!looksLikeEnvPaste(text)) return;
		const parsed = parseEnv(text);
		if (parsed.length === 0) return;
		e.preventDefault();

		// Collapse duplicates within the pasted content (last occurrence wins).
		const incomingByKey = new Map<string, Row>();
		for (const row of parsed) {
			incomingByKey.set(row.key.trim(), row);
		}

		const idx = rows.findIndex((r) => r.id === id);
		const target = rows[idx];
		const isTargetEmpty =
			target && target.key.trim() === "" && target.value === "";
		const base = isTargetEmpty
			? [...rows.slice(0, idx), ...rows.slice(idx + 1)]
			: [...rows];

		// Merge: overwrite existing rows with matching keys, append the rest.
		const result = base.map((r) => ({ ...r }));
		for (const incoming of incomingByKey.values()) {
			const key = incoming.key.trim();
			if (!key) continue;
			const existingIdx = result.findIndex((r) => r.key.trim() === key);
			const existing = existingIdx >= 0 ? result[existingIdx] : undefined;
			if (existing) {
				result[existingIdx] = {
					id: existing.id,
					key: existing.key,
					value: incoming.value,
				};
			} else {
				result.push(incoming);
			}
		}
		commitRows(result);
	};

	return (
		<div className={cn("flex w-full flex-col gap-3", className)}>
			<div className="flex items-center justify-end gap-2">
				<div
					className="inline-flex items-center rounded-md border border-input p-0.5"
					role="radiogroup"
					aria-label="Editor view"
				>
					<button
						type="button"
						role="radio"
						aria-checked={viewMode === "raw"}
						aria-label="Raw editor"
						onClick={() => setViewMode("raw")}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
							viewMode === "raw"
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-muted",
						)}
					>
						<CodeIcon className="h-4 w-4" />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={viewMode === "rows"}
						aria-label="Rows editor"
						onClick={() => setViewMode("rows")}
						className={cn(
							"flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
							viewMode === "rows"
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:bg-muted",
						)}
					>
						<Rows3Icon className="h-4 w-4" />
					</button>
				</div>
				<Toggle
					aria-label="Toggle value visibility"
					pressed={isObscured}
					onPressedChange={setIsObscured}
				>
					{isObscured ? (
						<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
					) : (
						<EyeIcon className="h-4 w-4 text-muted-foreground" />
					)}
				</Toggle>
			</div>

			{viewMode === "raw" ? (
				<CodeEditor
					style={
						{
							WebkitTextSecurity: isObscured ? "disc" : null,
						} as CSSProperties
					}
					language="properties"
					disabled={isObscured || disabled}
					lineWrapping
					placeholder={placeholder}
					className={cn("font-mono", rawClassName)}
					value={value}
					onChange={(next) => onChange(next)}
				/>
			) : (
				<div className="space-y-2">
					{rows.length === 0 ? (
						<div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
							No variables yet. Add one below, or paste an .env file into a
							row to import multiple at once.
						</div>
					) : (
						<div className="space-y-2">
							{rows.map((row) => (
								<div
									key={row.id}
									ref={setRowRef(row.id)}
									onDragOver={handleDragOver(row.id)}
									className={cn(
										"grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 will-change-transform",
										draggingId === row.id && "opacity-40",
									)}
								>
									<button
										type="button"
										draggable={!disabled}
										onDragStart={handleDragStart(row.id)}
										onDragEnd={handleDragEnd}
										aria-label="Drag to reorder"
										tabIndex={-1}
										disabled={disabled}
										className="flex h-10 w-6 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
									>
										<GripVerticalIcon className="h-4 w-4" />
									</button>
									<Input
										className="font-mono"
										placeholder="KEY"
										autoComplete="off"
										spellCheck={false}
										readOnly={disabled}
										value={row.key}
										onChange={(e) =>
											handleKeyChange(row.id, e.target.value)
										}
										onPaste={(e) => handlePaste(row.id, e)}
									/>
									<Input
										className="font-mono"
										placeholder="VALUE"
										autoComplete="off"
										spellCheck={false}
										readOnly={disabled}
										style={
											{
												WebkitTextSecurity: isObscured ? "disc" : null,
											} as CSSProperties
										}
										value={row.value}
										onChange={(e) =>
											handleValueChange(row.id, e.target.value)
										}
										onPaste={(e) => handlePaste(row.id, e)}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Remove variable"
										disabled={disabled}
										onClick={() => handleRemove(row.id)}
									>
										<Trash2Icon className="h-4 w-4 text-muted-foreground" />
									</Button>
								</div>
							))}
						</div>
					)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleAdd}
						disabled={disabled}
						className="w-full"
					>
						<PlusIcon className="mr-2 h-4 w-4" />
						Add variable
					</Button>
				</div>
			)}
		</div>
	);
};
