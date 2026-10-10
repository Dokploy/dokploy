import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
} from "@dokploy/server/db/validations/destination";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type FieldPath,
	useFieldArray,
	useForm,
	useWatch,
} from "react-hook-form";
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

const providerSchema = z.string().min(1, "Provider is required");

const addDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: providerSchema,
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	bucket: z.string().optional(),
	region: z.string().optional(),
	endpoint: z.string().optional(),
	ftpHost: z.string().optional(),
	ftpPort: z.string().optional(),
	sftpHost: z.string().optional(),
	sftpPort: z.string().optional(),
	oauthClientSecret: z.string().optional(),
	oauthToken: z.string().optional(),
	googleRootFolderId: z.string().optional(),
	oneDriveDriveId: z.string().optional(),
	oneDriveDriveType: z
		.enum(["personal", "business", "documentLibrary"])
		.optional(),
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
});

type AddDestination = z.infer<typeof addDestination>;

type CloudOAuthBundle = { clientSecret: string; token: string };

const parseCloudOAuthBundle = (value: string): CloudOAuthBundle => {
	try {
		const parsed = JSON.parse(value) as Partial<CloudOAuthBundle>;
		return {
			clientSecret:
				typeof parsed.clientSecret === "string" ? parsed.clientSecret : "",
			token: typeof parsed.token === "string" ? parsed.token : "",
		};
	} catch {
		return { clientSecret: "", token: "" };
	}
};

