import { Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
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
import { UpdateComposeVolume } from "./update-compose-volume";
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
	const { data: composeVolumes, refetch: refetchComposeVolumes } =
		api.compose.getComposeVolumes.useQuery(
			{ composeId: id },
			{ enabled: !!id && type === "compose" },
		);
	const { mutateAsync: removeComposeVolume, isLoading: isRemovingCompose } =
		api.compose.removeComposeVolume.useMutation();
	const sourceType =
		data && "sourceType" in data ? data.sourceType : undefined;
	const isRawCompose = type === "compose" && sourceType === "raw";
	const dbMounts = data?.mounts ?? [];
	const yamlVolumes = composeVolumes ?? [];
	const hasAny = dbMounts.length > 0 || yamlVolumes.length > 0;

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

				{hasAny && (
					<AddVolumes
						serviceId={id}
						refetch={refetch}
						serviceType={type}
						sourceType={sourceType}
					>
						Add Volume
					</AddVolumes>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!hasAny ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<Package className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No volumes/mounts configured
						</span>
						<AddVolumes
							serviceId={id}
							refetch={refetch}
							serviceType={type}
							sourceType={sourceType}
						>
							Add Volume
						</AddVolumes>
					</div>
				) : (
					<div className="flex flex-col pt-2 gap-4">
						<AlertBlock type="warning">
							Please remember to click Redeploy after adding, editing, or
							deleting a mount to apply the changes.
						</AlertBlock>

						{/* DB Mounts (file mounts stored in database) */}
						{dbMounts.length > 0 && (
							<div className="flex flex-col gap-4">
								{dbMounts.map((mount) => (
									<div
										key={mount.mountId}
										className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4"
									>
										<div className="grid grid-cols-1 sm:grid-cols-3 flex-1 gap-4 sm:gap-8">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Type</span>
												<span className="text-sm text-muted-foreground">
													{mount.type.toUpperCase()}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">
													{mount.type === "bind"
														? "Host Path"
														: mount.type === "volume"
															? "Volume Name"
															: "File Path"}
												</span>
												<span className="text-sm text-muted-foreground break-all">
													{mount.type === "bind"
														? mount.hostPath
														: mount.type === "volume"
															? mount.volumeName
															: mount.filePath}
												</span>
											</div>
											<div className="flex flex-col gap-1">
												<span className="font-medium">Mount Path</span>
												<span className="text-sm text-muted-foreground break-all">
													{mount.mountPath || "/"}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-1 shrink-0">
											<UpdateVolume
												mountId={mount.mountId}
												type={mount.type}
												refetch={refetch}
												serviceType={type}
											/>
											<DialogAction
												title="Delete Mount"
												description="Are you sure you want to delete this mount?"
												type="destructive"
												onClick={async () => {
													await deleteVolume({ mountId: mount.mountId })
														.then(() => {
															refetch();
															toast.success("Mount deleted successfully");
														})
														.catch(() => {
															toast.error("Error deleting mount");
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
								))}
							</div>
						)}

						{/* YAML Volumes (from docker-compose.yml) */}
						{yamlVolumes.length > 0 && (
							<div className="flex flex-col gap-4">
								{yamlVolumes.map((vol, i) => (
									<div
										key={`yaml-${vol.serviceName}-${i}`}
										className={`flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4 ${!isRawCompose ? "opacity-50" : ""}`}
									>
										<div className="flex flex-col flex-1 gap-3">
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
												<div className="flex flex-col gap-1">
													<span className="font-medium">Source</span>
													<span className="text-sm text-muted-foreground break-all">
														{vol.source}
													</span>
												</div>
												<div className="flex flex-col gap-1">
													<span className="font-medium">Target</span>
													<span className="text-sm text-muted-foreground break-all">
														{vol.target}
													</span>
												</div>
											</div>
											<div className="flex flex-row gap-2">
												<Badge variant="secondary">{vol.type}</Badge>
												<Badge variant="secondary">{vol.serviceName}</Badge>
											</div>
										</div>
										{isRawCompose && (
											<div className="flex flex-row gap-1 shrink-0">
												<UpdateComposeVolume
													composeId={id}
													volume={vol}
													refetch={refetchComposeVolumes}
												/>
												<DialogAction
													title="Delete Volume"
													description="Are you sure you want to delete this volume from the compose file?"
													type="destructive"
													onClick={async () => {
														await removeComposeVolume({
															composeId: id,
															serviceName: vol.serviceName,
															target: vol.target,
														})
															.then(() => {
																refetchComposeVolumes();
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
														isLoading={isRemovingCompose}
													>
														<Trash2 className="size-4 text-primary group-hover:text-red-500" />
													</Button>
												</DialogAction>
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
};
