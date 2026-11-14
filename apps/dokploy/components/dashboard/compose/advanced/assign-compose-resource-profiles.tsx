import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	createConverter,
	NumberInputWithSteps,
} from "@/components/ui/number-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

const CPU_STEP = 0.25;
const MEMORY_STEP_MB = 256;

const formatNumber = (value: number, decimals = 2): string =>
	Number.isInteger(value) ? String(value) : value.toFixed(decimals);

const cpuConverter = createConverter(1_000_000_000, (cpu) =>
	cpu <= 0 ? "" : `${formatNumber(cpu)} CPU`,
);

const memoryConverter = createConverter(1024 * 1024, (mb) => {
	if (mb <= 0) return "";
	return mb >= 1024
		? `${formatNumber(mb / 1024)} GB`
		: `${formatNumber(mb)} MB`;
});

const assignmentSchema = z.object({
	services: z.array(
		z.object({
			serviceName: z.string(),
			resourceGroupId: z.string().optional(),
			profileId: z.string().nullable().optional(),
			memoryReservation: z.string().optional(),
			memoryLimit: z.string().optional(),
			cpuReservation: z.string().optional(),
			cpuLimit: z.string().optional(),
		}),
	),
});

type AssignmentForm = z.infer<typeof assignmentSchema>;

interface Props {
	composeId: string;
}

