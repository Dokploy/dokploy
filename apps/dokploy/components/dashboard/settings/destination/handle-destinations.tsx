import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
	getDestinationValidationIssues,
	getFtpTlsState,
	isNamedRcloneDestinationProvider,
	isRcloneDestinationProvider,
	RCLONE_DESTINATION_PROVIDERS,
} from "@dokploy/server/db/validations/destination";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { DESTINATION_PROVIDERS } from "./constants";

const addDestination = z
	.object({
		name: z.string().min(1, "Name is required"),
		provider: z.string().min(1, "Provider is required"),
		accessKeyId: z.string(),
		secretAccessKey: z.string(),
		bucket: z.string(),
		region: z.string(),
		endpoint: z.string(),
		serverId: z.string().optional(),
		additionalFlags: z
			.array(
				z.object({
					value: z
						.string()
						.min(1, "Flag cannot be empty")
						.regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR),
				}),
			)
			.optional(),
	})
	.superRefine((data, ctx) => {
		const additionalFlags = data.additionalFlags?.map((flag) => flag.value) ?? [];
		for (const issue of getDestinationValidationIssues({
			provider: data.provider,
			accessKey: data.accessKeyId,
			region: data.region,
			endpoint: data.endpoint,
			additionalFlags,
		})) {
			ctx.addIssue({
				code: "custom",
				path: [issue.field === "accessKey" ? "accessKeyId" : issue.field],
				message: issue.message,
			});
		}

		if (isRcloneDestinationProvider(data.provider)) return;

		for (const [field, label] of [
			["accessKeyId", "Access Key Id"],
			["secretAccessKey", "Secret Access Key"],
			["bucket", "Bucket"],
			["endpoint", "Endpoint"],
		] as const) {
			if (!data[field].trim()) {
				ctx.addIssue({
					code: "custom",
					path: [field],
					message: `${label} is required`,
				});
			}
		}
	});

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

	const form = useForm<AddDestination>({
		defaultValues: {
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
			additionalFlags: [],
		},
		resolver: zodResolver(addDestination),
	});

	const currentProvider = form.watch("provider");
	const currentAdditionalFlags =
		form.watch("additionalFlags")?.map((flag) => flag.value) ?? [];
	const { implicitTlsEnabled: implicitFtpTlsEnabled } = getFtpTlsState(
		currentAdditionalFlags,
	);
	const isNamedRemote = isNamedRcloneDestinationProvider(currentProvider);
	const isFileTransfer =
		currentProvider === RCLONE_DESTINATION_PROVIDERS.FTP ||
		currentProvider === RCLONE_DESTINATION_PROVIDERS.SFTP;
	const hasRemoteServers = (servers?.length ?? 0) > 0;
	const showServerSelector = Boolean(isCloud) || hasRemoteServers;

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "additionalFlags",
	});

	useEffect(() => {
		if (destination) {
			form.reset({
				name: destination.name,
				provider: destination.provider || "",
				accessKeyId: destination.accessKey,
				secretAccessKey: destination.secretAccessKey,
				bucket: destination.bucket,
				region: destination.region,
				endpoint: destination.endpoint,
				additionalFlags:
					destination.additionalFlags?.map((f) => ({ value: f })) ?? [],
			});
		} else {
			form.reset();
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const getPayload = (data: AddDestination) => ({
		provider: data.provider,
		accessKey: isNamedRcloneDestinationProvider(data.provider)
			? ""
			: data.accessKeyId,
		bucket: data.bucket,
		endpoint: data.endpoint.trim(),
		name: data.name,
		region: isNamedRcloneDestinationProvider(data.provider) ? "" : data.region,
		secretAccessKey: isNamedRcloneDestinationProvider(data.provider)
			? ""
			: data.secretAccessKey,
		additionalFlags: data.additionalFlags?.map((f) => f.value) ?? [],
	});

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			...getPayload(data),
			destinationId: destinationId || "",
		})
			.then(async () => {
				toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
				await utils.destination.all.invalidate();
				if (destinationId) {
					await utils.destination.one.invalidate({ destinationId });
				}
				setOpen(false);
			})
			.catch((e) => {
				toast.error(
					`Error ${destinationId ? "Updating" : "Creating"} the Destination`,
					{
						description: e.message,
					},
				);
			});
	};

	const handleTestConnection = async (serverId?: string) => {
		const result = await form.trigger();

		if (!result) {
			const errors = form.formState.errors;
			const errorFields = Object.entries(errors)
				.map(([field, error]) => `${field}: ${error?.message}`)
				.filter(Boolean)
				.join("\n");

			toast.error("Please fill all required fields", {
				description: errorFields,
			});
			return;
		}

		const selectedServerId = serverId === "none" ? undefined : serverId;
		if (isCloud && !selectedServerId) {
			toast.error("Please select a server");
			return;
		}

		await testConnection({
			...getPayload(form.getValues()),
			name: "Test",
			serverId: selectedServerId,
		})
			.then(() => {
				toast.success("Connection Success");
			})
			.catch((e) => {
				toast.error("Error connecting to provider", {
					description: e.message,
				});
			});
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
						Configure a backup destination. Google Drive, OneDrive, and generic
						rclone destinations use a named rclone remote configured on the
						machine that executes the backup.
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
										<Input placeholder="Backups" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
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
													<SelectValue placeholder="Select a destination provider" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{DESTINATION_PROVIDERS.map((provider) => (
													<SelectItem key={provider.key} value={provider.key}>
														{provider.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{!isNamedRemote && (
							<FormField
								control={form.control}
								name="accessKeyId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{isFileTransfer ? "Username" : "Access Key Id"}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={
													isFileTransfer ? "username" : "Access Key ID"
												}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						{!isNamedRemote && (
							<FormField
								control={form.control}
								name="secretAccessKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{isFileTransfer
												? "Password (Optional)"
												: "Secret Access Key"}
										</FormLabel>
										<FormControl>
											<Input
												type={isFileTransfer ? "password" : "text"}
												placeholder={
													isFileTransfer ? "password" : "Secret Access Key"
												}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="bucket"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{isNamedRemote
											? "Remote Base Path (Optional)"
											: isFileTransfer
												? "Base Path / Directory (Optional)"
												: "Bucket"}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={
												isNamedRemote || isFileTransfer
													? "dokploy-backups"
													: "dokploy-bucket"
											}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{!isNamedRemote && (
							<FormField
								control={form.control}
								name="region"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{isFileTransfer ? "Port" : "Region"}</FormLabel>
										<FormControl>
											<Input
												placeholder={
													isFileTransfer
														? currentProvider ===
															RCLONE_DESTINATION_PROVIDERS.SFTP
															? "22"
															: implicitFtpTlsEnabled
																? "990"
																: "21"
														: "us-east-1"
												}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="endpoint"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{isNamedRemote
											? "Rclone Remote Name"
											: isFileTransfer
												? "Host"
												: "Endpoint"}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={
												isNamedRemote
													? currentProvider ===
														RCLONE_DESTINATION_PROVIDERS.ONEDRIVE
														? "onedrive"
														: "gdrive"
													: isFileTransfer
														? "storage.example.com"
														: "https://us.bucket.aws/s3"
											}
											{...field}
										/>
									</FormControl>
									{isNamedRemote && (
										<p className="text-xs text-muted-foreground">
											Configure this remote with rclone on the machine that runs
											the backup, then enter only its remote name here (without
											a colon).
										</p>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<FormLabel>
									{isFileTransfer
										? "Security / Additional Flags"
										: "Additional Flags (Optional)"}
								</FormLabel>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => append({ value: "" })}
								>
									<PlusIcon className="size-4" />
									Add Flag
								</Button>
							</div>
							{currentProvider === RCLONE_DESTINATION_PROVIDERS.FTP && (
								<p className="text-xs text-muted-foreground">
									Required: --ftp-explicit-tls for explicit FTPS (port 21) or
									--ftp-tls for implicit FTPS (port 990).
								</p>
							)}
							{currentProvider === RCLONE_DESTINATION_PROVIDERS.SFTP && (
								<p className="text-xs text-muted-foreground">
									Required: --sftp-known-hosts-file=/path/to/known_hosts to
									verify the server host key.
								</p>
							)}
							{fields.map((field, index) => (
								<FormField
									key={field.id}
									control={form.control}
									name={`additionalFlags.${index}.value`}
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center gap-2">
												<FormControl>
													<Input placeholder="--flag=value" {...field} />
												</FormControl>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => remove(index)}
												>
													<Trash2 className="size-4 text-muted-foreground" />
												</Button>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
							))}
						</div>
					</form>

					<DialogFooter
						className={cn(
							showServerSelector ? "flex-col!" : "flex-row",
							"flex w-full  justify-between! gap-4",
						)}
					>
						{showServerSelector ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg">
								<span className="text-sm text-muted-foreground">
									Select the server that will execute the backup so the
									destination can be tested from the same environment.
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
															{!isCloud && (
																<SelectItem value="none">
																	Dokploy Server (Local)
																</SelectItem>
															)}
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