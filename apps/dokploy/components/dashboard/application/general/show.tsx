import { ShowBuildChooseForm } from "@dokploy/components/dashboard/application/build/show";
import { ShowProviderForm } from "@dokploy/components/dashboard/application/general/generic/show";
import { Button } from "@dokploy/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@dokploy/components/ui/card";
import { Toggle } from "@dokploy/components/ui/toggle";
import { api } from "@dokploy/utils/api";
import { CheckCircle2, Terminal } from "lucide-react";
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

					<Toggle
						aria-label="Toggle italic"
						pressed={data?.autoDeploy || false}
						onPressedChange={async (enabled) => {
							await update({
								applicationId,
								autoDeploy: enabled,
							})
								.then(async () => {
									toast.success("Auto Deploy Updated");
									await refetch();
								})
								.catch(() => {
									toast.error("Error to update Auto Deploy");
								});
						}}
						className="flex flex-row gap-2 items-center"
					>
						Autodeploy
						{data?.autoDeploy && <CheckCircle2 className="size-4" />}
					</Toggle>
					<RedbuildApplication applicationId={applicationId} />
					{data?.applicationStatus === "idle" ? (
						<StartApplication applicationId={applicationId} />
					) : (
						<StopApplication applicationId={applicationId} />
					)}
					<DockerTerminalModal appName={data?.appName || ""}>
						<Button variant="outline">
							<Terminal />
							Open Terminal
						</Button>
					</DockerTerminalModal>
				</CardContent>
			</Card>
			<ShowProviderForm applicationId={applicationId} />
			<ShowBuildChooseForm applicationId={applicationId} />
		</>
	);
};