export const AssignComposeResourceProfiles = ({ composeId }: Props) => {
	const [cacheType, setCacheType] = useState<"cache" | "fetch">("cache");
	const utils = api.useUtils();

	const {
		data: services,
		isLoading: isLoadingServices,
		error: servicesError,
		refetch: refetchServices,
	} = api.compose.loadServicesWithResources.useQuery(
		{ composeId, type: cacheType },
		{ retry: false },
	);

	const { data: groups } = api.resourceProfile.all.useQuery();
	const { data: assignments } = api.resourceProfile.composeAssignments.useQuery(
		{ composeId },
	);

	const { mutateAsync, isPending } =
		api.resourceProfile.saveComposeAssignments.useMutation();

	const form = useForm<AssignmentForm>({
		defaultValues: { services: [] },
		resolver: zodResolver(assignmentSchema),
	});

	const { fields, replace } = useFieldArray({
		control: form.control,
		name: "services",
		keyName: "fieldId",
	});

	useEffect(() => {
		if (services && assignments) {
			replace(
				services.map((service) => {
					const assignment = assignments.find(
						(a) => a.serviceName === service.serviceName,
					);
					return {
						serviceName: service.serviceName,
						resourceGroupId: "",
						profileId: assignment?.profileId || "",
						memoryReservation: assignment?.memoryReservation || "",
						memoryLimit: assignment?.memoryLimit || "",
						cpuReservation: assignment?.cpuReservation || "",
						cpuLimit: assignment?.cpuLimit || "",
					};
				}),
			);
		}
	}, [services, assignments, replace]);

	const onFetchServices = () => {
		setCacheType("fetch");
		setTimeout(() => refetchServices(), 0);
	};

	const onSubmit = async (formData: AssignmentForm) => {
		await mutateAsync({
			composeId,
			services: formData.services.map((service) => ({
				serviceName: service.serviceName,
				profileId: service.profileId || null,
				memoryReservation: service.memoryReservation || null,
				memoryLimit: service.memoryLimit || null,
				cpuReservation: service.cpuReservation || null,
				cpuLimit: service.cpuLimit || null,
			})),
		})
			.then(() => {
				toast.success("Resource profiles saved");
				utils.resourceProfile.composeAssignments.invalidate({ composeId });
			})
			.catch(() => {
				toast.error("Error saving the resource profiles");
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Resource Profiles</CardTitle>
				<CardDescription>
					Assign a resource profile to each compose service. At deploy time
					Dokploy injects <code>deploy.resources</code> into the generated stack
					file. If the compose file already defines resources for a service, the
					Dokploy assignment wins.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoadingServices ? (
					<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[10vh]">
						<span>Loading...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : servicesError ? (
					<div className="flex flex-col gap-4">
						<AlertBlock type="warning">{servicesError.message}</AlertBlock>
						<div className="flex justify-end">
							<Button variant="outline" onClick={onFetchServices}>
								<RefreshCw className="size-4 mr-1" />
								Fetch Services
							</Button>
						</div>
					</div>
				) : (
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
							{fields.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No services detected in the compose file.
								</p>
							) : (
								fields.map((field, index) => {
									const service = services?.find(
										(s) => s.serviceName === field.serviceName,
									);
									const groupId = form.watch(
										`services.${index}.resourceGroupId`,
									);
									const profileId = form.watch(`services.${index}.profileId`);
									const groupProfiles =
										groups?.find((g) => g.groupId === groupId)?.profiles ?? [];
									return (
										<div
											key={field.fieldId}
											className="flex flex-col gap-3 p-3 border rounded-lg bg-muted/30"
										>
											<div className="flex items-center justify-between gap-4 flex-wrap">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{field.serviceName}
													</span>
													{service?.hasDeployResources && (
														<Badge
															variant="secondary"
															className="gap-1 text-amber-600"
														>
															<TriangleAlert className="size-3" />
															defines its own resources (will be overridden)
														</Badge>
													)}
												</div>
												<div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[380px]">
													<FormField
														control={form.control}
														name={`services.${index}.resourceGroupId`}
														render={({ field: groupField }) => (
															<FormItem>
																<FormLabel>Group</FormLabel>
																<Select
																	onValueChange={(value) => {
																		groupField.onChange(value);
																		form.setValue(
																			`services.${index}.profileId`,
																			"",
																		);
																	}}
																	value={groupField.value || undefined}
																>
																	<FormControl>
																		<SelectTrigger>
																			<SelectValue placeholder="None" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		{groups?.map((group) => (
																			<SelectItem
																				key={group.groupId}
																				value={group.groupId}
																			>
																				{group.name}
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
														name={`services.${index}.profileId`}
														render={({ field: profileField }) => (
															<FormItem>
																<FormLabel>Profile</FormLabel>
																<Select
																	onValueChange={(value) =>
																		profileField.onChange(
																			value === "none" ? null : value,
																		)
																	}
																	value={profileField.value || undefined}
																>
																	<FormControl>
																		<SelectTrigger disabled={!groupId}>
																			<SelectValue placeholder="Select" />
																		</SelectTrigger>
																	</FormControl>
																	<SelectContent>
																		<SelectItem value="none">None</SelectItem>
																		{groupProfiles.map((profile) => (
																			<SelectItem
																				key={profile.profileId}
																				value={profile.profileId}
																			>
																				{profile.name}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
																<FormMessage />
															</FormItem>
														)}
													/>
												</div>
											</div>
											<details>
												<summary className="text-xs text-muted-foreground cursor-pointer select-none">
													Advanced overrides
												</summary>
												<div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3">
													<FormField
														control={form.control}
														name={`services.${index}.memoryLimit`}
														render={({ field: overrideField }) => (
															<FormItem>
																<FormLabel>Memory Limit</FormLabel>
																<FormControl>
																	<NumberInputWithSteps
																		value={overrideField.value ?? ""}
																		onChange={overrideField.onChange}
																		placeholder="Bytes"
																		step={MEMORY_STEP_MB}
																		converter={memoryConverter}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
													<FormField
														control={form.control}
														name={`services.${index}.memoryReservation`}
														render={({ field: overrideField }) => (
															<FormItem>
																<FormLabel>Memory Reservation</FormLabel>
																<FormControl>
																	<NumberInputWithSteps
																		value={overrideField.value ?? ""}
																		onChange={overrideField.onChange}
																		placeholder="Bytes"
																		step={MEMORY_STEP_MB}
																		converter={memoryConverter}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
													<FormField
														control={form.control}
														name={`services.${index}.cpuLimit`}
														render={({ field: overrideField }) => (
															<FormItem>
																<FormLabel>CPU Limit</FormLabel>
																<FormControl>
																	<NumberInputWithSteps
																		value={overrideField.value ?? ""}
																		onChange={overrideField.onChange}
																		placeholder="CPUs"
																		step={CPU_STEP}
																		converter={cpuConverter}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
													<FormField
														control={form.control}
														name={`services.${index}.cpuReservation`}
														render={({ field: overrideField }) => (
															<FormItem>
																<FormLabel>CPU Reservation</FormLabel>
																<FormControl>
																	<NumberInputWithSteps
																		value={overrideField.value ?? ""}
																		onChange={overrideField.onChange}
																		placeholder="CPUs"
																		step={CPU_STEP}
																		converter={cpuConverter}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
														)}
													/>
												</div>
											</details>
											{profileId && groupId && (
												<span className="text-xs text-muted-foreground">
													Inherits values from the selected profile; fill an
													override to win over the profile.
												</span>
											)}
										</div>
									);
								})
							)}
							{fields.length > 0 && (
								<div className="flex justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={onFetchServices}
									>
										<RefreshCw className="size-4 mr-1" />
										Refresh Services
									</Button>
									<Button isLoading={isPending} type="submit">
										Save
									</Button>
								</div>
							)}
						</form>
					</Form>
				)}
			</CardContent>
		</Card>
	);
};
