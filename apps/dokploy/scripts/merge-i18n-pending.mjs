// Merges lib/i18n/pending/*.json into lib/i18n/locales/en.json
// and lib/i18n/pending/*.ru.json into lib/i18n/locales/ru.json.
// Keys are dotted paths; they are inserted as nested objects.
// Run: node scripts/merge-i18n-pending.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pendingDir = join(process.cwd(), "lib/i18n/pending");
const localesDir = join(process.cwd(), "lib/i18n/locales");

function setPath(obj, path, value) {
	const parts = path.split(".");
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) {
			cur[parts[i]] = {};
		}
		cur = cur[parts[i]];
	}
	cur[parts[parts.length - 1]] = value;
}

function mergePending(suffix) {
	const targetPath = join(localesDir, suffix === ".ru.json" ? "ru.json" : "en.json");
	const target = JSON.parse(readFileSync(targetPath, "utf8"));
	const files = readdirSync(pendingDir).filter(
		(f) => f.endsWith(suffix) && !f.endsWith(suffix === ".ru.json" ? ".ru.ru.json" : ".en.json"),
	);
	let added = 0;
	const missingInFile = [];
	for (const file of files) {
		const data = JSON.parse(readFileSync(join(pendingDir, file), "utf8"));
		for (const [key, value] of Object.entries(data)) {
			setPath(target, key, value);
			added++;
		}
	}
	writeFileSync(targetPath, `${JSON.stringify(target, null, "\t")}\n`);
	return { added, missingInFile };
}

const en = mergePending(".json");
const ru = mergePending(".ru.json");
console.log(`en: merged ${en.added} entries; ru: merged ${ru.added} entries`);

// Validate parity
const enDict = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
const ruDict = JSON.parse(readFileSync(join(localesDir, "ru.json"), "utf8"));
function keys(obj, p = "") {
	return Object.entries(obj).flatMap(([k, v]) =>
		typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`],
	);
}
const e = keys(enDict);
const r = keys(ruDict);
const missingInRu = e.filter((k) => !r.includes(k));
const missingInEn = r.filter((k) => !e.includes(k));
if (missingInRu.length) console.log("MISSING IN RU:", missingInRu);
if (missingInEn.length) console.log("MISSING IN EN:", missingInEn);
if (!missingInRu.length && !missingInEn.length) console.log("Parity OK");
