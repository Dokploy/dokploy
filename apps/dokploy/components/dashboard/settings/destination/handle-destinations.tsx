import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import {
	getDestinationProviderType,
	RCLONE_DESTINATION_PROVIDERS,
	S3_PROVIDERS,
} from "./constants";

type DestinationFieldName =
	| "accessKeyId"
	| "secretAccessKey"
	| "bucket"
	| "region"
	| "endpoint";

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
		const providerType = getDestinationProviderType(data.provider);
		const addRequiredIssue = (path: DestinationFieldName, message: string) => {
			ctx.addIssue({ code: "custom", path: [path], message });
		};

		if (providerType === "s3") {
			if (!data.accessKeyId.trim()) {
				addRequiredIssue("accessKeyId", "Access Key Id is required");
			}
			if (!data.secretAccessKey.trim()) {
				addRequiredIssue("secretAccessKey", "Secret Access Key is required");
			}
			if (!data.bucket.trim()) {
				addRequiredIssue("bucket", "Bucket is required");
			}
			if (!data.endpoint.trim()) {
				addRequiredIssue("endpoint", "Endpoint is required");
			}
			return;
		}

		if (providerType === "ftp" || providerType === "sftp") {
			if (!data.endpoint.trim()) {
				addRequiredIssue("endpoint", "Host is required");
			}
			if (!data.accessKeyId.trim()) {
				addRequiredIssue("accessKeyId", "Username is required");
			}
			if (!data.secretAccessKey.trim()) {
				addRequiredIssue("secretAccessKey", "Password is required");
			}
			if (data.region.trim()) {
				const port = Number(data.region);
				if (!Number.isInteger(port) || port < 1 || port > 65535) {
					addRequiredIssue("region", "Port must be between 1 and 65535");
				}
			}
			return;
		}

		if (!data.endpoint.trim()) {
			addRequiredIssue("endpoint", "OAuth token JSON is required");
			return;
		}

		try {
			JSON.parse(data.endpoint);
		} catch {
			addRequiredIssue("endpoint", "OAuth token must be valid JSON");
		}
	});

type AddDestination = z.infer<typeof addDestination>;

