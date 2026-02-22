"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Network, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

const networkDriverEnum = [
	"bridge",
	"host",
	"overlay",
	"macvlan",
	"none",
	"ipvlan",
] as const;

/** Sentinel for "no scope" */
const SCOPE_EMPTY = "__scope_none__";

const ipamConfigEntrySchema = z.object({
	subnet: z.string().optional(),
	ipRange: z.string().optional(),
	gateway: z.string().optional(),
});

const networkFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	driver: z.enum(networkDriverEnum).default("bridge"),
	scope: z.string().optional(),
	serverId: z.string().optional(),
	internal: z.boolean().default(false),
	attachable: z.boolean().default(false),
	ingress: z.boolean().default(false),
	configOnly: z.boolean().default(false),
	enableIPv4: z.boolean().default(true),
	enableIPv6: z.boolean().default(false),
	ipamDriver: z.string().optional(),
	ipamConfig: z.array(ipamConfigEntrySchema).default([]),
});

type NetworkFormValues = z.infer<typeof networkFormSchema>;

const defaultValues: NetworkFormValues = {
	name: "",
	driver: "bridge",
	scope: SCOPE_EMPTY,
	serverId: undefined,
	internal: false,
	attachable: false,
	ingress: false,
	configOnly: false,
	enableIPv4: true,
	enableIPv6: false,
	ipamDriver: "",
	ipamConfig: [],
};

interface HandleNetworkProps {
	networkId?: string;
	children?: React.ReactNode;
}

