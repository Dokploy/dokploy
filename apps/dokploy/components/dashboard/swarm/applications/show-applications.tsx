import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { type ApplicationList, columns } from "./columns";
import { DataTable } from "./data-table";

interface Props {
	serverId?: string;
}

export const ShowNodeApplications = ({ serverId }: Props) => {
	const { data: NodeApps, isLoading: NodeAppsLoading } =
		api.swarm.getNodeApps.useQuery({ serverId });

	let applicationList: string[] = [];

	if (NodeApps && NodeApps.length > 0) {
		applicationList = NodeApps.map((app) => app.Name);
	}

	const { data: NodeAppDetails, isLoading: NodeAppDetailsLoading } =
		api.swarm.getAppInfos.useQuery({ appName: applicationList, serverId });

	if (NodeAppsLoading || NodeAppDetailsLoading) {
		return (
			<Dialog>
				<DialogTrigger asChild>
					<Button variant="outline" size="sm" className="w-full">
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
					</Button>
				</DialogTrigger>
			</Dialog>
		);
	}

	if (!NodeApps || !NodeAppDetails) {
		return (
			<span className="text-sm w-full flex text-center justify-center items-center">
				No data found
			</span>
		);
	}

	const combinedData: ApplicationList[] = NodeApps.flatMap((app) => {
		const appDetails =
			NodeAppDetails?.filter((detail) =>
				detail.Name.startsWith(`${app.Name}.`),
			) || [];

		if (appDetails.length === 0) {
			return [
				{
					...app,
					CurrentState: "N/A",
					DesiredState: "N/A",
					Error: "",
					Node: "N/A",
					Ports: app.Ports,
				},
			];
		}

		return appDetails.map((detail) => ({
			...app,
			CurrentState: detail.CurrentState,
			DesiredState: detail.DesiredState,
			Error: detail.Error,
			Node: detail.Node,
			Ports: detail.Ports || app.Ports,
			serverId: serverId || "",
		}));
	});

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="w-full">
					<Layers className="h-4 w-4 mr-2" />
					Services
				</Button>
			</DialogTrigger>
			<DialogContent className={"sm:max-w-10xl"}>
				<DialogHeader>
					<DialogTitle>Node Applications</DialogTitle>
					<DialogDescription>
						See in detail the applications running on this node
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[80vh]">
					<DataTable columns={columns} data={combinedData ?? []} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
