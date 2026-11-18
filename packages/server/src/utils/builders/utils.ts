import { dirname, join } from "node:path";
import { quote } from "shell-quote";
import { prepareEnvironmentVariables } from "../docker/utils";
import type { ContentStaging } from "../filesystem/write-content";

export const createEnvFileCommand = async (
	directory: string,
	env: string | null,
	staging: ContentStaging,
	projectEnv?: string | null,
	environmentEnv?: string | null,
) => {
	const envFileContent = prepareEnvironmentVariables(
		env,
		projectEnv,
		environmentEnv,
	).join("\n");

	const stagedPath = await staging.stage(envFileContent || "");
	const envFilePath = join(dirname(directory), ".env");

	return `cat ${quote([stagedPath])} > ${quote([envFilePath])} || exit 1;`;
};

export const stageBuildArguments = async (
	staging: ContentStaging,
	args: string[],
	environment: Record<string, string> = {},
) => {
	const assignments = Object.entries(environment).map(
		([key, value]) => `${key}=${value}`,
	);
	if (args.length === 0 && assignments.length === 0) return "";
	const path = await staging.stage(
		`set -- "$@" ${quote(args)}\nexec ${assignments.length ? `env ${quote(assignments)} ` : ""}"$@"`,
	);
	return `sh ${quote([path])}`;
};

export const stagePackEnvironment = async (
	staging: ContentStaging,
	entries: string[],
) => {
	const lines: string[] = [];
	const inline: string[] = [];
	// pack splits on newlines and trims each line before parsing.
	for (const entry of entries) {
		if (!/[\r\n\u0085]/.test(entry) && entry.trim() === entry)
			lines.push(entry);
		else inline.push(entry);
	}
	const args = lines.length
		? ["--env-file", quote([await staging.stage(lines.join("\n"))])]
		: [];
	const prefix = await stageBuildArguments(
		staging,
		inline.flatMap((entry) => ["--env", entry]),
	);
	return { args, prefix };
};
