import { Copy, Server } from "lucide-react";
import Link from "next/link";
import copy from "copy-to-clipboard";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { MigrateServerDialog } from "./migrate-server";

interface Props {
	applicationId: string;
}

export const ShowServerSettings = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	if (!data?.server) {
		return null;
	}

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2">
					<Server className="size-5" />
					Server Settings
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Server Name */}
					<div className="flex flex-col gap-1.5">
						<span className="text-sm text-muted-foreground">Server Name</span>
						<Link
							href={`/dashboard/settings/servers`}
							className="text-sm font-medium hover:underline"
						>
							{data.server.name}
						</Link>
					</div>

					{/* IP Address */}
					<div className="flex flex-col gap-1.5">
						<span className="text-sm text-muted-foreground">IP Address</span>
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">
								{data.server.ipAddress}
							</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 w-6 p-0"
								onClick={() => {
									copy(data.server.ipAddress);
									toast.success("IP Address copied to clipboard!");
								}}
							>
								<Copy className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				</div>

				{/* Migration Button */}
				<div className="pt-2 border-t">
					<MigrateServerDialog
						applicationId={applicationId}
						applicationName={data.name}
						currentServerId={data.serverId}
					/>
				</div>
			</CardContent>
		</Card>
	);
};
