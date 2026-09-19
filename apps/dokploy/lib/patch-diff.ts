export type DiffHunk =
	| {
			type: "equal";
			originalStart: number;
			currentStart: number;
			originalLines: string[];
			currentLines: string[];
	  }
	| {
			type: "insert";
			originalStart: number;
			currentStart: number;
			currentLines: string[];
	  }
	| {
			type: "delete";
			originalStart: number;
			currentStart: number;
			originalLines: string[];
	  }
	| {
			type: "replace";
			originalStart: number;
			currentStart: number;
			originalLines: string[];
			currentLines: string[];
	  };

type DiffOp = {
	type: "equal" | "insert" | "delete";
	originalLines: string[];
	currentLines: string[];
};

const MAX_MATRIX_CELLS = 40_000;

const splitLines = (content: string) => content.split("\n");

const trimCommonEdges = (originalLines: string[], currentLines: string[]) => {
	let prefix = 0;
	while (
		prefix < originalLines.length &&
		prefix < currentLines.length &&
		originalLines[prefix] === currentLines[prefix]
	) {
		prefix += 1;
	}

	let originalSuffix = originalLines.length - 1;
	let currentSuffix = currentLines.length - 1;
	while (
		originalSuffix >= prefix &&
		currentSuffix >= prefix &&
		originalLines[originalSuffix] === currentLines[currentSuffix]
	) {
		originalSuffix -= 1;
		currentSuffix -= 1;
	}

	return {
		prefix,
		originalMiddle: originalLines.slice(prefix, originalSuffix + 1),
		currentMiddle: currentLines.slice(prefix, currentSuffix + 1),
		suffixOriginalStart: originalSuffix + 1,
		suffixCurrentStart: currentSuffix + 1,
	};
};

const pushOp = (
	ops: DiffOp[],
	type: DiffOp["type"],
	line: string,
	target: "originalLines" | "currentLines",
) => {
	const previous = ops.at(-1);
	if (previous?.type === type) {
		previous[target].push(line);
		return;
	}
	ops.push({
		type,
		originalLines: target === "originalLines" ? [line] : [],
		currentLines: target === "currentLines" ? [line] : [],
	});
};

const diffMiddle = (originalLines: string[], currentLines: string[]) => {
	if (originalLines.length === 0 && currentLines.length === 0) {
		return [] as DiffOp[];
	}

	if (originalLines.length * currentLines.length > MAX_MATRIX_CELLS) {
		const ops: DiffOp[] = [];
		if (originalLines.length > 0) {
			ops.push({
				type: "delete",
				originalLines,
				currentLines: [],
			});
		}
		if (currentLines.length > 0) {
			ops.push({
				type: "insert",
				originalLines: [],
				currentLines,
			});
		}
		return ops;
	}

	const rows = originalLines.length + 1;
	const cols = currentLines.length + 1;
	const lcs = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

	for (let row = originalLines.length - 1; row >= 0; row -= 1) {
		for (let col = currentLines.length - 1; col >= 0; col -= 1) {
			const originalLine = originalLines[row];
			const currentLine = currentLines[col];
			if (
				originalLine !== undefined &&
				currentLine !== undefined &&
				originalLine === currentLine
			) {
				lcs[row]![col] = lcs[row + 1]![col + 1]! + 1;
			} else {
				lcs[row]![col] = Math.max(lcs[row + 1]![col]!, lcs[row]![col + 1]!);
			}
		}
	}

	const ops: DiffOp[] = [];
	let row = 0;
	let col = 0;

	while (row < originalLines.length && col < currentLines.length) {
		const originalLine = originalLines[row];
		const currentLine = currentLines[col];
		if (
			originalLine !== undefined &&
			currentLine !== undefined &&
			originalLine === currentLine
		) {
			pushOp(ops, "equal", originalLine, "originalLines");
			const previous = ops.at(-1);
			if (previous) {
				previous.currentLines.push(currentLine);
			}
			row += 1;
			col += 1;
			continue;
		}

		if (lcs[row + 1]![col]! >= lcs[row]![col + 1]!) {
			if (originalLine !== undefined) {
				pushOp(ops, "delete", originalLine, "originalLines");
			}
			row += 1;
			continue;
		}

		if (currentLine !== undefined) {
			pushOp(ops, "insert", currentLine, "currentLines");
		}
		col += 1;
	}

	while (row < originalLines.length) {
		const originalLine = originalLines[row];
		if (originalLine !== undefined) {
			pushOp(ops, "delete", originalLine, "originalLines");
		}
		row += 1;
	}

	while (col < currentLines.length) {
		const currentLine = currentLines[col];
		if (currentLine !== undefined) {
			pushOp(ops, "insert", currentLine, "currentLines");
		}
		col += 1;
	}

	return ops;
};

export const buildDiffHunks = (
	originalContent: string,
	currentContent: string,
): DiffHunk[] => {
	const originalLines = splitLines(originalContent);
	const currentLines = splitLines(currentContent);
	const trimmed = trimCommonEdges(originalLines, currentLines);
	const middleOps = diffMiddle(trimmed.originalMiddle, trimmed.currentMiddle);
	const ops: DiffOp[] = [];

	if (trimmed.prefix > 0) {
		ops.push({
			type: "equal",
			originalLines: originalLines.slice(0, trimmed.prefix),
			currentLines: currentLines.slice(0, trimmed.prefix),
		});
	}

	ops.push(...middleOps);

	if (trimmed.suffixOriginalStart < originalLines.length) {
		ops.push({
			type: "equal",
			originalLines: originalLines.slice(trimmed.suffixOriginalStart),
			currentLines: currentLines.slice(trimmed.suffixCurrentStart),
		});
	}

	const hunks: DiffHunk[] = [];
	let originalLine = 0;
	let currentLine = 0;

	for (let index = 0; index < ops.length; index += 1) {
		const op = ops[index];
		if (!op) {
			continue;
		}
		if (op.type === "equal") {
			hunks.push({
				type: "equal",
				originalStart: originalLine,
				currentStart: currentLine,
				originalLines: op.originalLines,
				currentLines: op.currentLines,
			});
			originalLine += op.originalLines.length;
			currentLine += op.currentLines.length;
			continue;
		}

		const next = ops[index + 1];
		if (
			(op.type === "delete" && next?.type === "insert") ||
			(op.type === "insert" && next?.type === "delete")
		) {
			const deleteOp = op.type === "delete" ? op : next;
			const insertOp = op.type === "insert" ? op : next;
			if (!deleteOp || !insertOp) {
				continue;
			}
			hunks.push({
				type: "replace",
				originalStart: originalLine,
				currentStart: currentLine,
				originalLines: deleteOp.originalLines,
				currentLines: insertOp.currentLines,
			});
			originalLine += deleteOp.originalLines.length;
			currentLine += insertOp.currentLines.length;
			index += 1;
			continue;
		}

		if (op.type === "delete") {
			hunks.push({
				type: "delete",
				originalStart: originalLine,
				currentStart: currentLine,
				originalLines: op.originalLines,
			});
			originalLine += op.originalLines.length;
			continue;
		}

		hunks.push({
			type: "insert",
			originalStart: originalLine,
			currentStart: currentLine,
			currentLines: op.currentLines,
		});
		currentLine += op.currentLines.length;
	}

	return hunks;
};
