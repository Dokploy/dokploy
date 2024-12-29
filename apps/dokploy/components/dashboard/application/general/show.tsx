import { ShowBuildChooseForm } from "@/components/dashboard/application/build/show";
import { ShowProviderForm } from "@/components/dashboard/application/general/generic/show";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { Terminal } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { RedbuildApplication } from "../rebuild-application";
import { StartApplication } from "../start-application";
import { StopApplication } from "../stop-application";
import { DeployApplication } from "./deploy-application";
import { ResetApplication } from "./reset-application";
interface Props {
	applicationId: string;
}

export const ShowGeneralApplication = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);
	const { mutateAsync: update } = api.application.update.useMutation();

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<DeployApplication applicationId={applicationId} />
					<ResetApplication
						applicationId={applicationId}
						appName={data?.appName || ""}
					/>

					<RedbuildApplication applicationId={applicationId} />
					{data?.applicationStatus === "idle" ? (
						<StartApplication applicationId={applicationId} />
					) : (
						<StopApplication applicationId={applicationId} />
					)}
					<DockerTerminalModal
						appName={data?.appName || ""}
						serverId={data?.serverId || ""}
					>
						<Button variant="outline">
							<Terminal />
							Open Terminal
						</Button>
					</DockerTerminalModal>
					<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
						<span className="text-sm font-medium">Autodeploy</span>
						<Switch
							aria-label="Toggle italic"
							checked={data?.autoDeploy || false}
							onCheckedChange={async (enabled) => {
								await update({
									applicationId,
									autoDeploy: enabled,
								})
									.then(async () => {
										toast.success("Auto Deploy Updated");
										await refetch();
									})
									.catch(() => {
										toast.error("Error updating Auto Deploy");
									});
							}}
							className="flex flex-row gap-2 items-center"
						/>
					</div>
				</CardContent>
			</Card>
			<ShowProviderForm applicationId={applicationId} />
			<ShowBuildChooseForm applicationId={applicationId} />
		</>
	);
};
