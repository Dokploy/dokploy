export const parseRepositoryPath = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	let path = trimmed;
	try {
		const url = new URL(trimmed);
		path = url.pathname;
	} catch {
		// The input is already an owner/repository path.
	}

	const parts = path
		.replace(/^\/+|\/+$/g, "")
		.replace(/\.git$/i, "")
		.split("/")
		.map((part) => part.trim())
		.filter(Boolean);

	if (parts.length < 2) {
		return null;
	}

	return {
		owner: parts.slice(0, -1).join("/"),
		repository: parts.at(-1) as string,
	};
};
