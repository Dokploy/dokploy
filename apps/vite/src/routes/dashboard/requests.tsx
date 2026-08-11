import { createFileRoute } from "@tanstack/react-router";
import { ShowRequests } from "@/components/dashboard/requests/show-requests";

function Requests() {
	return <ShowRequests />;
}

export const Route = createFileRoute("/dashboard/requests")({
	component: Requests,
});