export const HandleNetwork = ({ networkId, children }: HandleNetworkProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const utils = api.useUtils();
	const isEdit = !!networkId;

	const { data: servers } = api.server.all.useQuery();
	const { data: network, isLoading: isLoadingNetwork } =
		api.network.one.useQuery(
			{ networkId: networkId! },
			{ enabled: isEdit && !!networkId },
		);

	const { mutateAsync, isLoading: isPending } = networkId
		? api.network.update.useMutation()
		: api.network.create.useMutation();

	const form = useForm<NetworkFormValues>({
		resolver: zodResolver(networkFormSchema),
		defaultValues,
	});

	const ipamConfigFieldArray = useFieldArray({
		control: form.control,
		name: "ipamConfig",
	});

	useEffect(() => {
		if (isEdit && network && isOpen) {
			const ipam = network.ipam ?? {};
			const ipamConfigArr = (ipam.config ?? []).map((c) => ({
				subnet: c.subnet ?? "",
				ipRange: c.ipRange ?? "",
				gateway: c.gateway ?? "",
			}));
			form.reset({
				...defaultValues,
				name: network.name,
				driver: network.driver,
				scope: network.scope ?? SCOPE_EMPTY,
				serverId: network.serverId || undefined,
				internal: network.internal,
				attachable: network.attachable,
				enableIPv4: network.enableIPv4,
				enableIPv6: network.enableIPv6,
				ipamDriver: ipam.driver ?? "",
				ipamConfig: ipamConfigArr,
				ingress: network.ingress,
				configOnly: network.configOnly,
			});
		}
	}, [isEdit, isOpen, network, form]);

	const onSubmit = async (data: NetworkFormValues) => {
		const scope =
			data.scope && data.scope !== SCOPE_EMPTY ? data.scope : undefined;

		try {
			await mutateAsync({
				networkId: networkId ?? "",
				name: data.name,
				driver: data.driver,
				scope,
				serverId: data.serverId || undefined,
				internal: data.internal,
				attachable: data.attachable,
				ingress: data.ingress,
				configOnly: data.configOnly,
				enableIPv4: data.enableIPv4,
				enableIPv6: data.enableIPv6,
				ipam: {
					driver: data.ipamDriver,
					config: data.ipamConfig,
				},
			});

			await utils.network.all.invalidate();
			if (networkId) await utils.network.one.invalidate({ networkId });
			setIsOpen(false);
			form.reset(defaultValues);
		} catch {
			toast.error(isEdit ? "Error updating network" : "Error creating network");
		}
	};

	const trigger =
		children ??
		(isEdit ? (
			<Button size="sm" variant="outline">
				<Pencil className=" size-4" />
				Edit
			</Button>
		) : (
			<Button>
				<Plus className=" size-4" />
				Add network
			</Button>
		));

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Network className="size-5 text-muted-foreground" />
						{isEdit ? "Edit network" : "Add network"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update this Docker network. Changes apply to name, driver, and server assignment."
							: "Create a new Docker network for your organization. You can optionally assign it to a server."}
					</DialogDescription>
				</DialogHeader>
				{isEdit && isLoadingNetwork ? (
					<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
						Loading network…
					</div>
				) : (
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex w-full flex-col gap-6"
						>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="my-network" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="driver"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Driver</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select driver" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{networkDriverEnum.map((d) => (
														<SelectItem key={d} value={d}>
															{d}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="serverId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Server</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value ?? undefined}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select server" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{!isCloud && (
													<SelectItem value={undefined}>
														Dokploy server
													</SelectItem>
												)}
												{servers?.map((server) => (
													<SelectItem
														key={server.serverId}
														value={server.serverId}
													>
														{server.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription className="text-muted-foreground">
											{isCloud
												? "Server where this network will be created."
												: "Dokploy server is the default local server; or choose a specific server."}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="scope"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Scope (optional)</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value ?? SCOPE_EMPTY}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select scope" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value={SCOPE_EMPTY}>None</SelectItem>
												<SelectItem value="local">local</SelectItem>
												<SelectItem value="swarm">swarm</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="internal"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Internal</FormLabel>
												<FormDescription className="text-muted-foreground">
													Restrict external access; containers on this network
													cannot reach external networks.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="attachable"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Attachable</FormLabel>
												<FormDescription className="text-muted-foreground">
													Allow standalone containers to attach to this network
													(e.g. in Swarm, not only services).
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="enableIPv4"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Enable IPv4</FormLabel>
												<FormDescription className="text-muted-foreground">
													Enable IPv4 addressing on the network.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="enableIPv6"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Enable IPv6</FormLabel>
												<FormDescription className="text-muted-foreground">
													Enable IPv6 addressing on the network.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ingress"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Ingress</FormLabel>
												<FormDescription className="text-muted-foreground">
													Use as the routing-mesh network in Swarm mode (load
													balancing between nodes).
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="configOnly"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
											<div className="space-y-0.5">
												<FormLabel className="text-base">Config only</FormLabel>
												<FormDescription className="text-muted-foreground">
													Create a placeholder network whose config is reused by
													other networks; cannot run containers on it.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
							<div className="space-y-2 rounded-lg border p-4">
								<FormLabel>IPAM</FormLabel>
								<FormField
									control={form.control}
									name="ipamDriver"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-muted-foreground">
												Driver (optional)
											</FormLabel>
											<FormControl>
												<Input {...field} placeholder="default" />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<div className="space-y-2">
									<FormLabel className="text-muted-foreground">
										Config (subnet / gateway / IP range)
									</FormLabel>
									{ipamConfigFieldArray.fields.map((field, index) => (
										<div key={field.id} className="flex flex-wrap gap-2">
											<FormField
												control={form.control}
												name={`ipamConfig.${index}.subnet`}
												render={({ field: f }) => (
													<FormItem className="min-w-[140px] flex-1">
														<FormControl>
															<Input
																{...f}
																placeholder="Subnet (e.g. 172.20.0.0/16)"
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name={`ipamConfig.${index}.ipRange`}
												render={({ field: f }) => (
													<FormItem className="min-w-[120px] flex-1">
														<FormControl>
															<Input {...f} placeholder="IP range" />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name={`ipamConfig.${index}.gateway`}
												render={({ field: f }) => (
													<FormItem className="min-w-[120px] flex-1">
														<FormControl>
															<Input {...f} placeholder="Gateway" />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => ipamConfigFieldArray.remove(index)}
											>
												−
											</Button>
										</div>
									))}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											ipamConfigFieldArray.append({
												subnet: "",
												ipRange: "",
												gateway: "",
											})
										}
									>
										Add IPAM config
									</Button>
								</div>
							</div>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsOpen(false)}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isPending}>
									{isPending
										? isEdit
											? "Updating…"
											: "Creating…"
										: isEdit
											? "Update network"
											: "Create network"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
