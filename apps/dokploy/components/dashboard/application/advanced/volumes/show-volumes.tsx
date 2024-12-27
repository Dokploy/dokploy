import { AlertBlock } from "@/components/shared/alert-block";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { Package } from "lucide-react";
import React from "react";
import { AddVolumes } from "./add-volumes";
import { DeleteVolume } from "./delete-volume";
import { UpdateVolume } from "./update-volume";
interface Props {
	applicationId: string;
}

export const ShowVolumes = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row flex-wrap justify-between gap-4">
				<div>
					<CardTitle className="text-xl">Volumes</CardTitle>
					<CardDescription>
						If you want to persist data in this application use the following
						config to setup the volumes
					</CardDescription>
				</div>

				{data && data?.mounts.length > 0 && (
					<AddVolumes
						serviceId={applicationId}
						refetch={refetch}
						serviceType="application"
					>
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
							serviceId={applicationId}
							refetch={refetch}
							serviceType="application"
						>
							Add Volume
						</AddVolumes>
					</div>
				) : (
					<div className="flex flex-col gap-4 pt-2">
						<AlertBlock type="info">
							Please remember to click Redeploy after adding, editing, or
							deleting a mount to apply the changes.
						</AlertBlock>
						<div className="flex flex-col gap-6">
							{data?.mounts.map((mount) => (
								<div key={mount.mountId}>
									<div
										key={mount.mountId}
										className="flex w-full flex-col justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-10"
									>
										<div className="grid grid-cols-1 flex-col gap-4 sm:grid-cols-2 sm:gap-8 md:grid-cols-4">
											<div className="flex flex-col gap-1">
												<span className="font-medium">Mount Type</span>
												<span className="text-muted-foreground text-sm">
													{mount.type.toUpperCase()}
												</span>
											</div>
											{mount.type === "volume" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">Volume Name</span>
													<span className="text-muted-foreground text-sm">
														{mount.volumeName}
													</span>
												</div>
											)}

											{mount.type === "file" && (
												<>
													<div className="flex flex-col gap-1">
														<span className="font-medium">Content</span>
														<span className="text-muted-foreground text-sm">
															{mount.content}
														</span>
													</div>

													<div className="flex flex-col gap-1">
														<span className="font-medium">File Path</span>
														<span className="text-muted-foreground text-sm">
															{mount.filePath}
														</span>
													</div>
												</>
											)}
											{mount.type === "bind" && (
												<div className="flex flex-col gap-1">
													<span className="font-medium">Host Path</span>
													<span className="text-muted-foreground text-sm">
														{mount.hostPath}
													</span>
												</div>
											)}
											<div className="flex flex-col gap-1">
												<span className="font-medium">Mount Path</span>
												<span className="text-muted-foreground text-sm">
													{mount.mountPath}
												</span>
											</div>
										</div>
										<div className="flex flex-row gap-1">
											<UpdateVolume
												mountId={mount.mountId}
												type={mount.type}
												refetch={refetch}
												serviceType="application"
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