const getFieldLabels = (provider: string) => {
	const providerType = getDestinationProviderType(provider);
	if (providerType === "ftp" || providerType === "sftp") {
		return {
			namePlaceholder: `${providerType.toUpperCase()} Backups`,
			accessKeyLabel: "Username",
			accessKeyPlaceholder: "dokploy",
			secretLabel: "Password",
			secretPlaceholder: "password",
			bucketLabel: "Base Path",
			bucketPlaceholder: "/backups",
			regionLabel: "Port",
			regionPlaceholder: providerType === "ftp" ? "21" : "22",
			endpointLabel: "Host",
			endpointPlaceholder: "backup.example.com",
			additionalFlagPlaceholder:
				providerType === "ftp"
					? "--ftp-explicit-tls=true"
					: "--sftp-known-hosts-file=/root/.ssh/known_hosts",
		};
	}
	if (providerType === "drive" || providerType === "onedrive") {
		return {
			namePlaceholder:
				providerType === "drive" ? "Google Drive Backups" : "OneDrive Backups",
			accessKeyLabel: "Client ID (Optional)",
			accessKeyPlaceholder: "client-id",
			secretLabel: "Client Secret (Optional)",
			secretPlaceholder: "client-secret",
			bucketLabel: "Base Folder",
			bucketPlaceholder: "dokploy-backups",
			regionLabel:
				providerType === "drive"
					? "Root Folder ID (Optional)"
					: "Drive ID (Optional)",
			regionPlaceholder:
				providerType === "drive" ? "root-folder-id" : "drive-id",
			endpointLabel: "OAuth Token JSON",
			endpointPlaceholder:
				'{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}',
			additionalFlagPlaceholder:
				providerType === "drive"
					? "--drive-scope=drive"
					: "--onedrive-drive-type=business",
		};
	}
	return {
		namePlaceholder: "S3 Bucket",
		accessKeyLabel: "Access Key Id",
		accessKeyPlaceholder: "xcas41dasde",
		secretLabel: "Secret Access Key",
		secretPlaceholder: "asd123asdasw",
		bucketLabel: "Bucket",
		bucketPlaceholder: "dokploy-bucket",
		regionLabel: "Region",
		regionPlaceholder: "us-east-1",
		endpointLabel: "Endpoint",
		endpointPlaceholder: "https://us.bucket.aws/s3",
		additionalFlagPlaceholder: "--s3-sign-accept-encoding=false",
	};
};

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

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "additionalFlags",
	});
	const selectedProvider = form.watch("provider");
	const selectedProviderType = getDestinationProviderType(selectedProvider);
	const fieldLabels = getFieldLabels(selectedProvider);

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

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			provider: data.provider || "",
			accessKey: data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.region,
			secretAccessKey: data.secretAccessKey,
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

	const handleProviderChange = (value: string) => {
		const previousType = getDestinationProviderType(form.getValues("provider"));
		const nextType = getDestinationProviderType(value);
		form.setValue("provider", value);
		if (previousType !== nextType) {
			form.setValue("accessKeyId", "");
			form.setValue("secretAccessKey", "");
			form.setValue("bucket", "");
			form.setValue("region", "");
			form.setValue("endpoint", "");
			form.setValue("additionalFlags", []);
			form.clearErrors([
				"accessKeyId",
				"secretAccessKey",
				"bucket",
				"region",
				"endpoint",
				"additionalFlags",
			]);
		}
	};

	const handleTestConnection = async (serverId?: string) => {
		const result = await form.trigger([
			"provider",
			"accessKeyId",
			"secretAccessKey",
			"bucket",
			"region",
			"endpoint",
			"additionalFlags",
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

		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}

		const provider = form.getValues("provider");
		const accessKey = form.getValues("accessKeyId");
		const secretKey = form.getValues("secretAccessKey");
		const bucket = form.getValues("bucket");
		const endpoint = form.getValues("endpoint");
		const region = form.getValues("region");
		const providerType = getDestinationProviderType(provider);
		const connectionString =
			providerType === "s3"
				? `:s3,provider=${provider},access_key_id=***,secret_access_key=***,endpoint=${endpoint}${region ? `,region=${region}` : ""}:${bucket}`
				: `:${providerType}:${bucket}`;

		await testConnection({
			provider,
			accessKey,
			bucket,
			endpoint,
			name: "Test",
			region,
			secretAccessKey: secretKey,
			serverId,
			additionalFlags:
				form.getValues("additionalFlags")?.map((f) => f.value) ?? [],
		})
			.then(() => {
				toast.success("Connection Success");
			})
			.catch((e) => {
				toast.error("Error connecting to provider", {
					description: `${e.message}\n\nTry manually: rclone ls ${connectionString}`,
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
											<Input
												placeholder={fieldLabels.namePlaceholder}
												{...field}
											/>
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
												onValueChange={handleProviderChange}
												defaultValue={field.value}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a destination type" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectGroup>
														<SelectLabel>Destination Types</SelectLabel>
														{RCLONE_DESTINATION_PROVIDERS.map((provider) => (
															<SelectItem
																key={provider.key}
																value={provider.key}
															>
																{provider.name}
															</SelectItem>
														))}
													</SelectGroup>
													<SelectGroup>
														<SelectLabel>S3 Compatible Providers</SelectLabel>
														{S3_PROVIDERS.map((s3Provider) => (
															<SelectItem
																key={s3Provider.key}
																value={s3Provider.key}
															>
																{s3Provider.name}
															</SelectItem>
														))}
													</SelectGroup>
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
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>{fieldLabels.accessKeyLabel}</FormLabel>
										<FormControl>
											<Input
												placeholder={fieldLabels.accessKeyPlaceholder}
												{...field}
											/>
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
										<FormLabel>{fieldLabels.secretLabel}</FormLabel>
									</div>
									<FormControl>
										<Input
											placeholder={fieldLabels.secretPlaceholder}
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
									<div className="space-y-0.5">
										<FormLabel>{fieldLabels.bucketLabel}</FormLabel>
									</div>
									<FormControl>
										<Input
											placeholder={fieldLabels.bucketPlaceholder}
											{...field}
										/>
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
										<FormLabel>{fieldLabels.regionLabel}</FormLabel>
									</div>
									<FormControl>
										<Input
											placeholder={fieldLabels.regionPlaceholder}
											{...field}
										/>
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
									<FormLabel>{fieldLabels.endpointLabel}</FormLabel>
									<FormControl>
										{selectedProviderType === "drive" ||
										selectedProviderType === "onedrive" ? (
											<Textarea
												className="min-h-24 font-mono text-xs"
												placeholder={fieldLabels.endpointPlaceholder}
												{...field}
											/>
										) : (
											<Input
												placeholder={fieldLabels.endpointPlaceholder}
												{...field}
											/>
										)}
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
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
														placeholder={fieldLabels.additionalFlagPlaceholder}
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