const encodeCloudOAuthBundle = (clientSecret: string, token: string) =>
	JSON.stringify({ clientSecret, token });

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
			oauthClientSecret: "",
			oauthToken: "",
			googleRootFolderId: "",
			oneDriveDriveId: "",
			oneDriveDriveType: "personal",
			additionalFlags: [],
		},
		resolver: zodResolver(addDestination),
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "additionalFlags",
	});

	const provider = useWatch({ control: form.control, name: "provider" });

	const showS3Fields =
		Boolean(provider) &&
		!["ftp", "sftp", "google-drive", "onedrive"].includes(provider);
	const showFTPFields = provider === "ftp";
	const showSFTPFields = provider === "sftp";
	const showGoogleDriveFields = provider === "google-drive";
	const showOneDriveFields = provider === "onedrive";

	useEffect(() => {
		if (destination) {
			const cloudOAuth =
				destination.provider === "google-drive" ||
				destination.provider === "onedrive"
					? parseCloudOAuthBundle(destination.secretAccessKey)
					: { clientSecret: "", token: "" };
			form.reset({
				name: destination.name,
				provider: destination.provider || "",
				accessKeyId: destination.accessKey,
				secretAccessKey:
					destination.provider === "google-drive" ||
					destination.provider === "onedrive"
						? ""
						: destination.secretAccessKey,
				bucket: destination.bucket,
				region: destination.region,
				endpoint: destination.endpoint,
				ftpHost: destination.provider === "ftp" ? destination.endpoint : "",
				ftpPort: destination.provider === "ftp" ? destination.region : "21",
				sftpHost: destination.provider === "sftp" ? destination.endpoint : "",
				sftpPort: destination.provider === "sftp" ? destination.region : "22",
				oauthClientSecret: cloudOAuth.clientSecret,
				oauthToken: cloudOAuth.token,
				googleRootFolderId:
					destination.provider === "google-drive" ? destination.endpoint : "",
				oneDriveDriveId:
					destination.provider === "onedrive" ? destination.endpoint : "",
				oneDriveDriveType:
					destination.provider === "onedrive" &&
					["personal", "business", "documentLibrary"].includes(
						destination.region,
					)
						? (destination.region as
								| "personal"
								| "business"
								| "documentLibrary")
						: "personal",
				additionalFlags:
					destination.additionalFlags?.map((f) => ({ value: f })) ?? [],
			});
		} else {
			form.reset();
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const onSubmit = async (data: AddDestination) => {
		const ftp = data.provider === "ftp";
		const sftp = data.provider === "sftp";
		const googleDrive = data.provider === "google-drive";
		const oneDrive = data.provider === "onedrive";
		await mutateAsync({
			provider: data.provider || "",
			accessKey: data.accessKeyId || "",
			bucket: data.bucket || "",
			endpoint: ftp
				? data.ftpHost || ""
				: sftp
					? data.sftpHost || ""
					: googleDrive
						? data.googleRootFolderId || ""
						: oneDrive
							? data.oneDriveDriveId || ""
							: data.endpoint || "",
			name: data.name,
			region: ftp
				? data.ftpPort || "21"
				: sftp
					? data.sftpPort || "22"
					: oneDrive
						? data.oneDriveDriveType || "personal"
						: data.region || "",
			secretAccessKey:
				googleDrive || oneDrive
					? encodeCloudOAuthBundle(
							data.oauthClientSecret || "",
							data.oauthToken || "",
						)
					: data.secretAccessKey || "",
			destinationId: destinationId || "",
			additionalFlags: data.additionalFlags?.map((f) => f.value) ?? [],
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
		const provider = form.getValues("provider");
		const requiredFields = getRequiredFields(provider);

		const result = await form.trigger(requiredFields);

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

		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}

		const ftp = provider === "ftp";
		const sftp = provider === "sftp";
		const googleDrive = provider === "google-drive";
		const oneDrive = provider === "onedrive";
		const testInput = {
			provider,
			accessKey: form.getValues("accessKeyId") || "",
			secretAccessKey:
				googleDrive || oneDrive
					? encodeCloudOAuthBundle(
							form.getValues("oauthClientSecret") || "",
							form.getValues("oauthToken") || "",
						)
					: form.getValues("secretAccessKey") || "",
			bucket: form.getValues("bucket") || "",
			endpoint: ftp
				? form.getValues("ftpHost") || ""
				: sftp
					? form.getValues("sftpHost") || ""
					: googleDrive
						? form.getValues("googleRootFolderId") || ""
						: oneDrive
							? form.getValues("oneDriveDriveId") || ""
							: form.getValues("endpoint") || "",
			region: ftp
				? form.getValues("ftpPort") || "21"
				: sftp
					? form.getValues("sftpPort") || "22"
					: oneDrive
						? form.getValues("oneDriveDriveType") || "personal"
						: form.getValues("region") || "",
			name: "Test",
			serverId,
			additionalFlags:
				form.getValues("additionalFlags")?.map((f) => f.value) ?? [],
		};

		await testConnection(testInput)
			.then(() => {
				toast.success("Connection Success");
			})
			.catch((e) => {
				toast.error("Error connecting to provider", {
					description: e.message,
				});
			});
	};

	const getRequiredFields = (provider: string): FieldPath<AddDestination>[] => {
		const baseFields: FieldPath<AddDestination>[] = [
			"provider",
			"additionalFlags",
		];
		switch (provider) {
			case "ftp":
				return [
					...baseFields,
					"accessKeyId",
					"secretAccessKey",
					"ftpHost",
					"ftpPort",
				];
			case "sftp":
				return [
					...baseFields,
					"accessKeyId",
					"secretAccessKey",
					"sftpHost",
					"sftpPort",
				];
			case "google-drive":
				return [...baseFields, "accessKeyId", "oauthToken"];
			case "onedrive":
				return [
					...baseFields,
					"accessKeyId",
					"oauthToken",
					"oneDriveDriveId",
					"oneDriveDriveType",
				];
			default:
				return [
					...baseFields,
					"accessKeyId",
					"secretAccessKey",
					"bucket",
					"endpoint",
				];
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
						In this section, you can configure and add new destinations for your
						backups. Please ensure that you provide the correct information to
						guarantee secure and efficient storage.
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
											<Input placeholder={"S3 Bucket"} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
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
														<SelectValue placeholder="Select a Provider" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>S3 Compatible</SelectLabel>
														{S3_PROVIDERS.map((s3Provider) => (
															<SelectItem
																key={s3Provider.key}
																value={s3Provider.key}
															>
																{s3Provider.name}
															</SelectItem>
														))}
													</SelectGroup>
													<SelectGroup>
														<SelectLabel>Cloud Drives</SelectLabel>
														<SelectItem key="google-drive" value="google-drive">
															Google Drive
														</SelectItem>
														<SelectItem key="onedrive" value="onedrive">
															Microsoft OneDrive
														</SelectItem>
													</SelectGroup>
													<SelectGroup>
														<SelectLabel>File Transfer</SelectLabel>
														<SelectItem key="ftp" value="ftp">
															FTP
														</SelectItem>
														<SelectItem key="sftp" value="sftp">
															SFTP
														</SelectItem>
													</SelectGroup>
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						{showS3Fields && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Access Key Id</FormLabel>
												<FormControl>
													<Input placeholder={"xcas41dasde"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="secretAccessKey"
									render={({ field }) => (
										<FormItem>
											<div className="space-y-0.5">
												<FormLabel>Secret Access Key</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"asd123asdasw"} {...field} />
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
											<div className="space-y-0.5">
												<FormLabel>Bucket</FormLabel>
											</div>
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
											<div className="space-y-0.5">
												<FormLabel>Region</FormLabel>
											</div>
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
						{showGoogleDriveFields && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>OAuth Client ID</FormLabel>
											<FormControl>
												<Input
													placeholder="Google OAuth client ID"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oauthClientSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>OAuth Client Secret (Optional)</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Google OAuth client secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oauthToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>rclone OAuth Token JSON</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder='{"access_token":"...","refresh_token":"..."}'
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
											<FormLabel>Remote Path (Optional)</FormLabel>
											<FormControl>
												<Input placeholder="dokploy-backups" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="googleRootFolderId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Root Folder ID (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="Google Drive root folder ID"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						{showOneDriveFields && (
							<>
								<FormField
									control={form.control}
									name="accessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>OAuth Client ID</FormLabel>
											<FormControl>
												<Input
													placeholder="Microsoft OAuth client ID"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oauthClientSecret"
									render={({ field }) => (
										<FormItem>
											<FormLabel>OAuth Client Secret (Optional)</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="Microsoft OAuth client secret"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oauthToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>rclone OAuth Token JSON</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder='{"access_token":"...","refresh_token":"..."}'
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oneDriveDriveId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Drive ID</FormLabel>
											<FormControl>
												<Input placeholder="OneDrive drive ID" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="oneDriveDriveType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Drive Type</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || "personal"}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="personal">Personal</SelectItem>
													<SelectItem value="business">Business</SelectItem>
													<SelectItem value="documentLibrary">
														Document Library
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="bucket"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Path (Optional)</FormLabel>
											<FormControl>
												<Input placeholder="dokploy-backups" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						{showFTPFields && (
							<>
								<FormField
									control={form.control}
									name="ftpHost"
									render={({ field }) => (
										<FormItem>
											<FormLabel>FTP Host</FormLabel>
											<FormControl>
												<Input placeholder={"ftp.example.com"} {...field} />
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
											<FormLabel>FTP Port</FormLabel>
											<FormControl>
												<Input placeholder={"21"} {...field} />
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
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder={"username"} {...field} />
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
											<div className="space-y-0.5">
												<FormLabel>Password</FormLabel>
											</div>
											<FormControl>
												<Input
													placeholder={"password"}
													{...field}
													type="password"
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
											<div className="space-y-0.5">
												<FormLabel>Remote Path (Optional)</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"backups"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						{showSFTPFields && (
							<>
								<FormField
									control={form.control}
									name="sftpHost"
									render={({ field }) => (
										<FormItem>
											<FormLabel>SFTP Host</FormLabel>
											<FormControl>
												<Input placeholder={"sftp.example.com"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="sftpPort"
									render={({ field }) => (
										<FormItem>
											<FormLabel>SFTP Port</FormLabel>
											<FormControl>
												<Input placeholder={"22"} {...field} />
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
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder={"username"} {...field} />
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
											<div className="space-y-0.5">
												<FormLabel>Password</FormLabel>
											</div>
											<FormControl>
												<Input
													placeholder={"password"}
													{...field}
													type="password"
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
											<div className="space-y-0.5">
												<FormLabel>Remote Path (Optional)</FormLabel>
											</div>
											<FormControl>
												<Input placeholder={"backups"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<FormLabel>Additional Flags (Optional)</FormLabel>
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
							{fields.map((field, index) => (
								<FormField
									key={field.id}
									control={form.control}
									name={`additionalFlags.${index}.value`}
									render={({ field }) => (
										<FormItem>
											<div className="flex items-center gap-2">
												<FormControl>
													<Input
														placeholder="--s3-sign-accept-encoding=false"
														{...field}
													/>
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
							isCloud ? "flex-col!" : "flex-row",
							"flex w-full  justify-between! gap-4",
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
