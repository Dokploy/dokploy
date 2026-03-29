import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type DestinationType = "s3" | "sftp" | "ftp" | "gdrive";

const DESTINATION_TYPES: { value: DestinationType; label: string }[] = [
	{ value: "s3", label: "S3 / S3-Compatible" },
	{ value: "sftp", label: "SFTP" },
	{ value: "ftp", label: "FTP" },
	{ value: "gdrive", label: "Google Drive" },
];

const s3Schema = z.object({
	destinationType: z.literal("s3"),
	name: z.string().min(1, "Name is required"),
	provider: z.string().min(1, "Provider is required"),
	accessKeyId: z.string().min(1, "Access Key Id is required"),
	secretAccessKey: z.string().min(1, "Secret Access Key is required"),
	bucket: z.string().min(1, "Bucket is required"),
	region: z.string(),
	endpoint: z.string().min(1, "Endpoint is required"),
	serverId: z.string().optional(),
});

const sftpSchema = z.object({
	destinationType: z.literal("sftp"),
	name: z.string().min(1, "Name is required"),
	host: z.string().min(1, "Host is required"),
	port: z.string().default("22"),
	user: z.string().min(1, "User is required"),
	password: z.string().min(1, "Password is required"),
	remotePath: z.string().default("/"),
	serverId: z.string().optional(),
});

const ftpSchema = z.object({
	destinationType: z.literal("ftp"),
	name: z.string().min(1, "Name is required"),
	host: z.string().min(1, "Host is required"),
	port: z.string().default("21"),
	user: z.string().min(1, "User is required"),
	password: z.string().min(1, "Password is required"),
	remotePath: z.string().default("/"),
	explicitTls: z.boolean().default(false),
	serverId: z.string().optional(),
});

const gdriveSchema = z.object({
	destinationType: z.literal("gdrive"),
	name: z.string().min(1, "Name is required"),
	serviceAccountKey: z
		.string()
		.min(1, "Service Account JSON is required"),
	rootFolderId: z.string().optional(),
	serverId: z.string().optional(),
});

const addDestination = z.discriminatedUnion("destinationType", [
	s3Schema,
	sftpSchema,
	ftpSchema,
	gdriveSchema,
]);

type AddDestination = z.infer<typeof addDestination>;

interface Props {
	destinationId?: string;
}

