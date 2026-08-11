import { createFileRoute, redirect } from "@tanstack/react-router";

const Swarm = () => {
	return null;
};

export const Route = createFileRoute("/dashboard/swarm")({
	beforeLoad: ({ location }) => {
		const serverId = (location.search as Record<string, unknown>).serverId;
		throw redirect({
			href: `/dashboard/docker?tab=swarm${
				typeof serverId === "string"
					? `&serverId=${encodeURIComponent(serverId)}`
					: ""
			}`,
		});
	},
	component: Swarm,
});
