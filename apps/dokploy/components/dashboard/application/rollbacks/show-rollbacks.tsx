import { api } from "@/utils/api";
import {
	Loader2,
	RefreshCcw,
	Settings,
	ArrowDownToLine,
	CalendarClock,
	Box,
	Trash2,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShowRollbackSettings } from "./show-rollback-settings";
import { ShowEnv } from "./show-env";
import { format } from "date-fns";
import { DialogAction } from "@/components/shared/dialog-action";
import { toast } from "sonner";

interface Props {
	applicationId: string;
}

export const ShowRollbacks = ({ applicationId }: Props) => {
	const { data: application } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);
	const { data, isLoading, refetch } = api.rollback.all.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const { mutateAsync: rollbackVersion, isLoading: isRollingBack } =
		api.rollback.rollback.useMutation();

	const { mutateAsync: deleteRollback, isLoading: isDeleting } =
		api.rollback.delete.useMutation();

	if (!application?.rollbackActive) {
		return (
			<Card className="border px-6 shadow-none bg-transparent h-full min-h-[50vh]">
				<CardHeader className="px-0">
					<div className="flex justify-between items-center">
						<div className="flex flex-col gap-2">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								Rollbacks
							</CardTitle>
							<CardDescription>
								Rollback to a previous deployment.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="py-0">
					<div className="flex flex-col gap-2 items-center justify-center py-12 rounded-lg">
						<Settings className="size-8 mb-4 text-muted-foreground" />
						<p className="text-lg font-medium text-muted-foreground">
							Rollbacks Not Enabled
						</p>
						<p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
							Enable rollbacks to keep track of previous deployments and roll
							back when needed.
						</p>
						<ShowRollbackSettings applicationId={applicationId}>
							<Button variant="outline" className="mt-4">
								Configure Rollbacks
							</Button>
						</ShowRollbackSettings>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border px-6 shadow-none bg-transparent h-full min-h-[50vh]">
			<CardHeader className="px-0">
				<div className="flex justify-between items-center">
					<div className="flex flex-col gap-2">
						<CardTitle className="text-xl font-bold flex items-center gap-2">
							Rollbacks
						</CardTitle>
						<CardDescription>
							Rollback to a previous deployment.
						</CardDescription>
					</div>
					<ShowRollbackSettings applicationId={applicationId}>
						<Button variant="outline" className="mt-4">
							Configure Rollbacks
						</Button>
					</ShowRollbackSettings>
				</div>
			</CardHeader>
			<CardContent className="px-0 py-0">
				{isLoading ? (
					<div className="flex gap-4   w-full items-center justify-center text-center mx-auto min-h-[45vh]">
						<Loader2 className="size-4 text-muted-foreground/70 transition-colors animate-spin self-center" />
						<span className="text-sm text-muted-foreground/70">
							Loading rollbacks...
						</span>
					</div>
				) : data && data.length > 0 ? (
					<div className="grid xl:grid-cols-2 gap-4 grid-cols-1 h-full">
						{data.map((rollback) => {
							return (
								<div
									key={rollback.rollbackId}
									className="flex flex-col rounded-lg border text-card-foreground shadow-sm"
								>
									<div className="p-6 flex flex-col gap-4">
										<div className="flex items-start justify-between">
											<div className="flex items-start gap-4">
												<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
													<ArrowDownToLine className="size-5 text-primary" />
												</div>
												<div className="space-y-1">
													<h3 className="font-medium leading-none flex items-center gap-2">
														Version {rollback.version}
													</h3>
													<div className="flex items-center gap-4 text-sm text-muted-foreground">
														<div className="flex items-center gap-1">
															<CalendarClock className="size-3.5" />
															<span>
																{format(
																	new Date(rollback.createdAt),
																	"MMM dd, yyyy HH:mm",
																)}
															</span>
														</div>
														{rollback.image && (
															<div className="flex items-center gap-1">
																<Box className="size-3.5" />
																<code className="text-xs bg-muted px-1 py-0.5 rounded">
																	{rollback.image}
																</code>
															</div>
														)}
													</div>
												</div>
											</div>

											<div className="flex flex-col items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													className="text-xs"
													isLoading={isRollingBack}
													onClick={async () => {
														await rollbackVersion({
															rollbackId: rollback.rollbackId,
														})
															.then(() => {
																refetch();
																toast.success("Rollback successful");
															})
															.catch(() => {
																toast.error("Error rolling back");
															});
													}}
												>
													Rollback to this version
												</Button>
												<ShowEnv env={rollback.env} />
												<DialogAction
													title="Delete Rollback"
													description="Are you sure you want to delete this rollback?"
													type="destructive"
													onClick={async () => {
														await deleteRollback({
															rollbackId: rollback.rollbackId,
														})
															.then(() => {
																refetch();
																toast.success("Rollback deleted successfully");
															})
															.catch(() => {
																toast.error("Error deleting rollback");
															});
													}}
												>
													<Button
														variant="ghost"
														size="icon"
														className="group hover:bg-red-500/10 "
														isLoading={isDeleting}
													>
														<Trash2 className="size-4 text-primary group-hover:text-red-500" />
													</Button>
												</DialogAction>
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex flex-col gap-2 items-center justify-center py-12  rounded-lg min-h-[30vh]">
						<RefreshCcw className="size-8 mb-4 text-muted-foreground" />
						<p className="text-lg font-medium text-muted-foreground">
							No rollbacks
						</p>
						<p className="text-sm text-muted-foreground mt-1">
							No rollbacks found for this application.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
