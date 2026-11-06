import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { HelpCircle, PenBoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const updateApplicationSchema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
	serverId: z.string().optional(),
});

type UpdateApplication = z.infer<typeof updateApplicationSchema>;

interface Props {
	applicationId: string;
}

export const UpdateApplication = ({ applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;
	const { data: servers } = api.server.withSSHKey.useQuery();

	const hasServers = servers && servers.length > 0;
	const shouldShowServerDropdown = hasServers || isCloud;

	const { mutateAsync, error, isError, isPending } =
		api.application.update.useMutation();
	const { data } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const isUndeployed =
		data?.applicationStatus === "idle" &&
		(data?.deployments?.length ?? 0) === 0;

	const form = useForm<UpdateApplication>({
		defaultValues: {
			description: data?.description ?? "",
			name: data?.name ?? "",
			serverId: data?.serverId || "dokploy",
		},
		resolver: zodResolver(updateApplicationSchema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				description: data.description ?? "",
				name: data.name,
				serverId: data.serverId || "dokploy",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateApplication) => {
		const serverIdValue =
			formData.serverId === "dokploy" ? null : formData.serverId || null;

		await mutateAsync({
			name: formData.name,
			applicationId: applicationId,
			description: formData.description || "",
			...(isUndeployed && { serverId: serverIdValue }),
		})
			.then(() => {
				toast.success("Application updated successfully");
				utils.application.one.invalidate({
					applicationId: applicationId,
				});
				setIsOpen(false);
			})
			.catch((err) => {
				toast.error(err?.message || "Error updating the Application");
			})
			.finally(() => {});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10 "
				>
					<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Modify Application</DialogTitle>
					<DialogDescription>Update the application data</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-application"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input placeholder="Vandelay Industries" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Description</FormLabel>
											<FormControl>
												<Textarea
													placeholder="Description about your project..."
													className="resize-none"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{shouldShowServerDropdown &&
									(isUndeployed ? (
										<FormField
											control={form.control}
											name="serverId"
											render={({ field }) => (
												<FormItem>
													<TooltipProvider delayDuration={0}>
														<Tooltip>
															<TooltipTrigger asChild>
																<FormLabel className="break-all w-fit flex flex-row gap-1 items-center">
																	Server {showLocalOption ? "(Optional)" : ""}
																	<HelpCircle className="size-4 text-muted-foreground" />
																</FormLabel>
															</TooltipTrigger>
															<TooltipContent
																className="z-999 max-w-[300px]"
																align="start"
																side="top"
															>
																<span>
																	Select the deployment server for this
																	application. You can change this anytime
																	before the first deployment.
																</span>
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
													<Select
														onValueChange={field.onChange}
														value={field.value || "dokploy"}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue placeholder="Select a Server" />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															<SelectGroup>
																<SelectLabel>Servers</SelectLabel>
																{showLocalOption && (
																	<SelectItem value="dokploy">
																		Dokploy Server (Local)
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
															</SelectGroup>
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)}
										/>
									) : (
										<FormItem>
											<FormLabel className="text-muted-foreground">
												Server
											</FormLabel>
											<Input
												disabled
												value={data?.server?.name || "Dokploy Server (Local)"}
												className="bg-muted text-muted-foreground"
											/>
											<p className="text-xs text-muted-foreground">
												The server cannot be changed directly after deployment.
												Use the Transfer action to move this service.
											</p>
										</FormItem>
									))}
								<DialogFooter>
									<Button
										isLoading={isPending}
										form="hook-form-update-application"
										type="submit"
									>
										Update
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
