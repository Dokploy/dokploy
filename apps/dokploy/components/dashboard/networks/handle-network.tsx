"use client";

import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Network, Pencil, Plus, Trash2 } from "lucide-react";
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
/** Sentinel for the local Dokploy server (no serverId) */
const SERVER_LOCAL = "__server_local__";

const ipamConfigEntrySchema = z.object({
	subnet: z.string().optional(),
	ipRange: z.string().optional(),
	gateway: z.string().optional(),
});

const networkFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	driver: z.enum(networkDriverEnum),
	scope: z.string().optional(),
	serverId: z.string().optional(),
	internal: z.boolean(),
	attachable: z.boolean(),
	ingress: z.boolean(),
	configOnly: z.boolean(),
	enableIPv4: z.boolean(),
	enableIPv6: z.boolean(),
	ipamDriver: z.string().optional(),
	ipamConfig: z.array(ipamConfigEntrySchema),
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

const toggleOptions = [
	{
		name: "internal",
		label: "Internal",
		description: "Containers on this network cannot reach external networks.",
	},
	{
		name: "attachable",
		label: "Attachable",
		description: "Allow standalone containers to attach to this network.",
	},
	{
		name: "enableIPv4",
		label: "Enable IPv4",
		description: "Enable IPv4 addressing on the network.",
	},
	{
		name: "enableIPv6",
		label: "Enable IPv6",
		description: "Enable IPv6 addressing on the network.",
	},
	{
		name: "ingress",
		label: "Ingress",
		description: "Use as the routing-mesh network in Swarm mode.",
	},
	{
		name: "configOnly",
		label: "Config only",
		description: "Placeholder network whose config is reused by others.",
	},
] as const;

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

	const createMutation = api.network.create.useMutation();
	const updateMutation = api.network.update.useMutation();
	const isPending = isEdit
		? updateMutation.isPending
		: createMutation.isPending;

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

		const payload = {
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
		};

		try {
			if (isEdit && networkId) {
				await updateMutation.mutateAsync({ networkId, ...payload });
			} else {
				await createMutation.mutateAsync(payload);
			}

			toast.success(isEdit ? "Network updated" : "Network created");
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
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="serverId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Server</FormLabel>
											<Select
												onValueChange={(value) =>
													field.onChange(
														value === SERVER_LOCAL ? undefined : value,
													)
												}
												value={
													field.value ?? (isCloud ? undefined : SERVER_LOCAL)
												}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select server" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{!isCloud && (
														<SelectItem value={SERVER_LOCAL}>
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
													: "Dokploy server is the default local server."}
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
							</div>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{toggleOptions.map((option) => (
									<FormField
										key={option.name}
										control={form.control}
										name={option.name}
										render={({ field }) => (
											<FormItem className="flex flex-row items-start justify-between gap-3 space-y-0 rounded-lg border p-4">
												<div className="space-y-1 pr-1">
													<FormLabel>{option.label}</FormLabel>
													<FormDescription className="text-muted-foreground">
														{option.description}
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
								))}
							</div>
							<div className="space-y-4 rounded-lg border p-4">
								<div className="space-y-1">
									<FormLabel>IPAM</FormLabel>
									<p className="text-sm text-muted-foreground">
										IP address management settings for this network.
									</p>
								</div>
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
												aria-label="Remove IPAM config"
												onClick={() => ipamConfigFieldArray.remove(index)}
											>
												<Trash2 className="size-4" />
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
										<Plus className="size-4" />
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
								<Button type="submit" isLoading={isPending}>
									{isEdit ? "Update network" : "Create network"}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				)}
			</DialogContent>
		</Dialog>
	);
};
