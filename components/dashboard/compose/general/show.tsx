import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import React from "react";
import { Input } from "@/components/ui/input";
import { ComposeFileEditor } from "./compose-file-editor";
import { ComposeActions } from "./actions";
interface Props {
	composeId: string;
}

export const ShowGeneralCompose = ({ composeId }: Props) => {
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	// const { mutateAsync: update } = api.compose.update.useMutation();

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">General</CardTitle>
					<CardDescription>
						Create a compose file to deploy your application
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<Input placeholder="docker stack deploy -c docker-compose.yml dokploy " />
					<div className="w-full flex flex-col lg:flex-row gap-4">
						<ComposeFileEditor composeId={composeId} />
					</div>
					{/* <DeployApplication composeId={composeId} />
					<ResetApplication
						composeId={composeId}
						appName={data?.appName || ""}
					/>

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
					<RedbuildApplication composeId={composeId} />
					{data?.applicationStatus === "idle" ? (
						<StartApplication composeId={composeId} />
					) : (
						<StopApplication composeId={composeId} />
					)}
					<DockerTerminalModal appName={data?.appName || ""}>
						<Button variant="outline">
							<Terminal />
							Open Terminal
						</Button>
					</DockerTerminalModal> */}
				</CardContent>
			</Card>
			{/* <ShowProviderForm composeId={composeId} /> */}
			{/* <ShowBuildChooseForm composeId={composeId} /> */}
		</>
	);
};
