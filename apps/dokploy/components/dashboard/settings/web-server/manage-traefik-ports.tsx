import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
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
	};

	const handleUpdatePorts = async () => {
		try {
			await updatePorts({
				serverId,
				additionalPorts,
			});
			toast.success(t("settings.server.webServer.traefik.portsUpdated"));
			setOpen(false);
		} catch (error) {
			toast.error(t("settings.server.webServer.traefik.portsUpdateError"));
		}
	};

	return (
		<>
			<div onClick={() => setOpen(true)}>{children}</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							{t("settings.server.webServer.traefik.managePorts")}
						</DialogTitle>
						<DialogDescription>
							{t("settings.server.webServer.traefik.managePortsDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						{additionalPorts.map((port, index) => (
							<div
								key={index}
								className="grid grid-cols-[120px_120px_minmax(120px,1fr)_80px] gap-4 items-end"
							>
								<div className="space-y-2">
									<Label htmlFor={`target-port-${index}`}>
										{t("settings.server.webServer.traefik.targetPort")}
									</Label>
									<input
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
										className="w-full rounded border p-2"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={`published-port-${index}`}>
										{t("settings.server.webServer.traefik.publishedPort")}
									</Label>
									<input
										id={`published-port-${index}`}
										type="number"
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
										className="w-full rounded border p-2"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={`publish-mode-${index}`}>
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
											className="w-full"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="host">Host</SelectItem>
											<SelectItem value="ingress">Ingress</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div>
									<Button
										onClick={() => {
											const newPorts = additionalPorts.filter(
												(_, i) => i !== index,
											);
											setAdditionalPorts(newPorts);
										}}
										variant="destructive"
										size="sm"
									>
										Remove
									</Button>
								</div>
							</div>
						))}
						<div className="mt-4 flex justify-between">
							<Button onClick={handleAddPort} variant="outline" size="sm">
								{t("settings.server.webServer.traefik.addPort")}
							</Button>
							<Button
								onClick={handleUpdatePorts}
								size="sm"
								disabled={isLoading}
							>
								Save
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
