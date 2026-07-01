import fs from "node:fs";
import path from "node:path";
import { quote } from "shell-quote";

const UNSAFE_RELATIVE_PATH_PATTERN = /[`$;&|<>"']/;

const isWindowsAbsolutePath = (filePath: string) =>
	/^[A-Za-z]:[\\/]/.test(filePath);

const hasReservedGitDirectorySegment = (filePath: string) =>
	filePath.split("/").includes(".git");

const isPathInsideDirectory = (basePath: string, candidatePath: string) => {
	const relativePath = path.relative(basePath, candidatePath);
	return (
		relativePath !== "" &&
		!relativePath.startsWith("..") &&
		!path.isAbsolute(relativePath)
	);
};

const isPathInsideOrEqualDirectory = (
	basePath: string,
	candidatePath: string,
) =>
	candidatePath === basePath || isPathInsideDirectory(basePath, candidatePath);

const pathExists = (candidatePath: string) => {
	try {
		fs.lstatSync(candidatePath);
		return true;
	} catch {
		return false;
	}
};

const collectExistingPathComponentsInsideDirectory = (
	basePath: string,
	candidatePath: string,
) => {
	const components: string[] = [];
	let currentPath = candidatePath;

	while (isPathInsideOrEqualDirectory(basePath, currentPath)) {
		if (pathExists(currentPath)) {
			components.push(currentPath);
		}

		if (currentPath === basePath) {
			break;
		}

		currentPath = path.dirname(currentPath);
	}

	return components;
};

export const normalizeRelativeFilePath = (filePath: string) => {
	if (typeof filePath !== "string") {
		throw new Error("Invalid file path");
	}

	if (filePath.includes("\0") || /[\r\n\t]/.test(filePath)) {
		throw new Error("Invalid file path");
	}

	if (isWindowsAbsolutePath(filePath) || filePath.startsWith("\\\\")) {
		throw new Error("Invalid file path");
	}

	const normalizedSeparators = filePath.trim().replace(/\\/g, "/");
	if (
		!normalizedSeparators ||
		UNSAFE_RELATIVE_PATH_PATTERN.test(normalizedSeparators)
	) {
		throw new Error("Invalid file path");
	}

	const withoutLeadingSlashes = normalizedSeparators.replace(/^\/+/, "");
	const normalized = path.posix.normalize(withoutLeadingSlashes);

	if (
		!normalized ||
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		hasReservedGitDirectorySegment(normalized) ||
		path.posix.isAbsolute(normalized)
	) {
		throw new Error("Invalid file path");
	}

	return normalized;
};

export const resolveFilePathInsideDirectory = (
	basePath: string,
	filePath: string,
) => {
	const relativePath = normalizeRelativeFilePath(filePath);
	const absoluteBasePath = path.resolve(basePath);
	const fullPath = path.resolve(absoluteBasePath, relativePath);

	if (
		fullPath !== absoluteBasePath &&
		!fullPath.startsWith(`${absoluteBasePath}${path.sep}`)
	) {
		throw new Error("Invalid file path");
	}

	return {
		fullPath,
		isDirectory: filePath.trim().replace(/\\/g, "/").endsWith("/"),
		relativePath,
	};
};

export const quoteShellArg = (value: string) => quote([value]);

export const assertNoSymlinkEscapeInsideDirectory = (
	basePath: string,
	filePath: string,
) => {
	const resolvedPath = resolveFilePathInsideDirectory(basePath, filePath);
	const absoluteBasePath = path.resolve(basePath);
	const existingComponents = collectExistingPathComponentsInsideDirectory(
		absoluteBasePath,
		resolvedPath.fullPath,
	);

	try {
		for (const component of existingComponents) {
			if (fs.lstatSync(component).isSymbolicLink()) {
				throw new Error("Invalid file path");
			}
		}

		const nearestExistingPath = existingComponents[0];
		if (nearestExistingPath) {
			const realBasePath = pathExists(absoluteBasePath)
				? fs.realpathSync.native(absoluteBasePath)
				: absoluteBasePath;
			const realNearestExistingPath =
				fs.realpathSync.native(nearestExistingPath);

			if (
				!isPathInsideOrEqualDirectory(realBasePath, realNearestExistingPath)
			) {
				throw new Error("Invalid file path");
			}
		}
	} catch {
		throw new Error("Invalid file path");
	}

	return resolvedPath;
};

export const getNoSymlinkFilePathGuardCommand = (
	basePath: string,
	fullPath: string,
	options: { createParent?: boolean } = {},
) => {
	const quotedBasePath = quoteShellArg(path.resolve(basePath));
	const quotedFullPath = quoteShellArg(fullPath);
	const createParent = options.createParent ?? true;
	const parentCommand = createParent
		? `
mkdir -p "$parent"
real_parent="$(cd "$parent" && pwd -P)" || exit 1
case "$real_parent" in "$real_base"|"$real_base"/*) ;; *) echo "Invalid file path" >&2; exit 1;; esac
`
		: `
if [ -e "$parent" ] || [ -L "$parent" ]; then
	if [ -L "$parent" ] || [ ! -d "$parent" ]; then echo "Invalid file path" >&2; exit 1; fi
	real_parent="$(cd "$parent" && pwd -P)" || exit 1
	case "$real_parent" in "$real_base"|"$real_base"/*) ;; *) echo "Invalid file path" >&2; exit 1;; esac
fi
`;

	return `
base=${quotedBasePath}
file=${quotedFullPath}
case "$file" in "$base"/*) ;; *) echo "Invalid file path" >&2; exit 1;; esac
if [ -L "$base" ]; then echo "Invalid file path" >&2; exit 1; fi
mkdir -p "$base"
parent="$(dirname "$file")"
real_base="$(cd "$base" && pwd -P)" || exit 1
probe="$parent"
while [ ! -e "$probe" ] && [ ! -L "$probe" ]; do
	next="$(dirname "$probe")"
	if [ "$next" = "$probe" ]; then echo "Invalid file path" >&2; exit 1; fi
	case "$next" in "$base"|"$base"/*) ;; *) echo "Invalid file path" >&2; exit 1;; esac
	probe="$next"
done
if [ -L "$probe" ] || [ ! -d "$probe" ]; then echo "Invalid file path" >&2; exit 1; fi
real_probe="$(cd "$probe" && pwd -P)" || exit 1
case "$real_probe" in "$real_base"|"$real_base"/*) ;; *) echo "Invalid file path" >&2; exit 1;; esac
${parentCommand}
if [ -L "$file" ]; then echo "Invalid file path" >&2; exit 1; fi
`;
};
