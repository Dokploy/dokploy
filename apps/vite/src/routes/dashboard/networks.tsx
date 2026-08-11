import { createFileRoute, redirect } from "@tanstack/react-router";

const Networks = () => {
	return null;
};

export const Route = createFileRoute("/dashboard/networks")({
	beforeLoad: ({ location }) => {
		const serverId = (location.search as Record<string, unknown>).serverId;
		throw redirect({
			href: `/dashboard/docker?tab=networks${
				typeof serverId === "string"
					? `&serverId=${encodeURIComponent(serverId)}`
					: ""
			}`,
		});
	},
	component: Networks,
});
