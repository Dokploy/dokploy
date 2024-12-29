import path from "node:path";

export const serverLogFile = path.join(
	process.env.NODE_ENV === "production"
		? "/etc"
		: "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker",
	"server_metrics.log",
);
export const containerLogFile = path.join(
	process.env.NODE_ENV === "production"
		? "/etc"
		: "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/monitoring",
);
