import { quote } from "shell-quote";

const ENVIRONMENT_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const quoteShellArgument = (value: string) => quote([value]);

export const quoteShellArgs = (args: readonly string[]) => quote(args);

export const assertEnvironmentVariableName = (key: string) => {
	if (!ENVIRONMENT_VARIABLE_NAME_PATTERN.test(key)) {
		throw new Error(`Invalid environment variable name: ${key}`);
	}

	return key;
};

export const quoteEnvironmentAssignment = (key: string, value: string) =>
	`${assertEnvironmentVariableName(key)}=${quoteShellArgument(value)}`;
