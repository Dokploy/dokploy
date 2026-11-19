import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";
import { api } from "@/utils/api";

interface Props {
	children: React.ReactNode;
	serverId?: string;
}

const PortSchema = z.object({
	targetPort: z
		.number()
		.min(1, "settings.webServer.traefikPorts.errors.targetPortRequired"),
	publishedPort: z
		.number()
		.min(1, "settings.webServer.traefikPorts.errors.publishedPortRequired"),
	protocol: z.enum(["tcp", "udp", "sctp"]),
});

const TraefikPortsSchema = z.object({
	ports: z.array(PortSchema),
});

type TraefikPortsForm = z.infer<typeof TraefikPortsSchema>;

export const ManageTraefikPorts = ({ children, serverId }: Props) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	const form = useForm<TraefikPortsForm>({
		resolver: zodResolver(TraefikPortsSchema),
		defaultValues: {
			ports: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "ports",
	});

	const { data: currentPorts, refetch: refetchPorts } =
		api.settings.getTraefikPorts.useQuery({
			serverId,
		});

	const { mutateAsync: updatePorts, isPending } =
		api.settings.updateTraefikPorts.useMutation();

	const {
		execute: executeWithHealthCheck,
		isExecuting: isHealthCheckExecuting,
	} = useHealthCheckAfterMutation({
		initialDelay: 5000,
		successMessage: t("settings.webServer.traefikPorts.updated"),
		onSuccess: () => {
			refetchPorts();
			setOpen(false);
		},
	});

	useEffect(() => {
		if (currentPorts) {
			form.reset({
				ports: currentPorts.map((port) => ({
					...port,
					protocol: port.protocol as "tcp" | "udp" | "sctp",
				})),
			});
		}
	}, [currentPorts, form]);

	const handleAddPort = () => {
		append({ targetPort: 0, publishedPort: 0, protocol: "tcp" });
	};

	const onSubmit = async (data: TraefikPortsForm) => {
		try {
			await executeWithHealthCheck(() =>
				updatePorts({
					serverId,
					additionalPorts: data.ports,
				}),
			);
			setOpen(false);
		} catch (error) {
			toast.error(
				(error as Error).message ||
					t("settings.webServer.traefikPorts.updateError"),
			);
		}
	};

	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				{children}
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							{t("settings.webServer.traefikPorts.title")}
						</DialogTitle>
						<DialogDescription className="text-base w-full">
							<div className="flex items-center justify-between">
								<div className="flex flex-col gap-1">
									{t("settings.webServer.traefikPorts.description")}
									<span className="text-sm text-muted-foreground">
										{t("settings.webServer.traefikPorts.mappingsCount", {
											count: fields.length,
										})}
									</span>
								</div>
								<Button
									onClick={handleAddPort}
									variant="default"
									className="gap-2"
								>
									<Plus className="h-4 w-4" />
									{t("settings.webServer.traefikPorts.addMapping")}
								</Button>
							</div>
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<div className="grid gap-6 py-4">
								{fields.length === 0 ? (
									<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
										<ArrowRightLeft className="size-8 text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											{t("settings.webServer.traefikPorts.noMappings")}
										</span>
										<p className="text-sm text-muted-foreground text-center">
											{t("settings.webServer.traefikPorts.addOneHint")}
										</p>
									</div>
								) : (
									<ScrollArea className="pr-4">
										<div className="grid gap-4">
											{fields.map((field, index) => (
												<Card key={field.id} className="bg-transparent">
													<CardContent className="grid grid-cols-4  gap-4 p-4 transparent">
														<FormField
															control={form.control}
															name={`ports.${index}.targetPort`}
															render={({ field }) => (
																<FormItem>
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.webServer.traefikPorts.targetPort",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			type="number"
																			{...field}
																			onChange={(e) => {
																				const value = e.target.value;
																				field.onChange(
																					value === ""
																						? undefined
																						: Number(value),
																				);
																			}}
																			value={field.value || ""}
																			placeholder="e.g. 8080"
																		/>
																	</FormControl>
																	<FormMessage />
																</FormItem>
															)}
														/>

														<FormField
															control={form.control}
															name={`ports.${index}.publishedPort`}
															render={({ field }) => (
																<FormItem>
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.webServer.traefikPorts.publishedPort",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			type="number"
																			{...field}
																			onChange={(e) => {
																				const value = e.target.value;
																				field.onChange(
																					value === ""
																						? undefined
																						: Number(value),
																				);
																			}}
																			value={field.value || ""}
																			placeholder="e.g. 80"
																		/>
																	</FormControl>
																	<FormMessage />
																</FormItem>
															)}
														/>
														<FormField
															control={form.control}
															name={`ports.${index}.protocol`}
															render={({ field }) => (
																<FormItem>
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.webServer.traefikPorts.protocol",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Select
																			onValueChange={field.onChange}
																			defaultValue={field.value}
																		>
																			<SelectTrigger>
																				<SelectValue
																					placeholder={t(
																						"settings.webServer.traefikPorts.selectProtocol",
																					)}
																				/>
																			</SelectTrigger>
																			<SelectContent>
																				<SelectGroup>
																					{["tcp", "udp", "sctp"].map(
																						(protocol) => (
																							<SelectItem
																								key={protocol}
																								value={protocol}
																							>
																								{protocol}
																							</SelectItem>
																						),
																					)}
																				</SelectGroup>
																			</SelectContent>
																		</Select>
																	</FormControl>
																	<FormMessage />
																</FormItem>
															)}
														/>

														<div className="flex items-end">
															<Button
																onClick={() => remove(index)}
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
									</ScrollArea>
								)}

								{fields.length > 0 && (
									<AlertBlock type="info">
										<div className="flex flex-col gap-2">
											<span className="text-sm">
												<strong>
													{t("settings.webServer.traefikPorts.explainIntro")}
												</strong>
												<ul className="pt-2">
													<li>
														<strong>
															{t("settings.webServer.traefikPorts.targetPort")}:
														</strong>{" "}
														{t("settings.webServer.traefikPorts.explainTarget")}
													</li>
													<li>
														<strong>
															{t(
																"settings.webServer.traefikPorts.publishedPort",
															)}
															:
														</strong>{" "}
														{t(
															"settings.webServer.traefikPorts.explainPublished",
														)}
													</li>
												</ul>
												<p className="mt-2">
													{t("settings.webServer.traefikPorts.explainOutro")}
												</p>
											</span>
										</div>
									</AlertBlock>
								)}

								<AlertBlock type="warning">
									{t("settings.servers.traefikActions.dashboardWarning")}
								</AlertBlock>
							</div>
							<DialogFooter>
								<Button
									type="submit"
									variant="default"
									className="text-sm"
									isLoading={isPending || isHealthCheckExecuting}
								>
									{t("settings.servers.buildsConcurrency.save")}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</>
	);
};

export default ManageTraefikPorts;
