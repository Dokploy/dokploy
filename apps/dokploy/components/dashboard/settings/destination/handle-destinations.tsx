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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { DESTINATION_TYPES, S3_PROVIDERS } from "./constants";

const addDestination = z.object({
	name: z.string().min(1, "Name is required"),
	destinationType: z.string().min(1, "Destination type is required"),
	// S3 fields
	provider: z.string().optional(),
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	bucket: z.string().optional(),
	region: z.string().optional(),
	endpoint: z.string().optional(),
	// FTP / SFTP fields
	ftpHost: z.string().optional(),
	ftpPort: z.string().optional(),
	ftpUser: z.string().optional(),
	ftpPassword: z.string().optional(),
	ftpBasePath: z.string().optional(),
	// Google Drive fields
	googleDriveClientId: z.string().optional(),
	googleDriveClientSecret: z.string().optional(),
	googleDriveToken: z.string().optional(),
	googleDriveFolderId: z.string().optional(),
	// OneDrive fields
	onedriveClientId: z.string().optional(),
	onedriveClientSecret: z.string().optional(),
	onedriveToken: z.string().optional(),
	onedriveDriveId: z.string().optional(),
	onedriveFolderId: z.string().optional(),
	// Custom rclone fields
	rcloneConfig: z.string().optional(),
	rcloneRemotePath: z.string().optional(),
	// Server selection (for cloud)
	serverId: z.string().optional(),
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
			destinationType: "s3",
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
			ftpHost: "",
			ftpPort: "",
			ftpUser: "",
			ftpPassword: "",
			ftpBasePath: "",
			googleDriveClientId: "",
			googleDriveClientSecret: "",
			googleDriveToken: "",
			googleDriveFolderId: "",
			onedriveClientId: "",
			onedriveClientSecret: "",
			onedriveToken: "",
			onedriveDriveId: "",
			onedriveFolderId: "",
			rcloneConfig: "",
			rcloneRemotePath: "",
		},
		resolver: zodResolver(addDestination),
	});

	const watchedDestType = form.watch("destinationType");

	useEffect(() => {
		if (destination) {
			form.reset({
				name: destination.name,
				destinationType: destination.destinationType || "s3",
				provider: destination.provider || "",
				accessKeyId: destination.accessKey,
				secretAccessKey: destination.secretAccessKey,
				bucket: destination.bucket,
				region: destination.region,
				endpoint: destination.endpoint,
				ftpHost: destination.ftpHost || "",
				ftpPort: destination.ftpPort || "",
				ftpUser: destination.ftpUser || "",
				ftpPassword: destination.ftpPassword || "",
				ftpBasePath: destination.ftpBasePath || "",
				googleDriveClientId: destination.googleDriveClientId || "",
				googleDriveClientSecret: destination.googleDriveClientSecret || "",
				googleDriveToken: destination.googleDriveToken || "",
				googleDriveFolderId: destination.googleDriveFolderId || "",
				onedriveClientId: destination.onedriveClientId || "",
				onedriveClientSecret: destination.onedriveClientSecret || "",
				onedriveToken: destination.onedriveToken || "",
				onedriveDriveId: destination.onedriveDriveId || "",
				onedriveFolderId: destination.onedriveFolderId || "",
				rcloneConfig: destination.rcloneConfig || "",
				rcloneRemotePath: destination.rcloneRemotePath || "",
			});
		} else {
			form.reset();
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			destinationType: (data.destinationType as any) || "s3",
			provider: data.provider || "",
			accessKey: data.accessKeyId || "",
			bucket: data.bucket || "",
			endpoint: data.endpoint || "",
			name: data.name,
			region: data.region || "",
			secretAccessKey: data.secretAccessKey || "",
			destinationId: destinationId || "",
			ftpHost: data.ftpHost || "",
			ftpPort: data.ftpPort || "",
			ftpUser: data.ftpUser || "",
			ftpPassword: data.ftpPassword || "",
			ftpBasePath: data.ftpBasePath || "",
			googleDriveClientId: data.googleDriveClientId || "",
			googleDriveClientSecret: data.googleDriveClientSecret || "",
			googleDriveToken: data.googleDriveToken || "",
			googleDriveFolderId: data.googleDriveFolderId || "",
			onedriveClientId: data.onedriveClientId || "",
			onedriveClientSecret: data.onedriveClientSecret || "",
			onedriveToken: data.onedriveToken || "",
			onedriveDriveId: data.onedriveDriveId || "",
			onedriveFolderId: data.onedriveFolderId || "",
			rcloneConfig: data.rcloneConfig || "",
			rcloneRemotePath: data.rcloneRemotePath || "",
		})
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
		const destType = form.getValues("destinationType") || "s3";

		if (destType === "s3") {
			const result = await form.trigger([
				"provider",
				"accessKeyId",
				"secretAccessKey",
				"bucket",
				"endpoint",
			]);

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
		}

		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}

		const data = form.getValues();

		await testConnection({
			destinationType: (data.destinationType as any) || "s3",
			provider: data.provider || "",
			accessKey: data.accessKeyId || "",
			bucket: data.bucket || "",
			endpoint: data.endpoint || "",
			name: "Test",
			region: data.region || "",
			secretAccessKey: data.secretAccessKey || "",
			ftpHost: data.ftpHost || "",
			ftpPort: data.ftpPort || "",
			ftpUser: data.ftpUser || "",
			ftpPassword: data.ftpPassword || "",
			ftpBasePath: data.ftpBasePath || "",
			googleDriveClientId: data.googleDriveClientId || "",
			googleDriveClientSecret: data.googleDriveClientSecret || "",
			googleDriveToken: data.googleDriveToken || "",
			googleDriveFolderId: data.googleDriveFolderId || "",
			onedriveClientId: data.onedriveClientId || "",
			onedriveClientSecret: data.onedriveClientSecret || "",
			onedriveToken: data.onedriveToken || "",
			onedriveDriveId: data.onedriveDriveId || "",
			onedriveFolderId: data.onedriveFolderId || "",
			rcloneConfig: data.rcloneConfig || "",
			rcloneRemotePath: data.rcloneRemotePath || "",
			serverId,
		})
			.then(() => {
				toast.success("Connection Success");
			})
			.catch((e) => {
				toast.error("Error connecting to destination", {
					description: e.message,
				});
			});
	};

	const renderS3Fields = () => (
		<>
			<FormField
				control={form.control}
				name="provider"
				render={({ field }) => {
					return (
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
					);
				}}
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
							<Input
								placeholder="https://us.bucket.aws/s3"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);

	const renderFtpFields = () => (
		<>
			<FormField
				control={form.control}
				name="ftpHost"
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
				name="ftpPort"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Port</FormLabel>
						<FormControl>
							<Input
								placeholder={
									watchedDestType === "sftp" ? "22" : "21"
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
				name="ftpUser"
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
				name="ftpPassword"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Password</FormLabel>
						<FormControl>
							<Input
								type="password"
								placeholder="Password"
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
							<Input placeholder="/backups/dokploy" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);

	const renderGoogleDriveFields = () => (
		<>
			<FormField
				control={form.control}
				name="googleDriveClientId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Client ID</FormLabel>
						<FormControl>
							<Input placeholder="OAuth Client ID" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="googleDriveClientSecret"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Client Secret</FormLabel>
						<FormControl>
							<Input
								type="password"
								placeholder="OAuth Client Secret"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="googleDriveToken"
				render={({ field }) => (
					<FormItem>
						<FormLabel>OAuth Token (JSON)</FormLabel>
						<FormControl>
							<Textarea
								placeholder='{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'
								className="font-mono text-xs"
								rows={3}
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="googleDriveFolderId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Folder ID (optional)</FormLabel>
						<FormControl>
							<Input
								placeholder="Root folder ID from Google Drive"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);

	const renderOneDriveFields = () => (
		<>
			<FormField
				control={form.control}
				name="onedriveClientId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Client ID</FormLabel>
						<FormControl>
							<Input placeholder="Azure App Client ID" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="onedriveClientSecret"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Client Secret</FormLabel>
						<FormControl>
							<Input
								type="password"
								placeholder="Azure App Client Secret"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="onedriveToken"
				render={({ field }) => (
					<FormItem>
						<FormLabel>OAuth Token (JSON)</FormLabel>
						<FormControl>
							<Textarea
								placeholder='{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'
								className="font-mono text-xs"
								rows={3}
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="onedriveDriveId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Drive ID (optional)</FormLabel>
						<FormControl>
							<Input placeholder="OneDrive drive ID" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="onedriveFolderId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Folder Path (optional)</FormLabel>
						<FormControl>
							<Input
								placeholder="Backups/dokploy"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);

	const renderCustomRcloneFields = () => (
		<>
			<FormField
				control={form.control}
				name="rcloneConfig"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Rclone Configuration</FormLabel>
						<FormControl>
							<Textarea
								placeholder={`[dokploy-remote]\ntype = b2\naccount = your-account-id\nkey = your-application-key`}
								className="font-mono text-xs"
								rows={8}
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="rcloneRemotePath"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Remote Path (optional)</FormLabel>
						<FormControl>
							<Input
								placeholder="bucket-name/backups"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</>
	);

	const renderFieldsForType = () => {
		switch (watchedDestType) {
			case "ftp":
			case "sftp":
				return renderFtpFields();
			case "google-drive":
				return renderGoogleDriveFields();
			case "onedrive":
				return renderOneDriveFields();
			case "custom-rclone":
				return renderCustomRcloneFields();
			default:
				return renderS3Fields();
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
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{destinationId ? "Update" : "Add"} Destination
					</DialogTitle>
					<DialogDescription>
						Configure a backup destination. Choose from S3-compatible storage,
						FTP, SFTP, Google Drive, OneDrive, or provide a custom rclone
						configuration for any supported backend.
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
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder={"My Backup Destination"} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						<FormField
							control={form.control}
							name="destinationType"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Destination Type</FormLabel>
										<FormControl>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a destination type" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{DESTINATION_TYPES.map((dt) => (
														<SelectItem key={dt.key} value={dt.key}>
															{dt.name} - {dt.description}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						{renderFieldsForType()}
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
