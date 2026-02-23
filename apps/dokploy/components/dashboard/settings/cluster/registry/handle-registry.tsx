import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertTriangle,
	ChevronRight,
	PenBoxIcon,
	PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const registryUrlValidator = z
	.string()
	.optional()
	.refine(
		(val) => {
			if (!val || val.trim().length === 0) {
				return true;
			}
			const trimmed = val.trim();
			if (/^https?:\/\//i.test(trimmed) || trimmed.includes("/")) {
				return false;
			}
			const hostnameRegex =
				/^(?:\[[^\]]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,253}[a-zA-Z0-9])?)(?::\d+)?$/;
			return hostnameRegex.test(trimmed);
		},
		{
			message:
				"Invalid registry URL. Please enter only the hostname (e.g., example.com or registry.example.com). Do not include protocol (https://) or paths.",
		},
	);

const AddRegistrySchema = z
	.object({
		registryName: z.string().min(1, {
			message: "Registry name is required",
		}),
		username: z.string().optional(),
		password: z.string().optional(),
		credentialHelper: z.string().optional(),
		credentialHelperUrls: z.string().optional(),
		registryUrl: registryUrlValidator,
		imagePrefix: z.string(),
		serverId: z.string().optional(),
		isEditing: z.boolean().optional(),
	})
	.superRefine((data, ctx) => {
		const hasCredentials = !!(data.username?.trim() || data.password?.trim());
		const hasCredHelper = !!data.credentialHelper?.trim();

		if (!hasCredentials && !hasCredHelper) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "At least one authentication method is required",
				path: ["username"],
			});
			return;
		}

		if (hasCredentials) {
			if (!data.username?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Username is required",
					path: ["username"],
				});
			}
			if (!data.isEditing && !data.password?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Password is required",
					path: ["password"],
				});
			}
		}

		if (hasCredHelper) {
			if (!data.credentialHelperUrls?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"At least one registry URL is required for credential helpers",
					path: ["credentialHelperUrls"],
				});
			}
		}
	});

type AddRegistry = z.infer<typeof AddRegistrySchema>;

interface Props {
	registryId?: string;
}

