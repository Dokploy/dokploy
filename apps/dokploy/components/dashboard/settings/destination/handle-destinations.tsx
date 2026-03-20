import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { S3_PROVIDERS } from "./constants";

const formSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		destinationType: z.enum(["s3", "ftp", "sftp"]),
		serverId: z.string().optional(),
		// S3 fields
		provider: z.string().optional(),
		accessKeyId: z.string().optional(),
		secretAccessKey: z.string().optional(),
		bucket: z.string().optional(),
		region: z.string().optional(),
		endpoint: z.string().optional(),
		// FTP/SFTP fields
		ftpHost: z.string().optional(),
		ftpPort: z.number().optional(),
		ftpUser: z.string().optional(),
		ftpPassword: z.string().optional(),
		ftpBasePath: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.destinationType === "s3") {
			if (!data.provider)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Provider is required",
					path: ["provider"],
				});
			if (!data.accessKeyId)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Access Key Id is required",
					path: ["accessKeyId"],
				});
			if (!data.secretAccessKey)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Secret Access Key is required",
					path: ["secretAccessKey"],
				});
			if (!data.bucket)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Bucket is required",
					path: ["bucket"],
				});
			if (!data.endpoint)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Endpoint is required",
					path: ["endpoint"],
				});
		} else {
			if (!data.ftpHost)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Host is required",
					path: ["ftpHost"],
				});
			if (!data.ftpUser)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Username is required",
					path: ["ftpUser"],
				});
			if (!data.ftpPassword)
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Password is required",
					path: ["ftpPassword"],
				});
		}
	});

type FormValues = z.infer<typeof formSchema>;

interface Props {
	destinationId?: string;
}

