// Strips leading "./" and any leading "/" so it can be safely joined onto the
// repo's "code" directory.
export const sanitizeComposeWorkingDir = (
	workingDir: string | null | undefined,
) => {
	if (!workingDir) return "";
	const trimmed = workingDir.trim();
	if (!trimmed) return "";
	const normalized = trimmed.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
	if (!normalized || normalized === "." || normalized === "./") return "";
	return normalized;
};
