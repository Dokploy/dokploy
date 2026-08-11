import { createFileRoute } from "@tanstack/react-router";
import { ShowAuditLogs } from "@/components/proprietary/audit-logs/show-audit-logs";

const Page = () => {
	return (
		<div className="flex flex-col gap-4 w-full">
			<ShowAuditLogs />
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/audit-logs")({
	component: Page,
});