export const HandleDestinations = ({ destinationId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const createMutation = api.destination.create.useMutation();
	const updateMutation = api.destination.update.useMutation();

	const isError = destinationId
		? updateMutation.isError
		: createMutation.isError;
	const error = destinationId ? updateMutation.error : createMutation.error;
	const isPending = destinationId
		? updateMutation.isPending
		: createMutation.isPending;

	const { data: destination } = api.destination.one.useQuery(
		{
			destinationId: destinationId || "",
		},
		{
			enabled: !!destinationId,
			refetchOnWindowFocus: false,
		},
	);

	const {
		mutateAsync: testConnection,
		isPending: isPendingConnection,
		error: connectionError,
		isError: isErrorConnection,
	} = api.destination.testConnection.useMutation();

	const form = useForm<FormValues>({
		defaultValues: {
			name: "",
			destinationType: "s3",
			provider: "",
			accessKeyId: "",
			secretAccessKey: "",
			bucket: "",
			region: "",
			endpoint: "",
			ftpHost: "",
			ftpPort: undefined,
			ftpUser: "",
			ftpPassword: "",
			ftpBasePath: "",
		},
		resolver: zodResolver(formSchema),
	});

	const destinationType = form.watch("destinationType");

	useEffect(() => {
		if (destination) {
			const type =
				(destination.destinationType as "s3" | "ftp" | "sftp") || "s3";
			form.reset({
				name: destination.name,
				destinationType: type,
				provider: destination.provider || "",
				accessKeyId: destination.accessKey || "",
				secretAccessKey: destination.secretAccessKey || "",
				bucket: destination.bucket || "",
				region: destination.region || "",
				endpoint: destination.endpoint || "",
				ftpHost: destination.ftpHost || "",
				ftpPort: destination.ftpPort || undefined,
				ftpUser: destination.ftpUser || "",
				ftpPassword: destination.ftpPassword || "",
				ftpBasePath: destination.ftpBasePath || "",
			});
		} else if (!destinationId) {
			form.reset();
		}
	}, [form, destination, destinationId]);

	const onSubmit = async (data: FormValues) => {
		try {
			if (data.destinationType === "s3") {
				const payload = {
					destinationType: "s3" as const,
					name: data.name,
					provider: data.provider || "",
					accessKey: data.accessKeyId || "",
					secretAccessKey: data.secretAccessKey || "",
					bucket: data.bucket || "",
					region: data.region || "",
					endpoint: data.endpoint || "",
					serverId: data.serverId,
				};
				if (destinationId) {
					await updateMutation.mutateAsync({ ...payload, destinationId });
				} else {
					await createMutation.mutateAsync(payload);
				}
			} else if (data.destinationType === "ftp") {
				const payload = {
					destinationType: "ftp" as const,
					name: data.name,
					ftpHost: data.ftpHost || "",
					ftpPort: data.ftpPort || 21,
					ftpUser: data.ftpUser || "",
					ftpPassword: data.ftpPassword || "",
					ftpBasePath: data.ftpBasePath,
					serverId: data.serverId,
				};
				if (destinationId) {
					await updateMutation.mutateAsync({ ...payload, destinationId });
				} else {
					await createMutation.mutateAsync(payload);
				}
			} else {
				const payload = {
					destinationType: "sftp" as const,
					name: data.name,
					ftpHost: data.ftpHost || "",
					ftpPort: data.ftpPort || 22,
					ftpUser: data.ftpUser || "",
					ftpPassword: data.ftpPassword || "",
					ftpBasePath: data.ftpBasePath,
					serverId: data.serverId,
				};
				if (destinationId) {
					await updateMutation.mutateAsync({ ...payload, destinationId });
				} else {
					await createMutation.mutateAsync(payload);
				}
			}

			toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
			await utils.destination.all.invalidate();
			if (destinationId) {
				await utils.destination.one.invalidate({ destinationId });
			}
			setOpen(false);
		} catch {
			toast.error(
				`Error ${destinationId ? "Updating" : "Creating"} the Destination`,
			);
		}
	};

	const handleTestConnection = async (serverId?: string) => {
		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}

		const values = form.getValues();
		const type = values.destinationType;

		if (type === "s3") {
			const result = await form.trigger([
				"provider",
				"accessKeyId",
				"secretAccessKey",
				"bucket",
				"endpoint",
			]);
			if (!result) {
				toast.error("Please fill all required fields");
				return;
			}
			const connectionString = `:s3,provider=${values.provider},access_key_id=${values.accessKeyId},secret_access_key=${values.secretAccessKey},endpoint=${values.endpoint}${values.region ? `,region=${values.region}` : ""}:${values.bucket}`;
			await testConnection({
				destinationType: "s3",
				name: "Test",
				provider: values.provider || "",
				accessKey: values.accessKeyId || "",
				secretAccessKey: values.secretAccessKey || "",
				bucket: values.bucket || "",
				region: values.region || "",
				endpoint: values.endpoint || "",
				serverId,
			})
				.then(() => toast.success("Connection successful"))
				.catch((e) => {
					toast.error("Error connecting to provider", {
						description: `${e.message}\n\nTry manually: rclone ls ${connectionString}`,
					});
				});
		} else if (type === "ftp" || type === "sftp") {
			const result = await form.trigger(["ftpHost", "ftpUser", "ftpPassword"]);
			if (!result) {
				toast.error("Please fill all required fields");
				return;
			}
			const ftpPayload =
				type === "ftp"
					? ({
							destinationType: "ftp" as const,
							name: "Test",
							ftpHost: values.ftpHost || "",
							ftpPort: values.ftpPort || 21,
							ftpUser: values.ftpUser || "",
							ftpPassword: values.ftpPassword || "",
							ftpBasePath: values.ftpBasePath,
							serverId,
						} as const)
					: ({
							destinationType: "sftp" as const,
							name: "Test",
							ftpHost: values.ftpHost || "",
							ftpPort: values.ftpPort || 22,
							ftpUser: values.ftpUser || "",
							ftpPassword: values.ftpPassword || "",
							ftpBasePath: values.ftpBasePath,
							serverId,
						} as const);
			await testConnection(ftpPayload)
				.then(() => toast.success("Connection successful"))
				.catch((e) => {
					toast.error(`Error connecting to ${type.toUpperCase()}`, {
						description: e.message,
					});
				});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				{destinationId ? (
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
						Add Destination
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{destinationId ? "Update" : "Add"} Destination
					</DialogTitle>
					<DialogDescription>
						Configure a backup destination. Supports S3-compatible storage, FTP,
						and SFTP servers.
					</DialogDescription>
				</DialogHeader>
				{(isError || isErrorConnection) && (
					<AlertBlock type="error" className="w-full">
						{connectionError?.message || error?.message}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form-destination-add"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder={"My Backup Destination"} {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="destinationType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination Type</FormLabel>
									<FormControl>
										<Select
											onValueChange={field.onChange}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select destination type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="s3">S3 / S3-Compatible</SelectItem>
												<SelectItem value="ftp">FTP</SelectItem>
												<SelectItem value="sftp">SFTP</SelectItem>
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{destinationType === "s3" && (
							<>
								<FormField
									control={form.control}
									name="provider"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Provider</FormLabel>
											<FormControl>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value}
													value={field.value}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a S3 Provider" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{S3_PROVIDERS.map((s3Provider) => (
															<SelectItem
																key={s3Provider.key}
																value={s3Provider.key}
															>
																{s3Provider.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Access Key Id</FormLabel>
											<FormControl>
												<Input placeholder={"xcas41dasde"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Secret Access Key</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={"asd123asdasw"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="bucket"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Bucket</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy-bucket"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="region"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Region</FormLabel>
											<FormControl>
												<Input placeholder={"us-east-1"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="endpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Endpoint</FormLabel>
											<FormControl>
												<Input
													placeholder={"https://us.bucket.aws/s3"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{(destinationType === "ftp" || destinationType === "sftp") && (
							<>
								<FormField
									control={form.control}
									name="ftpHost"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input
													placeholder={
														destinationType === "sftp"
															? "sftp.example.com"
															: "ftp.example.com"
													}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ftpPort"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Port (default:{" "}
												{destinationType === "sftp" ? "22" : "21"})
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={
														destinationType === "sftp" ? "22" : "21"
													}
													{...field}
													value={field.value ?? ""}
													onChange={(e) => {
														const val = e.target.value;
														field.onChange(val ? Number(val) : undefined);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ftpUser"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder={"backupuser"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ftpPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={"••••••••"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="ftpBasePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Base Path (optional)</FormLabel>
											<FormControl>
												<Input placeholder={"/backups"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
					</form>

					<DialogFooter
						className={cn(
							isCloud ? "!flex-col" : "flex-row",
							"flex w-full  !justify-between gap-4",
						)}
					>
						{isCloud ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg">
								<span className="text-sm text-muted-foreground">
									Select a server to test the destination. If you don't have a
									server choose the default one.
								</span>
								<FormField
									control={form.control}
									name="serverId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Server (Optional)</FormLabel>
											<FormControl>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Select a server" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															<SelectLabel>Servers</SelectLabel>
															{servers?.map((server) => (
																<SelectItem
																	key={server.serverId}
																	value={server.serverId}
																>
																	{server.name}
																</SelectItem>
															))}
															<SelectItem value={"none"}>None</SelectItem>
														</SelectGroup>
													</SelectContent>
												</Select>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<Button
									type="button"
									variant={"secondary"}
									isLoading={isPendingConnection}
									onClick={async () => {
										await handleTestConnection(form.getValues("serverId"));
									}}
								>
									Test Connection
								</Button>
							</div>
						) : (
							<Button
								isLoading={isPendingConnection}
								type="button"
								variant="secondary"
								onClick={async () => {
									await handleTestConnection();
								}}
							>
								Test connection
							</Button>
						)}

						<Button
							isLoading={isPending}
							form="hook-form-destination-add"
							type="submit"
						>
							{destinationId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
