import type { ServiceType } from "@dokploy/server/db/schema";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { type LogLine, parseLogs } from "../docker/logs/utils";

const LOCAL_SERVER = "dokploy";

const transferSchema = z.object({
	targetServerId: z.string().min(1, { message: "Select a target server" }),
	removeSourceData: z.boolean(),
});

type TransferForm = z.infer<typeof transferSchema>;

interface Props {
	id: string;
	type: ServiceType;
	serverId?: string | null;
}

export const TransferService = ({ id, type, serverId }: Props) => {
	const utils = api.useUtils();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const [isOpen, setIsOpen] = useState(false);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isTransferring, setIsTransferring] = useState(false);
	const [logs, setLogs] = useState<LogLine[]>([]);
	const [request, setRequest] = useState<{
		targetServerId: string | null;
		removeSourceData: boolean;
	} | null>(null);

	const targets = [
		...(!isCloud && serverId
			? [{ serverId: LOCAL_SERVER, name: "Dokploy Server" }]
			: []),
		...(servers ?? []).filter((server) => server.serverId !== serverId),
	];

	const form = useForm<TransferForm>({
		defaultValues: { targetServerId: "", removeSourceData: false },
		resolver: zodResolver(transferSchema),
	});

	api.transfer.start.useSubscription(
		{
			serviceType: type,
			serviceId: id,
			targetServerId: request?.targetServerId ?? null,
			removeSourceData: request?.removeSourceData ?? false,
		},
		{
			enabled: isTransferring && request !== null,
			onData(line) {
				setLogs((prev) => [...prev, ...parseLogs(line)]);
				if (line.startsWith("Transfer completed")) {
					setIsTransferring(false);
					toast.success("Service transferred successfully");
					utils.invalidate();
				} else if (line.startsWith("Transfer failed")) {
					setIsTransferring(false);
					toast.error("Transfer failed, check the logs");
					utils.invalidate();
				}
			},
			onError(error) {
				setIsTransferring(false);
				toast.error(error.message);
			},
		},
	);

	const onSubmit = (values: TransferForm) => {
		setRequest({
			targetServerId:
				values.targetServerId === LOCAL_SERVER ? null : values.targetServerId,
			removeSourceData: values.removeSourceData,
		});
		setLogs([]);
		setIsDrawerOpen(true);
		setIsTransferring(true);
		setIsOpen(false);
	};

	return (
		<>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
						isLoading={isTransferring}
					>
						<ArrowRightLeft className="size-4 text-primary group-hover:text-blue-500" />
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Transfer to another server</DialogTitle>
						<DialogDescription>
							Moves this service with its volumes, bind mounts, file mounts and
							configuration to the selected server, then deploys it there.
						</DialogDescription>
					</DialogHeader>
					{targets.length === 0 ? (
						<AlertBlock type="info">
							There are no other servers available to transfer this service to.
						</AlertBlock>
					) : (
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-transfer-service"
								className="grid w-full gap-4"
							>
								<FormField
									control={form.control}
									name="targetServerId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Target server</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a server" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{targets.map((server) => (
														<SelectItem
															key={server.serverId}
															value={server.serverId}
														>
															{server.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="removeSourceData"
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center">
												<FormControl>
													<Checkbox
														checked={field.value}
														onCheckedChange={field.onChange}
													/>
												</FormControl>
												<FormLabel className="ml-2">
													Remove volumes from the source server after the
													transfer
												</FormLabel>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
								<AlertBlock type="warning">
									<ul className="list-disc pl-4 space-y-1">
										<li>The service is stopped while its data is copied.</li>
										<li>
											Point your DNS records to the new server, certificates are
											issued again there.
										</li>
										<li>
											Networks that only exist on the current server are
											detached.
										</li>
										<li>
											Bind mount host paths are copied but never deleted from
											the source server.
										</li>
									</ul>
								</AlertBlock>
							</form>
						</Form>
					)}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setIsOpen(false)}>
							Cancel
						</Button>
						{targets.length > 0 && (
							<Button
								isLoading={isTransferring}
								form="hook-form-transfer-service"
								type="submit"
							>
								Transfer
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<DrawerLogs
				isOpen={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
				filteredLogs={logs}
			/>
		</>
	);
};
