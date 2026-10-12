type PreviewTemplateContext = {
	pullRequestNumber: string;
	pullRequestTitle: string;
	branch: string;
	appName: string;
};

export const createPreviewTemplateVariables = (
	context: PreviewTemplateContext,
): Record<string, string> => ({
	pr_num: context.pullRequestNumber,
	pr_name: context.pullRequestTitle,
	branch: context.branch,
	app_name: context.appName,
});

/** Replace only preview tokens, preserving shell and shared env references. */
export const interpolatePreviewTemplate = (
	template: string,
	variables: Record<string, string>,
	options: { escape?: boolean; wildcard?: string } = {},
): string => {
	let result = "";
	for (let index = 0; index < template.length; ) {
		if (options.escape && template[index] === "\\") {
			if (template[index + 1] === "\\") {
				result += "\\";
				index += 2;
				continue;
			}
			const escaped = template.slice(index + 1).match(/^\{([a-z_]+)\}/);
			if (escaped && Object.hasOwn(variables, escaped[1]!)) {
				result += escaped[0];
				index += escaped[0].length + 1;
				continue;
			}
		}
		if (
			template[index] === "{" &&
			template[index - 1] !== "$" &&
			template[index - 1] !== "{"
		) {
			const token = template.slice(index).match(/^\{([a-z_]+)\}/);
			if (
				token &&
				template[index + token[0].length] !== "}" &&
				Object.hasOwn(variables, token[1]!)
			) {
				result += variables[token[1]!];
				index += token[0].length;
				continue;
			}
		}
		if (template[index] === "*" && options.wildcard !== undefined) {
			result += options.wildcard;
		} else {
			result += template[index];
		}
		index++;
	}
	return result;
};

const domainSlug = (value: string, fallback: string) =>
	value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63)
		.replace(/-+$/g, "") || fallback;

export const renderPreviewDomain = (
	template: string,
	variables: Record<string, string>,
	wildcard: string,
): string => {
	const fallback = `pr-${variables.pr_num}`;
	const domainVariables = Object.fromEntries(
		Object.entries(variables).map(([key, value]) => [
			key,
			domainSlug(value, fallback),
		]),
	);
	const domain = interpolatePreviewTemplate(template, domainVariables, {
		wildcard,
	}).toLowerCase();
	if (
		domain.length > 253 ||
		!domain
			.split(".")
			.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
	) {
		throw new Error("Preview domain template must resolve to a valid hostname");
	}
	return domain;
};
