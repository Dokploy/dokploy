import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
		authType: z.enum(["credentials", "credential-helper"]),
		username: z.string().optional(),
		password: z.string().optional(),
		credentialHelper: z.string().optional(),
		registryUrl: registryUrlValidator,
		imagePrefix: z.string(),
		serverId: z.string().optional(),
		isEditing: z.boolean().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.authType === "credentials") {
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
		} else if (data.authType === "credential-helper") {
			if (!data.credentialHelper?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Credential helper name is required",
					path: ["credentialHelper"],
				});
			}
			if (!data.registryUrl?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Registry URL is required for credential helpers",
					path: ["registryUrl"],
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
			authType: "credentials",
			username: "",
			password: "",
			credentialHelper: "",
			registryUrl: "",
			imagePrefix: "",
			registryName: "",
			serverId: "",
			isEditing: !!registryId,
		},
		resolver: zodResolver(AddRegistrySchema),
	});

	const authType = form.watch("authType");
	const password = form.watch("password");
	const credentialHelper = form.watch("credentialHelper");
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
				authType: registry.authType ?? "credentials",
				username: registry.username || "",
				password: "",
				credentialHelper: registry.credentialHelper || "",
				registryUrl: registry.registryUrl,
				imagePrefix: registry.imagePrefix || "",
				registryName: registry.registryName,
				isEditing: true,
			});
		} else {
			form.reset({
				authType: "credentials",
				username: "",
				password: "",
				credentialHelper: "",
				registryUrl: "",
				imagePrefix: "",
				serverId: "",
				isEditing: false,
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, registry]);

	const onSubmit = async (data: AddRegistry) => {
		const payload: any = {
			registryName: data.registryName,
			authType: data.authType,
			registryUrl: data.registryUrl || "",
			registryType: "cloud",
			imagePrefix: data.imagePrefix,
			serverId: data.serverId,
			registryId: registryId || "",
		};

		if (data.authType === "credentials") {
			payload.username = data.username;
			payload.credentialHelper = null;
			if (data.password && data.password.length > 0) {
				payload.password = data.password;
			}
		} else {
			payload.credentialHelper = data.credentialHelper?.trim() || null;
			payload.username = null;
			payload.password = null;
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
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add a external registry</DialogTitle>
					<DialogDescription>
						Fill the next fields to add a external registry.
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
						className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4"
					>
						<div className="flex flex-col gap-4 col-span-2">
							<FormField
								control={form.control}
								name="authType"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Authentication Type</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select auth type" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="credentials">
														Username / Password
													</SelectItem>
													<SelectItem value="credential-helper">
														Credential Helper
													</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="flex flex-col gap-4">
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
						</div>
						<div className="flex flex-col gap-4">
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

						{authType === "credentials" && (
							<>
								<div className="flex flex-col gap-4">
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
								</div>
								<div className="flex flex-col gap-4">
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
														Leave blank to keep existing password. Enter new
														password to test or update it.
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
							</>
						)}

						{authType === "credential-helper" && (
							<div className="flex flex-col gap-4 col-span-2">
								<FormField
									control={form.control}
									name="credentialHelper"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Credential Helper</FormLabel>
											<FormDescription>
												Name of the Docker credential helper binary (e.g.,
												ecr-login, gcr, gcloud). The server must have
												docker-credential-{"<name>"} installed.
											</FormDescription>
											<FormControl>
												<Input {...field} placeholder="ecr-login" />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}

						<div className="flex flex-col gap-4 col-span-2">
							<FormField
								control={form.control}
								name="registryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry URL</FormLabel>
										<FormDescription>
											Enter only the hostname (e.g.,
											aws_account_id.dkr.ecr.us-west-2.amazonaws.com).
											{authType === "credential-helper" &&
												" Required for credential helpers."}
										</FormDescription>
										<FormControl>
											<Input
												placeholder="aws_account_id.dkr.ecr.us-west-2.amazonaws.com"
												{...field}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="col-span-2">
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
						</div>

						<DialogFooter className="flex flex-col w-full sm:justify-between gap-4 flex-wrap sm:flex-col col-span-2">
							<div className="flex flex-row gap-2 justify-between">
								<Button
									type="button"
									variant={"secondary"}
									isLoading={isLoading || isLoadingById}
									onClick={async () => {
										if (authType === "credential-helper") {
											if (registryId) {
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

											if (!credentialHelper?.trim()) {
												form.setError("credentialHelper", {
													type: "manual",
													message: "Credential helper name is required",
												});
												return;
											}

											await testRegistry({
												authType: "credential-helper",
												credentialHelper: credentialHelper || null,
												registryUrl: registryUrl || "",
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
											return;
										}

										// Credentials auth type
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

										if (!registryId && (!password || password.length === 0)) {
											form.setError("password", {
												type: "manual",
												message: "Password is required",
											});
											return;
										}

										await testRegistry({
											authType: "credentials",
											username: username,
											password: password,
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
