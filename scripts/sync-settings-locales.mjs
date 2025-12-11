import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.join(__dirname, "..");
const localesDir = path.join(repoRoot, "apps", "dokploy", "public", "locales");

// 需要处理的语言包文件
const localeFiles = ["settings.json", "common.json"];

/**
 * 读取 JSON 文件
 */
function readJson(filePath) {
	const raw = fs.readFileSync(filePath, "utf8");
	try {
		return JSON.parse(raw);
	} catch (error) {
		console.error(`Failed to parse JSON: ${filePath}`);
		console.error(error?.message ?? error);
		return null;
	}
}

/**
 * 写入 JSON 文件（保持 TAB 缩进）
 */
function writeJson(filePath, data) {
	const serialized = JSON.stringify(data, null, "\t") + "\n";
	fs.writeFileSync(filePath, serialized, "utf8");
}

/**
 * 同步一个 JSON 文件（如 settings.json 或 common.json）
 */
function syncLocaleFile(localesDir, locale, baseLocale, fileName) {
	const basePath = path.join(localesDir, baseLocale, fileName);
	const targetPath = path.join(localesDir, locale, fileName);

	if (!fs.existsSync(basePath)) {
		console.error(`Base file not found: ${basePath}`);
		return;
	}

	if (!fs.existsSync(targetPath)) {
		// 如果目标语言没这个文件，跳过
		return;
	}

	const baseJson = readJson(basePath);
	const targetJson = readJson(targetPath);

	// 如果基础语言或目标语言 JSON 无法解析，跳过该文件
	if (!baseJson || !targetJson) {
		console.error(`Skip syncing ${fileName} for locale: ${locale} due to invalid JSON`);
		return;
	}

	const baseKeys = Object.keys(baseJson);
	const merged = {};

	// 按 base 顺序补齐
	for (const key of baseKeys) {
		merged[key] = targetJson[key] ?? baseJson[key];
	}

	// 保留目标文件多出来的字段
	for (const key of Object.keys(targetJson)) {
		if (!(key in merged)) {
			merged[key] = targetJson[key];
		}
	}

	writeJson(targetPath, merged);
	console.log(`Synced ${fileName} for locale: ${locale}`);
}

/**
 * 主逻辑
 */
const baseLocale = "en";
const locales = fs.readdirSync(localesDir, { withFileTypes: true });

for (const dirent of locales) {
	if (!dirent.isDirectory()) continue;

	const locale = dirent.name;

	// 跳过英文本身
	if (locale === baseLocale) continue;

	for (const fileName of localeFiles) {
		syncLocaleFile(localesDir, locale, baseLocale, fileName);
	}
}
