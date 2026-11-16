interface ComposeFileMountInput {
	composeType: "docker-compose" | "stack";
	composePath: string;
	sourceType: string;
	fileName: string;
}

const toSegments = (value: string) => {
	const segments: string[] = [];
	for (const segment of value.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return segments;
};

export const getComposeFileMountSource = ({
	composeType,
	composePath,
	sourceType,
	fileName,
}: ComposeFileMountInput) => {
	const file = toSegments(fileName).join("/");

	let depth = 0;
	if (composeType === "stack") {
		const path = sourceType === "raw" ? "docker-compose.yml" : composePath;
		depth = Math.max(toSegments(path).length - 1, 0);
	}

	return `${"../".repeat(depth + 1)}files/${file}`;
};

// Long syntax with a quoted source: in the short `source:target` form a file
// name containing ":" shifts the split, and " #" would start a YAML comment.
export const getComposeFileMountExample = (source: string) =>
	[
		"volumes:",
		"  - type: bind",
		`    source: ${JSON.stringify(source)}`,
		"    target: /path/in/container",
	].join("\n");
