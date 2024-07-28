import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { AlertTriangle, Package } from "lucide-react";
import React from "react";
import { AddVolumes } from "../../application/advanced/volumes/add-volumes";
import { DeleteVolume } from "../../application/advanced/volumes/delete-volume";
import { UpdateVolume } from "../../application/advanced/volumes/update-volume";
interface Props {
	redisId: string;
}

export const ShowVolumes = ({ redisId }: Props) => {
	const { data, refetch } = api.redis.one.useQuery(
		{
			redisId,
		},
		{ enabled: !!redisId },
	);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row justify-between flex-wrap gap-4">
				<div>
					<CardTitle className="text-xl">Volumes</CardTitle>
					<CardDescription>
						If you want to persist data in this redis use the following config
						to setup the volumes
					</CardDescription>
				</div>

				{data && data?.mounts.length > 0 && (
					<AddVolumes serviceId={redisId} refetch={refetch} serviceType="redis">
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
						<AddVolumes
							serviceId={redisId}
							refetch={refetch}
							serviceType="redis"
						>
							Add Volume
						</AddVolumes>
					</div>
				) : (
					<div className="flex flex-col pt-2">
						<div className="flex flex-col sm:flex-row items-center gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
							<AlertTriangle className="text-yellow-600 size-5 sm:size-8 dark:text-yellow-400" />
							<span className="text-sm text-yellow-600 dark:text-yellow-400">
								Please remember to click Redeploy after adding, editing, or
								deleting a mount to apply the changes.
							</span>
						</div>
						<div className="flex flex-col gap-6 pt-6">
							{data?.mounts.map((mount) => (
								<div key={mount.mountId}>
									<div
										key={mount.mountId}
										className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-10 border rounded-lg p-4"
									>
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 flex-col gap-4 sm:gap-8">
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
													<span className="text-sm text-muted-foreground">
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
												serviceType="redis"
											/>
											<DeleteVolume mountId={mount.mountId} refetch={refetch} />
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
