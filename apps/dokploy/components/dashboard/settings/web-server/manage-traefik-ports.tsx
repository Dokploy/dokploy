import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Props for the ManageTraefikPorts component
 * @interface Props
 * @property {React.ReactNode} children - The trigger element that opens the ports management modal
 * @property {string} [serverId] - Optional ID of the server whose ports are being managed
 */
interface Props {
	children: React.ReactNode;
	serverId?: string;
}

/**
 * Represents a port mapping configuration for Traefik
 * @interface AdditionalPort
 * @property {number} targetPort - The internal port that the service is listening on
 * @property {number} publishedPort - The external port that will be exposed
 * @property {"ingress" | "host"} publishMode - The Docker Swarm publish mode:
 *   - "host": Publishes the port directly on the host
 *   - "ingress": Publishes the port through the Swarm routing mesh
 */
interface AdditionalPort {
	targetPort: number;
	publishedPort: number;
	publishMode: "ingress" | "host";
}

/**
 * ManageTraefikPorts is a component that provides a modal interface for managing
 * additional port mappings for Traefik in a Docker Swarm environment.
 *
 * Features:
 * - Add, remove, and edit port mappings
 * - Configure target port, published port, and publish mode for each mapping
 * - Persist port configurations through API calls
 *
 * @component
 * @example
 * ```tsx
 * <ManageTraefikPorts serverId="server-123">
 *   <Button>Manage Ports</Button>
 * </ManageTraefikPorts>
 * ```
 */
export const ManageTraefikPorts = ({ children, serverId }: Props) => {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);
	const [additionalPorts, setAdditionalPorts] = useState<AdditionalPort[]>([]);
	const [isDirty, setIsDirty] = useState(false);

	const { data: currentPorts, refetch: refetchPorts } =
		api.settings.getTraefikPorts.useQuery({
			serverId,
		});

	const { mutateAsync: updatePorts, isLoading } =
		api.settings.updateTraefikPorts.useMutation({
			onSuccess: () => {
				refetchPorts();
			},
		});

	useEffect(() => {
		if (currentPorts) {
			setAdditionalPorts(currentPorts);
		}
	}, [currentPorts]);

	const handleAddPort = () => {
		setAdditionalPorts([
			...additionalPorts,
			{ targetPort: 0, publishedPort: 0, publishMode: "host" },
		]);
		setIsDirty(true);
	};

	const handleUpdatePorts = async () => {
		try {
			await updatePorts({
				serverId,
				additionalPorts,
			});
			toast.success(t("settings.server.webServer.traefik.portsUpdated"));
			setOpen(false);
			setIsDirty(false);
		} catch (error) {
			toast.error(t("settings.server.webServer.traefik.portsUpdateError"));
		}
	};

	const handleRemovePort = (index: number) => {
		const newPorts = additionalPorts.filter((_, i) => i !== index);
		setAdditionalPorts(newPorts);
		setIsDirty(true);
	};

	return (
		<>
			<div onClick={() => setOpen(true)}>{children}</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							{t("settings.server.webServer.traefik.managePorts")}
						</DialogTitle>
						<DialogDescription className="text-base w-full">
							<div className="flex items-center justify-between">
								{t("settings.server.webServer.traefik.managePortsDescription")}
								<Button
									onClick={handleAddPort}
									variant="default"
									className="gap-2"
								>
									<Plus className="h-4 w-4" />
									Add Mapping
								</Button>
							</div>
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-6 py-4">
						{additionalPorts.length === 0 ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
								<ArrowRightLeft className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground text-center">
									No port mappings configured
								</span>
								<p className="text-sm text-muted-foreground text-center">
									Add one to get started
								</p>
							</div>
						) : (
							<div className="grid gap-4">
								{additionalPorts.map((port, index) => (
									<Card key={index}>
										<CardContent className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-4 p-4 transparent">
											<div className="space-y-2">
												<Label
													htmlFor={`target-port-${index}`}
													className="text-sm font-medium text-muted-foreground"
												>
													{t("settings.server.webServer.traefik.targetPort")}
												</Label>
												<Input
													id={`target-port-${index}`}
													type="number"
													value={port.targetPort}
													onChange={(e) => {
														const newPorts = [...additionalPorts];
														if (newPorts[index]) {
															newPorts[index].targetPort = Number.parseInt(
																e.target.value,
															);
														}
														setAdditionalPorts(newPorts);
													}}
													className="w-full dark:bg-black"
													placeholder="e.g. 8080"
												/>
											</div>

											<div className="space-y-2">
												<Label
													htmlFor={`published-port-${index}`}
													className="text-sm font-medium text-muted-foreground"
												>
													{t("settings.server.webServer.traefik.publishedPort")}
												</Label>
												<Input
													id={`published-port-${index}`}
													type="text"
													value={port.publishedPort}
													onChange={(e) => {
														const newPorts = [...additionalPorts];
														if (newPorts[index]) {
															newPorts[index].publishedPort = Number.parseInt(
																e.target.value,
															);
														}
														setAdditionalPorts(newPorts);
													}}
													className="w-full dark:bg-black"
													placeholder="e.g. 80"
												/>
											</div>

											<div className="space-y-2">
												<Label
													htmlFor={`publish-mode-${index}`}
													className="text-sm font-medium text-muted-foreground"
												>
													{t("settings.server.webServer.traefik.publishMode")}
												</Label>
												<Select
													value={port.publishMode}
													onValueChange={(value: "ingress" | "host") => {
														const newPorts = [...additionalPorts];
														if (newPorts[index]) {
															newPorts[index].publishMode = value;
														}
														setAdditionalPorts(newPorts);
													}}
												>
													<SelectTrigger
														id={`publish-mode-${index}`}
														className="dark:bg-black"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="host">Host Mode</SelectItem>
														<SelectItem value="ingress">
															Ingress Mode
														</SelectItem>
													</SelectContent>
												</Select>
											</div>

											<div className="flex items-end">
												<Button
													onClick={() => handleRemovePort(index)}
													variant="ghost"
													size="icon"
													className="text-muted-foreground hover:text-destructive"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						)}

						{additionalPorts.length > 0 && (
							<AlertBlock type="info">
								<div className="flex flex-col gap-2">
									<span className="text-sm">
										<strong>
											Each port mapping defines how external traffic reaches
											your containers.
										</strong>
										<ul className="pt-2">
											<li>
												<strong>Host Mode:</strong> Directly binds the port to
												the host machine.
												<ul className="p-2 list-inside list-disc">
													<li>
														Best for single-node deployments or when you need
														guaranteed port availability.
													</li>
												</ul>
											</li>
											<li>
												<strong>Ingress Mode:</strong> Routes through Docker
												Swarm's load balancer.
												<ul className="p-2 list-inside list-disc">
													<li>
														Recommended for multi-node deployments and better
														scalability.
													</li>
												</ul>
											</li>
										</ul>
									</span>
								</div>
							</AlertBlock>
						)}
					</div>

					<DialogFooter className="">
						{(additionalPorts.length > 0 || isDirty) && (
							<Button
								variant="default"
								className="text-sm"
								onClick={handleUpdatePorts}
								disabled={isLoading || !isDirty}
							>
								Save
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};

export default ManageTraefikPorts;
