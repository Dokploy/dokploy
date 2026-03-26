/**
 * Проверяет переводы:
 * 1) паритет ключей между messages/en и messages/ru (по файлам);
 * 2) неиспользуемые ключи в EN (строковые листья), по сопоставлению с кодом (useTranslations + t / t.rich / …).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "../..");
const MESSAGES_EN = join(APP_ROOT, "src", "i18n", "locales", "en");
const MESSAGES_RU = join(APP_ROOT, "src", "i18n", "locales", "ru");

const SKIP_DIRS = new Set([
	".next",
	"node_modules",
	"dist",
	"messages",
	"__test__",
]);

const SOURCE_EXT = new Set([".ts", ".tsx"]);

const isSourceFile = (path: string): boolean => {
	const base = path.split(/[/\\]/).pop() ?? "";
	if (base.startsWith(".")) {
		return false;
	}
	const dot = base.lastIndexOf(".");
	const ext = dot >= 0 ? base.slice(dot) : "";
	return SOURCE_EXT.has(ext);
};

const walkSourceFiles = (dir: string, out: string[]): void => {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (SKIP_DIRS.has(name)) {
				continue;
			}
			walkSourceFiles(full, out);
		} else if (st.isFile() && isSourceFile(full)) {
			out.push(full);
		}
	}
};

const flattenJsonLeaves = (
	value: unknown,
	prefix: string,
	out: string[],
): void => {
	if (typeof value === "string") {
		out.push(prefix);
		return;
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return;
	}
	for (const [k, v] of Object.entries(value)) {
		const next = prefix ? `${prefix}.${k}` : k;
		flattenJsonLeaves(v, next, out);
	}
};

const mergeEnMessages = (): Record<string, unknown> => {
	const merged: Record<string, unknown> = {};
	for (const name of readdirSync(MESSAGES_EN)) {
		if (!name.endsWith(".json")) {
			continue;
		}
		const raw = readFileSync(join(MESSAGES_EN, name), "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		Object.assign(merged, parsed);
	}
	return merged;
};

const collectKeys = (obj: unknown): Set<string> => {
	const keys: string[] = [];
	flattenJsonLeaves(obj, "", keys);
	return new Set(keys);
};

const diffKeys = (
	a: Set<string>,
	b: Set<string>,
): { missingInB: string[]; extraInB: string[] } => {
	const missingInB: string[] = [];
	const extraInB: string[] = [];
	for (const k of a) {
		if (!b.has(k)) {
			missingInB.push(k);
		}
	}
	for (const k of b) {
		if (!a.has(k)) {
			extraInB.push(k);
		}
	}
	missingInB.sort();
	extraInB.sort();
	return { missingInB, extraInB };
};

/** varName -> namespace (пустая строка = корень, как для useTranslations()) */
const collectNamespaceBindings = (content: string): Map<string, string> => {
	const map = new Map<string, string>();

	const useRe =
		/(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
	for (const m of content.matchAll(useRe)) {
		const varName = m[1];
		if (!varName) {
			continue;
		}
		const ns = m[2] ?? "";
		map.set(varName, ns);
	}

	const paramRe =
		/(\w+)\s*:\s*ReturnType<\s*typeof\s+useTranslations\s*<\s*['"]([^'"]+)['"]\s*>\s*>/g;
	for (const m of content.matchAll(paramRe)) {
		const param = m[1];
		const ns = m[2];
		if (param && ns) {
			map.set(param, ns);
		}
	}

	return map;
};

const escapeRegExp = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const joinFullKey = (namespace: string, key: string): string =>
	namespace === "" ? key : `${namespace}.${key}`;

/** Значения вида `nsKey: "healthCheck"` для подстановки в `t(\`menu.${nsKey}.label\`)` */
const collectVarStringValues = (varName: string, content: string): string[] => {
	const vals = new Set<string>();
	const re = new RegExp(
		`\\b${escapeRegExp(varName)}:\\s*["']([^"']+)["']`,
		"g",
	);
	for (const m of content.matchAll(re)) {
		const v = m[1];
		if (v) {
			vals.add(v);
		}
	}
	return [...vals];
};

const cartesianProduct = <T>(arrays: T[][]): T[][] => {
	if (arrays.length === 0) {
		return [[]];
	}
	return arrays.reduce<T[][]>(
		(acc, curr) => acc.flatMap((prefix) => curr.map((c) => [...prefix, c])),
		[[]] as T[][],
	);
};

/** Строковые литералы из `const NAME = [ "a", "b" ] as const` */
const collectStringLiteralsFromConstArray = (
	content: string,
	arrayName: string,
): string[] => {
	const re = new RegExp(
		`const\\s+${escapeRegExp(arrayName)}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
		"m",
	);
	const m = content.match(re);
	if (!m?.[1]) {
		return [];
	}
	const out: string[] = [];
	for (const sm of m[1].matchAll(/"([^"]+)"/g)) {
		const s = sm[1];
		if (s) {
			out.push(s);
		}
	}
	return out;
};

/** Раскрывает `` t(`a.${x}.b`) `` по значениям `x: "..."` в том же файле */
const expandTemplateLiteral = (tpl: string, content: string): string[] => {
	if (!tpl.includes("${")) {
		return [tpl];
	}
	const varNames = [...tpl.matchAll(/\$\{(\w+)\}/g)]
		.map((m) => m[1])
		.filter((v): v is string => Boolean(v));
	if (varNames.length === 0) {
		return [tpl];
	}
	const valueLists = varNames.map((v) => {
		const fromAssignments = collectVarStringValues(v, content);
		if (fromAssignments.length > 0) {
			return fromAssignments;
		}
		/* show-resources: ULIMIT_VALUES.map((value) => t(`ulimitPresets.${value}`)) */
		if (v === "value") {
			const fromArray = collectStringLiteralsFromConstArray(
				content,
				"ULIMIT_VALUES",
			);
			if (fromArray.length > 0) {
				return fromArray;
			}
		}
		return fromAssignments;
	});
	if (valueLists.some((l) => l.length === 0)) {
		return [];
	}
	const combos = cartesianProduct(valueLists);
	return combos.map((values) => {
		let out = tpl;
		varNames.forEach((v, i) => {
			const repl = values[i];
			if (repl !== undefined) {
				out = out.replace(`\${${v}}`, repl);
			}
		});
		return out;
	});
};

/** Строковые литералы, совпадающие с полным путём ключа (меню, конфиги и т.д.) */
const collectKeysFromStringLiterals = (
	content: string,
	allKeys: Set<string>,
): Set<string> => {
	const used = new Set<string>();
	const re = /["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;
	for (const m of content.matchAll(re)) {
		const s = m[1];
		if (s && allKeys.has(s)) {
			used.add(s);
		}
	}
	return used;
};

const extractUsedKeysFromFile = (
	content: string,
	allKeys: Set<string>,
): Set<string> => {
	const used = new Set<string>();
	const bindings = collectNamespaceBindings(content);

	for (const [varName, namespace] of bindings) {
		const callRe = new RegExp(
			`\\b${escapeRegExp(varName)}(?:\\.(?:rich|raw|markup))?\\(\\s*['"]([^'"]+)['"]`,
			"g",
		);
		for (const m of content.matchAll(callRe)) {
			const rel = m[1];
			if (!rel) {
				continue;
			}
			used.add(joinFullKey(namespace, rel));
		}

		const tplRe = new RegExp(
			`\\b${escapeRegExp(varName)}(?:\\.(?:rich|raw|markup))?\\(\\s*\`([^\`]*)\``,
			"g",
		);
		for (const m of content.matchAll(tplRe)) {
			const tpl = m[1];
			if (!tpl) {
				continue;
			}
			for (const rel of expandTemplateLiteral(tpl, content)) {
				if (rel) {
					used.add(joinFullKey(namespace, rel));
				}
			}
		}
	}

	for (const k of collectKeysFromStringLiterals(content, allKeys)) {
		used.add(k);
	}

	return used;
};

const compareLocaleFiles = (): {
	issues: string[];
	hasErrors: boolean;
} => {
	const issues: string[] = [];
	let hasErrors = false;

	const enFiles = readdirSync(MESSAGES_EN).filter((f) => f.endsWith(".json"));
	const ruFiles = new Set(
		readdirSync(MESSAGES_RU).filter((f) => f.endsWith(".json")),
	);

	for (const file of enFiles.sort()) {
		if (!ruFiles.has(file)) {
			issues.push(`Файл ${file} есть в EN, но отсутствует в RU`);
			hasErrors = true;
			continue;
		}
		const enJson = JSON.parse(
			readFileSync(join(MESSAGES_EN, file), "utf8"),
		) as unknown;
		const ruJson = JSON.parse(
			readFileSync(join(MESSAGES_RU, file), "utf8"),
		) as unknown;
		const enKeys = collectKeys(enJson);
		const ruKeys = collectKeys(ruJson);
		const { missingInB, extraInB } = diffKeys(enKeys, ruKeys);
		if (missingInB.length > 0) {
			hasErrors = true;
			for (const k of missingInB) {
				issues.push(`[${file}] отсутствует в RU: ${k}`);
			}
		}
		if (extraInB.length > 0) {
			hasErrors = true;
			for (const k of extraInB) {
				issues.push(`[${file}] лишний в RU (нет в EN): ${k}`);
			}
		}
	}

	const enSet = new Set(enFiles);
	for (const file of ruFiles) {
		if (!enSet.has(file)) {
			issues.push(`Файл ${file} есть в RU, но отсутствует в EN`);
			hasErrors = true;
		}
	}

	return { issues, hasErrors };
};

const findUnusedEnKeys = (): { unused: string[]; hasErrors: boolean } => {
	const merged = mergeEnMessages();
	const allKeys = collectKeys(merged);
	const used = new Set<string>();
	const sources: string[] = [];
	walkSourceFiles(APP_ROOT, sources);

	for (const file of sources) {
		const content = readFileSync(file, "utf8");
		for (const k of extractUsedKeysFromFile(content, allKeys)) {
			used.add(k);
		}
	}

	const unused: string[] = [];
	for (const k of allKeys) {
		if (!used.has(k)) {
			unused.push(k);
		}
	}
	unused.sort();
	return { unused, hasErrors: unused.length > 0 };
};

const main = (): void => {
	let exit = 0;

	const locale = compareLocaleFiles();
	console.log("=== Сравнение EN / RU (ключи по файлам) ===\n");
	if (locale.issues.length === 0) {
		console.log("OK: структура ключей совпадает по всем парам файлов.\n");
	} else {
		exit = 1;
		for (const line of locale.issues) {
			console.log(line);
		}
		console.log("");
	}

	const { unused, hasErrors: unusedErrors } = findUnusedEnKeys();
	console.log("=== Неиспользуемые ключи в EN (нет совпадений в коде) ===\n");
	if (!unusedErrors) {
		console.log("OK: неиспользуемых ключей не найдено.\n");
	} else {
		exit = 1;
		for (const k of unused) {
			console.log(k);
		}
		console.log(`\nВсего: ${unused.length}\n`);
	}

	process.exit(exit);
};

main();