export const HandleDestinations = ({ destinationId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync, isError, error, isPending } = destinationId
		? api.destination.update.useMutation()
		: api.destination.create.useMutation();

	const { data: destination } = api.destination.one.useQuery(
		{ destinationId: destinationId || "" },
		{ enabled: !!destinationId, refetchOnWindowFocus: false },
	);

	const {
		mutateAsync: testConnection,
		isPending: isPendingConnection,
		error: connectionError,
		isError: isErrorConnection,
	} = api.destination.testConnection.useMutation();

	const form = useForm<AddDestination>({
		defaultValues: {
			destinationType: "s3",
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
		} as AddDestination,
		resolver: zodResolver(addDestination),
	});

	const destinationType = form.watch("destinationType");

	useEffect(() => {
		if (destination) {
			const type = (destination.destinationType ?? "s3") as DestinationType;
			if (type === "s3") {
				form.reset({
					destinationType: "s3",
					name: destination.name,
					provider: destination.provider || "",
					accessKeyId: destination.accessKey,
					secretAccessKey: destination.secretAccessKey,
					bucket: destination.bucket,
					region: destination.region,
					endpoint: destination.endpoint,
				});
			} else if (type === "sftp") {
				const cfg = destination.providerConfig as {
					host: string;
					port: string;
					user: string;
					password: string;
					remotePath: string;
				};
				form.reset({
					destinationType: "sftp",
					name: destination.name,
					host: cfg?.host ?? "",
					port: cfg?.port ?? "22",
					user: cfg?.user ?? "",
					password: cfg?.password ?? "",
					remotePath: cfg?.remotePath ?? "/",
				});
			} else if (type === "ftp") {
				const cfg = destination.providerConfig as {
					host: string;
					port: string;
					user: string;
					password: string;
					remotePath: string;
					explicitTls: boolean;
				};
				form.reset({
					destinationType: "ftp",
					name: destination.name,
					host: cfg?.host ?? "",
					port: cfg?.port ?? "21",
					user: cfg?.user ?? "",
					password: cfg?.password ?? "",
					remotePath: cfg?.remotePath ?? "/",
					explicitTls: cfg?.explicitTls ?? false,
				});
			} else if (type === "gdrive") {
				const cfg = destination.providerConfig as {
					serviceAccountKey: string;
					rootFolderId?: string;
				};
				form.reset({
					destinationType: "gdrive",
					name: destination.name,
					serviceAccountKey: cfg?.serviceAccountKey ?? "",
					rootFolderId: cfg?.rootFolderId ?? "",
				});
			}
		} else {
			form.reset({ destinationType: "s3" } as AddDestination);
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const buildApiPayload = (data: AddDestination) => {
		if (data.destinationType === "s3") {
			return {
				destinationType: "s3" as const,
				name: data.name,
				provider: data.provider,
				accessKey: data.accessKeyId,
				bucket: data.bucket,
				endpoint: data.endpoint,
				region: data.region,
				secretAccessKey: data.secretAccessKey,
				serverId: data.serverId,
			};
		}
		if (data.destinationType === "sftp") {
			return {
				destinationType: "sftp" as const,
				name: data.name,
				providerConfig: {
					host: data.host,
					port: data.port,
					user: data.user,
					password: data.password,
					remotePath: data.remotePath,
				},
				serverId: data.serverId,
			};
		}
		if (data.destinationType === "ftp") {
			return {
				destinationType: "ftp" as const,
				name: data.name,
				providerConfig: {
					host: data.host,
					port: data.port,
					user: data.user,
					password: data.password,
					remotePath: data.remotePath,
					explicitTls: data.explicitTls,
				},
				serverId: data.serverId,
			};
		}
		// gdrive
		return {
			destinationType: "gdrive" as const,
			name: data.name,
			providerConfig: {
				serviceAccountKey: data.serviceAccountKey,
				rootFolderId: data.rootFolderId,
			},
			serverId: data.serverId,
		};
	};

	const onSubmit = async (data: AddDestination) => {
		const payload = buildApiPayload(data);
		await mutateAsync({ ...payload, destinationId: destinationId || "" } as Parameters<typeof mutateAsync>[0])
			.then(async () => {
				toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
				await utils.destination.all.invalidate();
				if (destinationId) {
					await utils.destination.one.invalidate({ destinationId });
				}
				setOpen(false);
			})
			.catch(() => {
				toast.error(
					`Error ${destinationId ? "Updating" : "Creating"} the Destination`,
				);
			});
	};

	const handleTestConnection = async (serverId?: string) => {
		const values = form.getValues();
		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}
		const payload = buildApiPayload(values as AddDestination);
		await testConnection({ ...payload, serverId } as Parameters<typeof testConnection>[0])
			.then(() => toast.success("Connection Success"))
			.catch((e) => toast.error("Error connecting to destination", { description: e.message }));
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger className="" asChild>
				{destinationId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
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
						Configure a backup destination. Supports S3-compatible storage,
						SFTP, FTP, and Google Drive via a service account.
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
						className="grid w-full gap-4"
					>
						{/* Destination name */}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="My Backup Destination" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Destination type selector */}
						<FormField
							control={form.control}
							name="destinationType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination Type</FormLabel>
									<FormControl>
										<Select
											onValueChange={(v) => {
												field.onChange(v);
												// Reset type-specific fields when switching
												form.setValue("name", form.getValues("name"));
											}}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a destination type" />
											</SelectTrigger>
											<SelectContent>
												{DESTINATION_TYPES.map((t) => (
													<SelectItem key={t.value} value={t.value}>
														{t.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* ── S3 fields ── */}
						{destinationType === "s3" && (
							<>
								<FormField
									control={form.control}
									name="provider"
									render={({ field }) => (
										<FormItem>
											<FormLabel>S3 Provider</FormLabel>
											<FormControl>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value}
													value={field.value}
												>
													<SelectTrigger>
														<SelectValue placeholder="Select a S3 Provider" />
													</SelectTrigger>
													<SelectContent>
														{S3_PROVIDERS.map((s3Provider) => (
															<SelectItem key={s3Provider.key} value={s3Provider.key}>
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
												<Input placeholder="xcas41dasde" {...field} />
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
												<Input placeholder="asd123asdasw" {...field} />
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
												<Input placeholder="dokploy-bucket" {...field} />
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
												<Input placeholder="us-east-1" {...field} />
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
												<Input placeholder="https://us.bucket.aws/s3" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* ── SFTP fields ── */}
						{destinationType === "sftp" && (
							<>
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input placeholder="sftp.example.com" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="port"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Port</FormLabel>
											<FormControl>
												<Input placeholder="22" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="user"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder="backup-user" {...field} />
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
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input type="password" placeholder="••••••••" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="remotePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Path</FormLabel>
											<FormControl>
												<Input placeholder="/backups" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* ── FTP fields ── */}
						{destinationType === "ftp" && (
							<>
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input placeholder="ftp.example.com" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="port"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Port</FormLabel>
											<FormControl>
												<Input placeholder="21" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="user"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder="backup-user" {...field} />
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
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input type="password" placeholder="••••••••" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="remotePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Path</FormLabel>
											<FormControl>
												<Input placeholder="/backups" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="explicitTls"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center gap-2">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
											<FormLabel className="!mt-0">Use Explicit TLS (FTPS)</FormLabel>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* ── Google Drive fields ── */}
						{destinationType === "gdrive" && (
							<>
								<FormField
									control={form.control}
									name="serviceAccountKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Service Account JSON</FormLabel>
											<FormControl>
												<textarea
													className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
													placeholder='{"type": "service_account", ...}'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rootFolderId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Root Folder ID (optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
													{...field}
												/>
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
							"flex w-full !justify-between gap-4",
						)}
					>
						{isCloud ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg">
								<span className="text-sm text-muted-foreground">
									Select a server to test the destination.
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
															<SelectItem value="none">None</SelectItem>
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
									variant="secondary"
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
