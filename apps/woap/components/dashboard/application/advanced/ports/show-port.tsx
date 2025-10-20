import { Rss, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { HandlePorts } from "./handle-ports";

interface Props {
	applicationId: string;
}

export const ShowPorts = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	const { mutateAsync: deletePort, isLoading: isRemoving } =
		api.port.delete.useMutation();

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">Ports</CardTitle>
					<CardDescription>
						the ports allows you to expose your application to the internet
					</CardDescription>
				</div>

				{data && data?.ports.length > 0 && (
					<HandlePorts applicationId={applicationId}>Add Port</HandlePorts>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.ports.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Rss className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No ports configured
						</span>
						<HandlePorts applicationId={applicationId}>Add Port</HandlePorts>
					</div>
				) : (
					<div className="flex flex-col pt-2 gap-4">
						<AlertBlock type="info">
							Please remember to click Redeploy after adding, editing, or
							deleting the ports to apply the changes.
						</AlertBlock>
						<div className="flex flex-col gap-6">
							{data?.ports.map((port) => (
								<div key={port.portId}>
									<div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Published Port</span>
												<span className="text-sm text-muted-foreground">
													{port.publishedPort}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Published Port Mode</span>
												<span className="text-sm text-muted-foreground">
													{port?.publishMode?.toUpperCase()}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Target Port</span>
												<span className="text-sm text-muted-foreground">
													{port.targetPort}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Protocol</span>
												<span className="text-sm text-muted-foreground">
													{port.protocol.toUpperCase()}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-4">
											<HandlePorts
												applicationId={applicationId}
												portId={port.portId}
											/>
											<DialogAction
												title="Delete Port"
												description="Are you sure you want to delete this port?"
												type="destructive"
												onClick={async () => {
													await deletePort({
														portId: port.portId,
													})
														.then(() => {
															refetch();
															toast.success("Port deleted successfully");
														})
														.catch(() => {
															toast.error("Error deleting port");
														});
												}}
											>
												<Button
													variant="ghost"
													size="icon"
													className="group hover:bg-red-500/10 "
													isLoading={isRemoving}
												>
													<Trash2 className="size-4 text-primary group-hover:text-red-500" />
												</Button>
											</DialogAction>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
