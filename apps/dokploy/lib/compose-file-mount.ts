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
