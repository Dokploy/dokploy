import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	composeId: string;
}

const serviceSchema = z.object({
	serviceName: z.string(),
	networkIds: z.array(z.string()),
	detachDokployNetwork: z.boolean(),
});

const formSchema = z.object({
	services: z.array(serviceSchema),
});

type FormValues = z.infer<typeof formSchema>;

export const AssignComposeNetworks = ({ composeId }: Props) => {
	const [cacheType, setCacheType] = useState<"cache" | "fetch">("cache");

	const { data: compose } = api.compose.one.useQuery({ composeId });
	const {
		data: services,
		isLoading: isLoadingServices,
		error: servicesError,
		refetch: refetchServices,
		isRefetching: isRefetchingServices,
	} = api.compose.loadServices.useQuery(
		{ composeId, type: cacheType },
		{ retry: false },
	);

	const onRetry = () => {
		setCacheType("fetch");
		setTimeout(() => refetchServices(), 0);
	};

	const { data: networks } = api.network.all.useQuery(
		{ serverId: compose?.serverId ?? undefined },
		{ enabled: compose !== undefined },
	);
	const { mutateAsync, isPending } = api.compose.update.useMutation();
	const utils = api.useUtils();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { services: [] },
	});
	const { fields } = useFieldArray({
		control: form.control,
		name: "services",
	});

	useEffect(() => {
		if (!services) return;
		const serviceNetworks = compose?.serviceNetworks ?? [];
		form.reset({
			services: services.map((serviceName) => {
				const config = serviceNetworks.find(
					(s) => s.serviceName === serviceName,
				);
				return {
					serviceName,
					networkIds: config?.networkIds ?? [],
					detachDokployNetwork: config?.detachDokployNetwork ?? false,
				};
			}),
		});
	}, [services, compose?.serviceNetworks, form]);

	const allowsBridge = compose?.composeType === "docker-compose";
	const availableNetworks = (networks ?? []).filter(
		(n) => allowsBridge || n.driver === "overlay",
	);

	const onSubmit = async (values: FormValues) => {
		try {
			const serviceNetworks = values.services.filter(
				(s) => s.networkIds.length > 0 || s.detachDokployNetwork,
			);
			await mutateAsync({
				composeId,
				serviceNetworks,
			});
			toast.success("Networks updated. Redeploy the compose to apply them.");
			await utils.compose.one.invalidate({ composeId });
		} catch (error) {
			toast.error("Error updating networks", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-start justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-1">
					<CardTitle className="text-xl">Networks</CardTitle>
					<CardDescription>
						Attach Docker networks per service and detach it from
						dokploy-network. Takes effect on the next deploy.
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="sm"
					isLoading={isRefetchingServices}
					onClick={onRetry}
				>
					<RefreshCw className="size-4" />
					Refresh
				</Button>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{servicesError ? (
					<div className="flex flex-col gap-3">
						<AlertBlock type="error">
							Could not load the compose services. If this compose was just
							created from a template, it hasn't been cloned yet — click Reload
							to clone the repository and read its services.
						</AlertBlock>
						<div className="flex justify-end">
							<Button
								variant="outline"
								size="sm"
								isLoading={isRefetchingServices}
								onClick={onRetry}
							>
								<RefreshCw className="size-4" />
								Reload services
							</Button>
						</div>
					</div>
				) : isLoadingServices ? (
					<div className="flex flex-row gap-2 items-center justify-center py-10 text-sm text-muted-foreground">
						<span>Loading services...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : !services?.length ? (
					<span className="py-6 text-center text-sm text-muted-foreground">
						No services found in this compose.
					</span>
				) : (
					<Form {...form}>
						<form
							onSubmit={form.handleSubmit(onSubmit)}
							className="flex flex-col gap-4"
						>
							{fields.map((fieldItem, index) => (
								<ServiceRow
									key={fieldItem.id}
									control={form.control}
									index={index}
									service={fieldItem.serviceName}
									availableNetworks={availableNetworks}
								/>
							))}
							<div className="flex justify-end">
								<Button
									type="submit"
									disabled={!form.formState.isDirty}
									isLoading={isPending}
								>
									Save
								</Button>
							</div>
						</form>
					</Form>
				)}
			</CardContent>
		</Card>
	);
};

type NetworkOption = { networkId: string; name: string; driver: string };

const ServiceRow = ({
	control,
	index,
	service,
	availableNetworks,
}: {
	control: ReturnType<typeof useForm<FormValues>>["control"];
	index: number;
	service: string;
	availableNetworks: NetworkOption[];
}) => {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-4">
			<FormField
				control={control}
				name={`services.${index}.detachDokployNetwork`}
				render={({ field }) => (
					<FormItem className="flex flex-row items-center justify-between gap-3 space-y-0">
						<span className="text-sm font-medium">{service}</span>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">
								Detach dokploy-network
							</span>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
						</div>
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name={`services.${index}.networkIds`}
				render={({ field }) => {
					const selectedNetworks = availableNetworks.filter((n) =>
						field.value.includes(n.networkId),
					);
					const toggle = (networkId: string) => {
						field.onChange(
							field.value.includes(networkId)
								? field.value.filter((id) => id !== networkId)
								: [...field.value, networkId],
						);
					};
					return (
						<FormItem className="space-y-3">
							<Popover open={open} onOpenChange={setOpen}>
								<PopoverTrigger asChild>
									<Button
										type="button"
										variant="outline"
										aria-expanded={open}
										className="w-full justify-between"
									>
										<span className="text-muted-foreground">
											{selectedNetworks.length > 0
												? `${selectedNetworks.length} network${
														selectedNetworks.length > 1 ? "s" : ""
													} selected`
												: "Select networks..."}
										</span>
										<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-[var(--radix-popover-trigger-width)] p-0"
									align="start"
								>
									<Command>
										<CommandInput
											placeholder="Search networks..."
											className="h-9"
										/>
										<CommandList className="max-h-60">
											{availableNetworks.length === 0 ? (
												<div className="py-6 text-center text-sm text-muted-foreground">
													No networks available on this server.
												</div>
											) : (
												<CommandGroup>
													{availableNetworks.map((n) => {
														const isSelected = field.value.includes(
															n.networkId,
														);
														return (
															<CommandItem
																key={n.networkId}
																value={n.name}
																onSelect={() => toggle(n.networkId)}
																className="cursor-pointer"
															>
																<Checkbox
																	checked={isSelected}
																	className="mr-2"
																	onCheckedChange={() => toggle(n.networkId)}
																/>
																<span>{n.name}</span>
																<Badge variant="outline" className="ml-2">
																	{n.driver}
																</Badge>
																<Check
																	className={cn(
																		"ml-auto size-4",
																		isSelected ? "opacity-100" : "opacity-0",
																	)}
																/>
															</CommandItem>
														);
													})}
												</CommandGroup>
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>

							{selectedNetworks.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{selectedNetworks.map((n) => (
										<Badge key={n.networkId} variant="secondary">
											{n.name}
										</Badge>
									))}
								</div>
							)}
						</FormItem>
					);
				}}
			/>
		</div>
	);
};
