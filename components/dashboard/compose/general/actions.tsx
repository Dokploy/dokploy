import { Button } from "@/components/ui/button";
import { Terminal } from "lucide-react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { z } from "zod";
import { Toggle } from "@/components/ui/toggle";
import { RedbuildCompose } from "./rebuild-compose";
import { DeployCompose } from "./deploy-compose";
import { StopCompose } from "./stop-compose";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: update } = api.compose.update.useMutation();

	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			<DeployCompose composeId={composeId} />

			<Toggle
				aria-label="Toggle italic"
				pressed={data?.autoDeploy || false}
				onPressedChange={async (enabled) => {
					await update({
						composeId,
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
			>
				Autodeploy
			</Toggle>
			<RedbuildCompose composeId={composeId} />
			{data?.composeType === "docker-compose" && (
				<StopCompose composeId={composeId} />
			)}

			<DockerTerminalModal appName={data?.appName || ""}>
				<Button variant="outline">
					<Terminal />
					Open Terminal
				</Button>
			</DockerTerminalModal>
		</div>
	);
};
