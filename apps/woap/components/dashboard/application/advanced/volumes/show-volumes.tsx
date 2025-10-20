import { Package, Trash2 } from "lucide-react";
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
import type { ServiceType } from "../show-resources";
import { AddVolumes } from "./add-volumes";
import { UpdateVolume } from "./update-volume";

interface Props {
	id: string;
	type: ServiceType | "compose";
}

export const ShowVolumes = ({ id, type }: Props) => {
	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
		compose: () =>
			api.compose.one.useQuery({ composeId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });
	const { mutateAsync: deleteVolume, isLoading: isRemoving } =
		api.mounts.remove.useMutation();
	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">Volumes</CardTitle>
					<CardDescription>
						If you want to persist data in this service use the following config
						to setup the volumes
					</CardDescription>
				</div>

				{data && data?.mounts.length > 0 && (
					<AddVolumes serviceId={id} refetch={refetch} serviceType={type}>
						Add Volume
					</AddVolumes>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.mounts.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Package className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No volumes/mounts configured
						</span>
						<AddVolumes serviceId={id} refetch={refetch} serviceType={type}>
							Add Volume
						</AddVolumes>
					</div>
				) : (
					<div className="flex flex-col pt-2 gap-4">
						<AlertBlock type="warning">
							Please remember to click Redeploy after adding, editing, or
							deleting a mount to apply the changes.
						</AlertBlock>
						<div className="flex flex-col gap-6">
							{data?.mounts.map((mount) => (
								<div key={mount.mountId}>
									<div
										key={mount.mountId}
										className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4"
									>
										{/* <Package className="size-8 self-center text-muted-foreground" /> */}
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 flex-col gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Mount Type</span>
												<span className="text-sm text-muted-foreground">
													{mount.type.toUpperCase()}
												</span>
											</div>
											{mount.type === "volume" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">Volume Name</span>
													<span className="text-sm text-muted-foreground">
														{mount.volumeName}
													</span>
												</div>
											)}

											{mount.type === "file" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">Content</span>
													<span className="text-sm text-muted-foreground line-clamp-[10] whitespace-break-spaces">
														{mount.content}
													</span>
												</div>
											)}
											{mount.type === "bind" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">Host Path</span>
													<span className="text-sm text-muted-foreground">
														{mount.hostPath}
													</span>
												</div>
											)}
											{mount.type === "file" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">File Path</span>
													<span className="text-sm text-muted-foreground">
														{mount.filePath}
													</span>
												</div>
											)}

											<div className="flex flex-col gap-1">
												<span className="font-medium">Mount Path</span>
												<span className="text-sm text-muted-foreground">
													{mount.mountPath}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-1">
											<UpdateVolume
												mountId={mount.mountId}
												type={mount.type}
												refetch={refetch}
												serviceType={type}
											/>
											<DialogAction
												title="Delete Volume"
												description="Are you sure you want to delete this volume?"
												type="destructive"
												onClick={async () => {
													await deleteVolume({
														mountId: mount.mountId,
													})
														.then(() => {
															refetch();
															toast.success("Volume deleted successfully");
														})
														.catch(() => {
															toast.error("Error deleting volume");
														});
												}}
											>
												<Button
													variant="ghost"
													size="icon"
													className="group hover:bg-red-500/10"
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
