import { createFileRoute } from "@tanstack/react-router";
import { ShowBackups } from "@/components/dashboard/database/backups/show-backups";
import { WebDomain } from "@/components/dashboard/settings/web-domain";
import { WebServer } from "@/components/dashboard/settings/web-server";
import { Card } from "@/components/ui/card";
import { api } from "@/utils/api";

const Page = () => {
	const { data: user } = api.user.get.useQuery();
	return (
		<div className="w-full">
			<div className="h-full rounded-xl  max-w-5xl mx-auto flex flex-col gap-4">
				<WebDomain />
				<WebServer />
				<div className="w-full flex flex-col gap-4">
					<Card className="h-full bg-sidebar  p-2.5 rounded-xl  mx-auto w-full">
						<ShowBackups
							id={user?.userId ?? ""}
							databaseType="web-server"
							backupType="database"
						/>
					</Card>
				</div>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/dashboard/settings/server")({
	component: Page,
});
