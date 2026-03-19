import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/utils/api";

interface NetworkDetailsDialogProps {
	children: React.ReactNode;
	networkId: string;
	serverId?: string | null;
}

export function NetworkDetailsDialog({
	children,
	networkId,
	serverId,
}: NetworkDetailsDialogProps) {
	const [isOpen, setIsOpen] = useState(false);

	const {
		data: networkDetails,
		isLoading,
		error,
	} = api.network.getById.useQuery(
		{ networkId, serverId: serverId || undefined },
		{ enabled: isOpen },
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Network details</DialogTitle>
					<DialogDescription>
						Detailed information about the network
					</DialogDescription>
				</DialogHeader>

				{isLoading && (
					<div className="space-y-4">
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-3/4" />
						<Skeleton className="h-6 w-1/2" />
						<Skeleton className="h-20 w-full" />
					</div>
				)}

				{error && (
					<div className="text-center py-8 text-muted-foreground">
						Failed to load network details: {error.message}
					</div>
				)}

				{networkDetails && (
					<div className="space-y-6">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Name
								</h4>
								<p className="mt-1">{networkDetails.Name}</p>
							</div>
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Network ID
								</h4>
								<p className="mt-1 font-mono text-xs break-all">
									{networkDetails.Id}
								</p>
							</div>
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Driver
								</h4>
								<div className="mt-1">
									<Badge variant="outline" className="capitalize">
										{networkDetails.Driver}
									</Badge>
								</div>
							</div>
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Scope
								</h4>
								<div className="mt-1">
									<Badge
										variant={
											networkDetails.Scope === "local" ? "secondary" : "default"
										}
										className="capitalize"
									>
										{networkDetails.Scope}
									</Badge>
								</div>
							</div>
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Created
								</h4>
								<p className="mt-1 text-sm">
									{new Date(networkDetails.Created).toLocaleString()}
								</p>
							</div>
							<div>
								<h4 className="font-semibold text-sm text-muted-foreground">
									Internal
								</h4>
								<div className="mt-1">
									<Badge
										variant={
											networkDetails.Internal ? "destructive" : "default"
										}
									>
										{networkDetails.Internal ? "Yes" : "No"}
									</Badge>
								</div>
							</div>
						</div>

						<Separator />

						{/* IPAM Configuration */}
						{networkDetails.IPAM?.Config &&
							networkDetails.IPAM.Config.length > 0 && (
								<div>
									<h4 className="font-semibold mb-3">IPAM Configuration</h4>
									<div className="space-y-3">
										{networkDetails.IPAM.Config.map(
											(config: any, index: number) => (
												<div
													key={index}
													className="border rounded-lg p-3 space-y-2"
												>
													<div className="grid grid-cols-2 gap-4 text-sm">
														{config.Subnet && (
															<div>
																<span className="font-medium text-muted-foreground">
																	Subnet:
																</span>
																<p className="font-mono">{config.Subnet}</p>
															</div>
														)}
														{config.Gateway && (
															<div>
																<span className="font-medium text-muted-foreground">
																	Gateway:
																</span>
																<p className="font-mono">{config.Gateway}</p>
															</div>
														)}
														{config.IPRange && (
															<div>
																<span className="font-medium text-muted-foreground">
																	IP Range:
																</span>
																<p className="font-mono">{config.IPRange}</p>
															</div>
														)}
													</div>
												</div>
											),
										)}
									</div>
								</div>
							)}

						{/* Connected Containers */}
						{networkDetails.Containers &&
							Object.keys(networkDetails.Containers).length > 0 && (
								<div>
									<h4 className="font-semibold mb-3">
										Connected Containers (
										{Object.keys(networkDetails.Containers).length})
									</h4>
									<div className="space-y-2">
										{Object.entries(networkDetails.Containers).map(
											([containerId, containerInfo]: [string, any]) => (
												<div
													key={containerId}
													className="border rounded-lg p-3"
												>
													<div className="grid grid-cols-1 gap-2 text-sm">
														<div>
															<span className="font-medium text-muted-foreground">
																Name:
															</span>
															<p className="font-medium">
																{containerInfo.Name}
															</p>
														</div>
														<div className="grid grid-cols-2 gap-4">
															<div>
																<span className="font-medium text-muted-foreground">
																	IPv4 Address:
																</span>
																<p className="font-mono text-xs">
																	{containerInfo.IPv4Address || "N/A"}
																</p>
															</div>
															<div>
																<span className="font-medium text-muted-foreground">
																	MAC Address:
																</span>
																<p className="font-mono text-xs">
																	{containerInfo.MacAddress || "N/A"}
																</p>
															</div>
														</div>
													</div>
												</div>
											),
										)}
									</div>
								</div>
							)}

						{/* Driver Options */}
						{networkDetails.Options &&
							Object.keys(networkDetails.Options).length > 0 && (
								<div>
									<h4 className="font-semibold mb-3">Driver Options</h4>
									<div className="border rounded-lg p-3">
										<div className="grid gap-2 text-sm">
											{Object.entries(networkDetails.Options).map(
												([key, value]) => (
													<div key={key} className="grid grid-cols-2 gap-4">
														<span className="font-medium text-muted-foreground">
															{key}:
														</span>
														<span className="font-mono text-xs break-all">
															{String(value)}
														</span>
													</div>
												),
											)}
										</div>
									</div>
								</div>
							)}

						{/* Labels */}
						{networkDetails.Labels &&
							Object.keys(networkDetails.Labels).length > 0 && (
								<div>
									<h4 className="font-semibold mb-3">Labels</h4>
									<div className="border rounded-lg p-3">
										<div className="grid gap-2 text-sm">
											{Object.entries(networkDetails.Labels).map(
												([key, value]) => (
													<div key={key} className="grid grid-cols-2 gap-4">
														<span className="font-medium text-muted-foreground">
															{key}:
														</span>
														<span className="font-mono text-xs break-all">
															{String(value)}
														</span>
													</div>
												),
											)}
										</div>
									</div>
								</div>
							)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
