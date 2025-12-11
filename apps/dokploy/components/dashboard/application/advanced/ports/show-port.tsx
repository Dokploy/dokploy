import { Rss, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("common");
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
					<CardTitle className="text-xl">
						{t("ports.card.title")}
					</CardTitle>
					<CardDescription>
						{t("ports.card.description")}
					</CardDescription>
				</div>

				{data && data?.ports.length > 0 && (
					<HandlePorts applicationId={applicationId}>
						{t("ports.button.add")}
					</HandlePorts>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.ports.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Rss className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							{t("ports.empty.description")}
						</span>
						<HandlePorts applicationId={applicationId}>
							{t("ports.button.add")}
						</HandlePorts>
					</div>
				) : (
					<div className="flex flex-col pt-2 gap-4">
						<AlertBlock type="info">
							{t("ports.alert.redeployReminder")}
						</AlertBlock>
						<div className="flex flex-col gap-6">
							{data?.ports.map((port) => (
								<div key={port.portId}>
									<div className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4">
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("ports.list.publishedPort")}
												</span>
												<span className="text-sm text-muted-foreground">
													{port.publishedPort}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("ports.list.publishMode")}
												</span>
												<span className="text-sm text-muted-foreground">
													{port?.publishMode?.toUpperCase()}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("ports.list.targetPort")}
												</span>
												<span className="text-sm text-muted-foreground">
													{port.targetPort}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{t("ports.list.protocol")}
												</span>
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
												title={t("ports.dialog.delete.title")}
												description={t("ports.dialog.delete.description")}
												type="destructive"
												onClick={async () => {
													await deletePort({
														portId: port.portId,
													})
														.then(() => {
															refetch();
															toast.success(t("ports.toast.deleteSuccess"));
														})
														.catch(() => {
															toast.error(t("ports.toast.deleteError"));
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