export const HandleRegistry = ({ registryId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [credHelperOpen, setCredHelperOpen] = useState(false);

	const { data: registry } = api.registry.one.useQuery(
		{
			registryId: registryId || "",
		},
		{
			enabled: !!registryId,
		},
	);

	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync, error, isError } = registryId
		? api.registry.update.useMutation()
		: api.registry.create.useMutation();
	const { data: deployServers } = api.server.withSSHKey.useQuery();
	const { data: buildServers } = api.server.buildServers.useQuery();
	const servers = [...(deployServers || []), ...(buildServers || [])];
	const {
		mutateAsync: testRegistry,
		isLoading,
		error: testRegistryError,
		isError: testRegistryIsError,
	} = api.registry.testRegistry.useMutation();
	const {
		mutateAsync: testRegistryById,
		isLoading: isLoadingById,
		error: testRegistryByIdError,
		isError: testRegistryByIdIsError,
	} = api.registry.testRegistryById.useMutation();
	const form = useForm<AddRegistry>({
		defaultValues: {
			username: "",
			password: "",
			credentialHelper: "",
			credentialHelperUrls: "",
			registryUrl: "",
			imagePrefix: "",
			registryName: "",
			serverId: "",
			isEditing: !!registryId,
		},
		resolver: zodResolver(AddRegistrySchema),
	});

	const password = form.watch("password");
	const credentialHelper = form.watch("credentialHelper");
	const credentialHelperUrls = form.watch("credentialHelperUrls");
	const username = form.watch("username");
	const registryUrl = form.watch("registryUrl");
	const registryName = form.watch("registryName");
	const imagePrefix = form.watch("imagePrefix");
	const serverId = form.watch("serverId");
	const selectedServer = servers?.find(
		(server) => server.serverId === serverId,
	);

	useEffect(() => {
		if (registry) {
			form.reset({
				username: registry.username || "",
				password: "",
				credentialHelper: registry.credentialHelper || "",
				credentialHelperUrls: (registry as any).credentialHelperUrls || "",
				registryUrl: registry.registryUrl,
				imagePrefix: registry.imagePrefix || "",
				registryName: registry.registryName,
				isEditing: true,
			});
			setCredHelperOpen(!!registry.credentialHelper);
		} else {
			form.reset({
				username: "",
				password: "",
				credentialHelper: "",
				credentialHelperUrls: "",
				registryUrl: "",
				imagePrefix: "",
				serverId: "",
				isEditing: false,
			});
			setCredHelperOpen(false);
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, registry]);

	const onSubmit = async (data: AddRegistry) => {
		const hasCredentials = !!data.username?.trim();
		const hasCredHelper = !!data.credentialHelper?.trim();

		const payload: any = {
			registryName: data.registryName,
			authType: hasCredentials ? "credentials" : "credential-helper",
			registryUrl: data.registryUrl || "",
			registryType: "cloud",
			imagePrefix: data.imagePrefix,
			serverId: data.serverId,
			registryId: registryId || "",
		};

		// Username/password fields
		if (hasCredentials) {
			payload.username = data.username;
			if (data.password && data.password.length > 0) {
				payload.password = data.password;
			}
		} else {
			payload.username = null;
			payload.password = null;
		}

		// Credential helper fields
		if (hasCredHelper) {
			payload.credentialHelper = data.credentialHelper?.trim() || null;
			payload.credentialHelperUrls = data.credentialHelperUrls?.trim() || null;
		} else {
			payload.credentialHelper = null;
			payload.credentialHelperUrls = null;
		}

		await mutateAsync(payload)
			.then(async (_data) => {
				await utils.registry.all.invalidate();
				toast.success(registryId ? "Registry updated" : "Registry added");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					registryId ? "Error updating a registry" : "Error adding a registry",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{registryId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Registry
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{registryId ? "Edit" : "Add"} external registry
					</DialogTitle>
					<DialogDescription>
						Configure authentication for a Docker registry. You can use
						username/password, a credential helper, or both.
					</DialogDescription>
				</DialogHeader>
				{(isError || testRegistryIsError || testRegistryByIdIsError) && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{testRegistryError?.message ||
								testRegistryByIdError?.message ||
								error?.message ||
								""}
						</span>
					</div>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex flex-col w-full gap-4"
					>
						{/* General fields */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="registryName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry Name</FormLabel>
										<FormControl>
											<Input placeholder="Registry Name" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="imagePrefix"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Image Prefix</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Image Prefix" />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Username / Password section */}
						<fieldset className="rounded-lg border p-4 space-y-4">
							<legend className="px-2 text-sm font-medium">
								Username / Password Authentication
							</legend>
							<FormDescription>
								Standard Docker registry login with username and password. Leave
								empty if using only a credential helper.
							</FormDescription>
							<FormField
								control={form.control}
								name="registryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry URL</FormLabel>
										<FormDescription>
											Enter only the hostname (e.g., registry.hub.docker.com).
											Leave empty for Docker Hub.
										</FormDescription>
										<FormControl>
											<Input placeholder="registry.hub.docker.com" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input
													placeholder="Username"
													autoComplete="username"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Password{registryId && " (Optional)"}
											</FormLabel>
											{registryId && (
												<FormDescription>
													Leave blank to keep existing password.
												</FormDescription>
											)}
											<FormControl>
												<Input
													placeholder={
														registryId
															? "Leave blank to keep existing"
															: "Password"
													}
													autoComplete="one-time-code"
													{...field}
													type="password"
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</fieldset>

						{/* Credential Helper section (collapsible) */}
						<Collapsible open={credHelperOpen} onOpenChange={setCredHelperOpen}>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
								>
									<ChevronRight
										className={`size-4 transition-transform ${credHelperOpen ? "rotate-90" : ""}`}
									/>
									Credential Helper Authentication
									<span className="ml-auto text-xs font-normal text-muted-foreground">
										Optional
									</span>
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<div className="rounded-b-lg border border-t-0 p-4 space-y-4">
									<FormDescription>
										Use a Docker credential helper (e.g., ecr-login, gcr,
										gcloud). The helper binary must be installed on the server.
									</FormDescription>
									<FormField
										control={form.control}
										name="credentialHelper"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Credential Helper</FormLabel>
												<FormDescription>
													Name of the Docker credential helper binary
													(docker-credential-{"<name>"}).
												</FormDescription>
												<FormControl>
													<Input {...field} placeholder="ecr-login" />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="credentialHelperUrls"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Registry URLs</FormLabel>
												<FormDescription>
													One URL per line. These will be added to the
													credHelpers section of Docker config.
												</FormDescription>
												<FormControl>
													<Textarea
														{...field}
														placeholder={
															"public.ecr.aws\n372094135098.dkr.ecr.us-west-2.amazonaws.com"
														}
														rows={3}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</CollapsibleContent>
						</Collapsible>

						{/* Server selector */}
						<FormField
							control={form.control}
							name="serverId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Server {!isCloud && "(Optional)"}</FormLabel>
									<FormDescription>
										{!isCloud ? (
											<>
												{serverId && serverId !== "none" && selectedServer ? (
													<>
														Authentication will be performed on{" "}
														<strong>{selectedServer.name}</strong>. This
														registry will be available on this server.
													</>
												) : (
													<>
														Choose where to authenticate with the registry. By
														default, authentication occurs on the Dokploy
														server. Select a specific server to authenticate
														from that server instead.
													</>
												)}
											</>
										) : (
											<>
												{serverId && serverId !== "none" && selectedServer ? (
													<>
														Authentication will be performed on{" "}
														<strong>{selectedServer.name}</strong>. This
														registry will be available on this server.
													</>
												) : (
													<>
														Select a server to authenticate with the registry.
														The authentication will be performed from the
														selected server.
													</>
												)}
											</>
										)}
									</FormDescription>
									<FormControl>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select a server" />
											</SelectTrigger>
											<SelectContent>
												{deployServers && deployServers.length > 0 && (
													<SelectGroup>
														<SelectLabel>Deploy Servers</SelectLabel>
														{deployServers.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																{server.name}
															</SelectItem>
														))}
													</SelectGroup>
												)}
												{buildServers && buildServers.length > 0 && (
													<SelectGroup>
														<SelectLabel>Build Servers</SelectLabel>
														{buildServers.map((server) => (
															<SelectItem
																key={server.serverId}
																value={server.serverId}
															>
																{server.name}
															</SelectItem>
														))}
													</SelectGroup>
												)}
												<SelectGroup>
													<SelectItem value={"none"}>None</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col">
							<div className="flex flex-row gap-2 justify-between">
								<Button
									type="button"
									variant={"secondary"}
									isLoading={isLoading || isLoadingById}
									onClick={async () => {
										if (registryId && (!password || password.length === 0)) {
											await testRegistryById({
												registryId: registryId || "",
												...(serverId && { serverId }),
											})
												.then((data) => {
													if (data) {
														toast.success("Registry Tested Successfully");
													} else {
														toast.error("Registry Test Failed");
													}
												})
												.catch(() => {
													toast.error("Error testing the registry");
												});
											return;
										}

										const hasCredentials = !!username?.trim();
										const hasCredHelper = !!credentialHelper?.trim();

										if (!hasCredentials && !hasCredHelper) {
											form.setError("username", {
												type: "manual",
												message:
													"At least one authentication method is required",
											});
											return;
										}

										await testRegistry({
											authType: hasCredentials
												? "credentials"
												: "credential-helper",
											username: hasCredentials ? username : undefined,
											password: hasCredentials ? password : undefined,
											credentialHelper: hasCredHelper
												? credentialHelper
												: undefined,
											credentialHelperUrls: hasCredHelper
												? credentialHelperUrls
												: undefined,
											registryUrl: registryUrl || "",
											registryName: registryName,
											registryType: "cloud",
											imagePrefix: imagePrefix,
											serverId: serverId,
										})
											.then((data) => {
												if (data) {
													toast.success("Registry Tested Successfully");
												} else {
													toast.error("Registry Test Failed");
												}
											})
											.catch(() => {
												toast.error("Error testing the registry");
											});
									}}
								>
									Test Registry
								</Button>
								<Button isLoading={form.formState.isSubmitting} type="submit">
									{registryId ? "Update" : "Create"}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
