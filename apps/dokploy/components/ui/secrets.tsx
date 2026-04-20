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
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useFormContext } from "react-hook-form";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

interface Props {
	name: string;
	title: string;
	description: ReactNode;
	placeholder: string;
}

type ViewMode = "raw" | "rows";
type Row = { id: string; key: string; value: string };

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		rows.push({ id: createId(), key, value });
	}
	return rows;
};

const serializeRows = (rows: Row[]): string =>
	rows
		.filter((r) => r.key.trim() !== "")
		.map((r) => `${r.key.trim()}=${r.value}`)
		.join("\n");

const looksLikeEnvPaste = (text: string) => {
	if (!text.includes("=")) return false;
	if (/\r?\n/.test(text)) return true;
	return (text.match(/=/g) ?? []).length >= 1;
};

export const Secrets = (props: Props) => {
	const [isVisible, setIsVisible] = useState(true);
	const [viewMode, setViewMode] = useState<ViewMode>("raw");
	const [rows, setRows] = useState<Row[]>([]);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const lastSerializedRef = useRef<string>("");
	const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
	const form = useFormContext<Record<string, string>>();
	const fieldValue = form.watch(props.name) ?? "";

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
		if (fieldValue === lastSerializedRef.current) return;
		const parsed = parseEnv(fieldValue);
		setRows(parsed);
		lastSerializedRef.current = serializeRows(parsed);
	}, [fieldValue, viewMode]);

	const commitRows = (next: Row[]) => {
		setRows(next);
		const serialized = serializeRows(next);
		lastSerializedRef.current = serialized;
		form.setValue(props.name, serialized, {
			shouldDirty: true,
			shouldTouch: true,
		});
	};

	const handleKeyChange = (id: string, key: string) => {
		commitRows(rows.map((r) => (r.id === id ? { ...r, key } : r)));
	};

	const handleValueChange = (id: string, value: string) => {
		commitRows(rows.map((r) => (r.id === id ? { ...r, value } : r)));
	};

	const handleRemove = (id: string) => {
		commitRows(rows.filter((r) => r.id !== id));
	};

	const handleAdd = () => {
		commitRows([...rows, { id: createId(), key: "", value: "" }]);
	};

	const handleDragStart =
		(id: string) => (e: DragEvent<HTMLButtonElement>) => {
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
			if (!draggingId) return;
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
		<>
			<CardHeader className="flex flex-row w-full items-center justify-between px-0">
				<div>
					<CardTitle className="text-xl">{props.title}</CardTitle>
					<CardDescription>{props.description}</CardDescription>
				</div>

				<div className="flex items-center gap-2">
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
						pressed={isVisible}
						onPressedChange={setIsVisible}
					>
						{isVisible ? (
							<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
						) : (
							<EyeIcon className="h-4 w-4 text-muted-foreground" />
						)}
					</Toggle>
				</div>
			</CardHeader>
			<CardContent className="w-full space-y-4 p-0">
				{viewMode === "raw" ? (
					<FormField
						control={form.control}
						name={props.name}
						render={({ field }) => (
							<FormItem className="w-full">
								<FormControl>
									<CodeEditor
										style={
											{
												WebkitTextSecurity: isVisible ? "disc" : null,
											} as CSSProperties
										}
										language="properties"
										disabled={isVisible}
										lineWrapping
										placeholder={props.placeholder}
										className="h-96 font-mono"
										{...field}
									/>
								</FormControl>

								<FormMessage />
							</FormItem>
						)}
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
											draggable
											onDragStart={handleDragStart(row.id)}
											onDragEnd={handleDragEnd}
											aria-label="Drag to reorder"
											tabIndex={-1}
											className="flex h-10 w-6 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
										>
											<GripVerticalIcon className="h-4 w-4" />
										</button>
										<Input
											className="font-mono"
											placeholder="KEY"
											autoComplete="off"
											spellCheck={false}
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
											style={
												{
													WebkitTextSecurity: isVisible ? "disc" : null,
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
							className="w-full"
						>
							<PlusIcon className="mr-2 h-4 w-4" />
							Add variable
						</Button>
					</div>
				)}
			</CardContent>
		</>
	);
};
