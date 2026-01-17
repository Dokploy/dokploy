import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import type React from "react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { api } from "@/utils/api";

interface Props {
	children: React.ReactNode;
	serverId?: string;
}

const VolumeSchema = z.object({
	hostPath: z.string().min(1, "Host path is required"),
	containerPath: z.string().min(1, "Container path is required"),
});

const TraefikVolumesSchema = z.object({
	volumes: z.array(VolumeSchema),
});

type TraefikVolumesForm = z.infer<typeof TraefikVolumesSchema>;

export const ManageTraefikVolumes = ({ children, serverId }: Props) => {
	const { t } = useTranslation("settings");
	const [open, setOpen] = useState(false);

	const form = useForm<TraefikVolumesForm>({
		resolver: zodResolver(TraefikVolumesSchema),
		defaultValues: {
			volumes: [],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "volumes",
	});

	const { data: currentVolumes, refetch: refetchVolumes } =
		api.settings.getTraefikVolumes.useQuery({
			serverId,
		});

	const { mutateAsync: updateVolumes, isLoading } =
		api.settings.updateTraefikVolumes.useMutation({
			onSuccess: () => {
				refetchVolumes();
			},
		});

	useEffect(() => {
		if (currentVolumes) {
			form.reset({
				volumes: currentVolumes.map((volume) => ({
					hostPath: volume.hostPath,
					containerPath: volume.containerPath,
				})),
			});
		}
	}, [currentVolumes, form]);

	const handleAddVolume = () => {
		append({ hostPath: "", containerPath: "" });
	};

	const onSubmit = async (data: TraefikVolumesForm) => {
		try {
			await updateVolumes({
				serverId,
				additionalVolumes: data.volumes,
			});
			toast.success(t("settings.server.webServer.traefik.volumesUpdated"));
			setOpen(false);
		} catch (error) {
			toast.error(
				(error as Error).message || "Error updating Traefik volumes",
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
							{t("settings.server.webServer.traefik.manageVolumes")}
						</DialogTitle>
						<DialogDescription className="text-base w-full">
							<div className="flex items-center justify-between">
								<div className="flex flex-col gap-1">
									{t(
										"settings.server.webServer.traefik.manageVolumesDescription",
									)}
									<span className="text-sm text-muted-foreground">
										{fields.length} volume mount{fields.length !== 1 ? "s" : ""}{" "}
										configured
									</span>
								</div>
								<Button
									onClick={handleAddVolume}
									variant="default"
									className="gap-2"
								>
									<Plus className="h-4 w-4" />
									Add Mount
								</Button>
							</div>
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<div className="grid gap-6 py-4">
								{fields.length === 0 ? (
									<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
										<FolderOpen className="size-8 text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											No volume mounts configured
										</span>
										<p className="text-sm text-muted-foreground text-center">
											Add one to get started
										</p>
									</div>
								) : (
									<ScrollArea className="pr-4">
										<div className="grid gap-4">
											{fields.map((field, index) => (
												<Card key={field.id} className="bg-transparent">
													<CardContent className="grid grid-cols-5 gap-4 p-4 transparent">
														<FormField
															control={form.control}
															name={`volumes.${index}.hostPath`}
															render={({ field }) => (
																<FormItem className="col-span-2">
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.server.webServer.traefik.hostPath",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			{...field}
																			placeholder="e.g. /host/path/to/data"
																		/>
																	</FormControl>
																	<FormMessage />
																</FormItem>
															)}
														/>

														<FormField
															control={form.control}
															name={`volumes.${index}.containerPath`}
															render={({ field }) => (
																<FormItem className="col-span-2">
																	<FormLabel className="text-sm font-medium text-muted-foreground">
																		{t(
																			"settings.server.webServer.traefik.containerPath",
																		)}
																	</FormLabel>
																	<FormControl>
																		<Input
																			{...field}
																			placeholder="e.g. /container/path"
																		/>
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
													Each volume mount binds a host directory to a path
													inside the Traefik container.
												</strong>
												<ul className="pt-2">
													<li>
														<strong>Host Path:</strong> The absolute path on
														your host machine.
													</li>
													<li>
														<strong>Container Path:</strong> The path inside
														the Traefik container where the volume will be
														mounted.
													</li>
												</ul>
												<p className="mt-2">
													Use this to mount additional configuration files,
													certificates, or other data that Traefik needs access
													to.
												</p>
											</span>
										</div>
									</AlertBlock>
								)}

								<AlertBlock type="warning">
									The Traefik container will be recreated from scratch. This
									means the container will be deleted and created again, which
									may cause downtime in your applications.
								</AlertBlock>
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

export default ManageTraefikVolumes;

