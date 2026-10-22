import { quote } from "shell-quote";

// rsync filter rules for the web-server backup. Git and raw sources are
// re-created under */code/ on every deploy, so those checkouts are skipped;
// drop (zip upload) apps keep theirs, since it is the only copy of their code.
// Includes must come before the excludes: rsync applies the first match.
export const getWebServerBackupFilters = (dropAppNames: string[]) => [
	...dropAppNames.map(
		(appName) => `--include=${quote([`applications/${appName}/code/***`])}`,
	),
	"--exclude='applications/*/code/'",
	"--exclude='compose/*/code/'",
];
