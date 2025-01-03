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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import type React from "react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	children: React.ReactNode;
	serverId?: string;
}

const PortSchema = z.object({
	targetPort: z.number().min(1, "Target port is required"),
	publishedPort: z.number().min(1, "Published port is required"),
	publishMode: z.enum(["ingress", "host"]),
});

const TraefikPortsSchema = z.object({
	ports: z.array(PortSchema),
});

type TraefikPortsForm = z.infer<typeof TraefikPortsSchema>;

export const ManageTraefikPorts = ({ children, serverId }: Props) => {
	const { t } = useTranslation("settings");
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

	const { mutateAsync: updatePorts, isLoading } =
		api.settings.updateTraefikPorts.useMutation({
			onSuccess: () => {
				refetchPorts();
			},
		});

	useEffect(() => {
		if (currentPorts) {
			form.reset({ ports: currentPorts });
		}
	}, [currentPorts, form]);

	const handleAddPort = () => {
		append({ targetPort: 0, publishedPort: 0, publishMode: "host" });
	};

	const onSubmit = async (data: TraefikPortsForm) => {
		try {
			await updatePorts({
				serverId,
				additionalPorts: data.ports,
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
				<DialogContent className="sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-xl">
							{t("settings.server.webServer.traefik.managePorts")}
						</DialogTitle>
						<DialogDescription className="text-base w-full">
							<div className="flex items-center justify-between">
								<div className="flex flex-col gap-1">
									{t(
										"settings.server.webServer.traefik.managePortsDescription",
									)}
									<span className="text-sm text-muted-foreground">
										{fields.length} port mapping{fields.length !== 1 ? "s" : ""}{" "}
										configured
									</span>
								</div>
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

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<div className="grid gap-6 py-4">
								{fields.length === 0 ? (
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
									<ScrollArea className="h-[400px] pr-4">
										<div className="grid gap-4">
											{fields.map((field, index) => (
												<Card key={field.id}>
													<CardContent className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-4 p-4 transparent">
														<FormField
															control={form.control}
															name={`ports.${index}.targetPort`}
															render={({ field }) => (
																<FormItem>
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.server.webServer.traefik.targetPort",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			type="number"
																			{...field}
																			onChange={(e) =>
																				field.onChange(Number(e.target.value))
																			}
																			className="w-full dark:bg-black"
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
																			"settings.server.webServer.traefik.publishedPort",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			type="number"
																			{...field}
																			onChange={(e) =>
																				field.onChange(Number(e.target.value))
																			}
																			className="w-full dark:bg-black"
																			placeholder="e.g. 80"
																		/>
																	</FormControl>
																	<FormMessage />
																</FormItem>
															)}
														/>

														<FormField
															control={form.control}
															name={`ports.${index}.publishMode`}
															render={({ field }) => (
																<FormItem>
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.server.webServer.traefik.publishMode",
																		)}
																	</FormLabel>
																	<Select
																		onValueChange={field.onChange}
																		value={field.value}
																	>
																		<FormControl>
																			<SelectTrigger className="dark:bg-black">
																				<SelectValue />
																			</SelectTrigger>
																		</FormControl>
																		<SelectContent>
																			<SelectItem value="host">
																				Host Mode
																			</SelectItem>
																			<SelectItem value="ingress">
																				Ingress Mode
																			</SelectItem>
																		</SelectContent>
																	</Select>
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
													Each port mapping defines how external traffic reaches
													your containers.
												</strong>
												<ul className="pt-2">
													<li>
														<strong>Host Mode:</strong> Directly binds the port
														to the host machine.
														<ul className="p-2 list-inside list-disc">
															<li>
																Best for single-node deployments or when you
																need guaranteed port availability.
															</li>
														</ul>
													</li>
													<li>
														<strong>Ingress Mode:</strong> Routes through Docker
														Swarm's load balancer.
														<ul className="p-2 list-inside list-disc">
															<li>
																Recommended for multi-node deployments and
																better scalability.
															</li>
														</ul>
													</li>
												</ul>
											</span>
										</div>
									</AlertBlock>
								)}
							</div>
							<DialogFooter>
								<Button
									type="submit"
									variant="default"
									className="text-sm"
									isLoading={isLoading}
								>
									Save
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
