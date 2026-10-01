// External/webhook deployments still need periodic discovery while the page is visible.
export const activeDeploymentPollInterval = (count: number) =>
	count > 0 ? 15_000 : 60_000;

const serviceRouters = new Set([
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
]);
const deploymentActions = new Set([
	"deploy",
	"redeploy",
	"rebuild",
	"start",
	"stop",
	"reload",
	"remove",
	"cancelDeployment",
	"killBuild",
	"cleanQueues",
]);

export const changesDeploymentStatus = (
	key: readonly unknown[] | undefined,
): boolean => {
	const path = key?.[0];
	return (
		Array.isArray(path) &&
		path.length === 2 &&
		serviceRouters.has(path[0]) &&
		deploymentActions.has(path[1])
	);
};
