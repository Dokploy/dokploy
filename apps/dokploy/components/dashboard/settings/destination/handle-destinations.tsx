import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
	parseAzureConnectionString,
} from "@dokploy/server/db/validations/destination";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	Cloud,
	Database,
	Eye,
	EyeOff,
	PenBoxIcon,
	PlusIcon,
	Trash2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { S3_PROVIDERS } from "./constants";

const destinationFormSchema = z
	.object({
		destinationType: z.enum(["s3", "azure_blob"]),
		name: z.string().min(1, "Name is required"),
		provider: z.string(),
		accessKeyId: z.string(),
		secretAccessKey: z.string().min(1, "Secret key / credential is required"),
		bucket: z.string().min(1, "Bucket or Container name is required"),
		region: z.string().optional(),
		endpoint: z.string().optional(),
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
		if (data.destinationType === "s3") {
			if (!data.provider || data.provider.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Provider is required for S3",
					path: ["provider"],
				});
			}
			if (!data.accessKeyId || data.accessKeyId.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Access Key ID is required for S3",
					path: ["accessKeyId"],
				});
			}
			if (!data.endpoint || data.endpoint.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Endpoint is required for S3",
					path: ["endpoint"],
				});
			}
		} else if (data.destinationType === "azure_blob") {
			if (data.provider === "account_key") {
				if (!data.accessKeyId || data.accessKeyId.trim().length === 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Storage Account Name is required when using Account Key",
						path: ["accessKeyId"],
					});
				}
			}
		}
	});

type DestinationFormData = z.infer<typeof destinationFormSchema>;

interface Props {
	destinationId?: string;
}

export const HandleDestinations = ({ destinationId }: Props) => {
	const [open, setOpen] = useState(false);
	const [showSecret, setShowSecret] = useState(false);
	const [rawConnectionString, setRawConnectionString] = useState("");
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

	const form = useForm<DestinationFormData>({
		defaultValues: {
			destinationType: "s3",
			name: "",
			provider: "AWS",
			accessKeyId: "",
			secretAccessKey: "",
			bucket: "",
			region: "us-east-1",
			endpoint: "",
			additionalFlags: [],
		},
		resolver: zodResolver(destinationFormSchema),
	});

	const destinationType = form.watch("destinationType");
	const isAzure = destinationType === "azure_blob";

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "additionalFlags",
	});

	useEffect(() => {
		if (destination) {
			const isDestAzure =
				destination.destinationType === "azure_blob" ||
				destination.destinationType === "az_bs";

			form.reset({
				destinationType: isDestAzure ? "azure_blob" : "s3",
				name: destination.name,
				provider: destination.provider || (isDestAzure ? "account_key" : "AWS"),
				accessKeyId: destination.accessKey || "",
				secretAccessKey: destination.secretAccessKey,
				bucket: destination.bucket,
				region: destination.region || "",
				endpoint: destination.endpoint || "",
				additionalFlags:
					destination.additionalFlags?.map((f) => ({ value: f })) ?? [],
			});
		} else {
			form.reset({
				destinationType: "s3",
				name: "",
				provider: "AWS",
				accessKeyId: "",
				secretAccessKey: "",
				bucket: "",
				region: "us-east-1",
				endpoint: "",
				additionalFlags: [],
			});
		}
		setRawConnectionString("");
		setShowSecret(false);
	}, [form, destination, open]);

	const handlePasteConnectionString = (raw: string) => {
		setRawConnectionString(raw);
		const parsed = parseAzureConnectionString(raw);
		if (parsed.accountName) {
			form.setValue("accessKeyId", parsed.accountName, {
				shouldValidate: true,
			});
		}
		if (parsed.accountKey) {
			form.setValue("secretAccessKey", parsed.accountKey, {
				shouldValidate: true,
			});
		}
		if (parsed.endpoint) {
			form.setValue("endpoint", parsed.endpoint, { shouldValidate: true });
		}
		if (parsed.accountName || parsed.accountKey) {
			toast.success("Azure Connection String parsed successfully!");
		}
	};

	const onSubmit = async (data: DestinationFormData) => {
		await mutateAsync({
			destinationType: data.destinationType,
			name: data.name,
			provider:
				data.provider ||
				(data.destinationType === "azure_blob" ? "account_key" : "AWS"),
			accessKey: data.accessKeyId || "",
			secretAccessKey: data.secretAccessKey,
			bucket: data.bucket,
			region: data.region || "",
			endpoint: data.endpoint || "",
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
		const triggerFields: Array<keyof DestinationFormData> = isAzure
			? ["name", "bucket", "secretAccessKey"]
			: ["provider", "accessKeyId", "secretAccessKey", "bucket", "endpoint"];

		if (isAzure && form.getValues("provider") === "account_key") {
			triggerFields.push("accessKeyId");
		}

		const result = await form.trigger(triggerFields);

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

		const currentVals = form.getValues();

		await testConnection({
			destinationType: currentVals.destinationType,
			provider: currentVals.provider || (isAzure ? "account_key" : "AWS"),
			accessKey: currentVals.accessKeyId || "",
			secretAccessKey: currentVals.secretAccessKey,
			bucket: currentVals.bucket,
			endpoint: currentVals.endpoint || "",
			name: currentVals.name || "Test",
			region: currentVals.region || "",
			serverId,
			additionalFlags: currentVals.additionalFlags?.map((f) => f.value) ?? [],
		})
			.then(() => {
				toast.success("Connection test successful! Target storage verified.");
			})
			.catch((e) => {
				toast.error("Error connecting to storage destination", {
					description: e.message,
				});
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{destinationId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 h-8 w-8"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-2">
						<PlusIcon className="h-4 w-4" />
						<span>Add Destination</span>
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{destinationId ? "Update" : "Add"} Backup Destination
					</DialogTitle>
					<DialogDescription>
						Configure cloud storage for your backups. Supports Amazon S3 (and
						S3-compatible providers) and Microsoft Azure Blob Storage.
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
						{/* Provider Type Segmented Selector */}
						<div className="flex flex-col gap-1.5">
							<FormLabel>Storage Type</FormLabel>
							<div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
								<button
									type="button"
									onClick={() => {
										form.setValue("destinationType", "s3");
										if (
											form.getValues("provider") === "account_key" ||
											form.getValues("provider") === "sas_url"
										) {
											form.setValue("provider", "AWS");
										}
									}}
									className={cn(
										"flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors",
										!isAzure
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<Database className="size-4 text-amber-500" />
									S3 / S3-Compatible
								</button>
								<button
									type="button"
									onClick={() => {
										form.setValue("destinationType", "azure_blob");
										if (
											!form.getValues("provider") ||
											form.getValues("provider") === "AWS"
										) {
											form.setValue("provider", "account_key");
										}
									}}
									className={cn(
										"flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors",
										isAzure
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<Cloud className="size-4 text-blue-500" />
									Azure Blob Storage
								</button>
							</div>
						</div>

						{/* Common: Destination Name */}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination Name</FormLabel>
									<FormControl>
										<Input
											placeholder={
												isAzure
													? "e.g. Azure Production Backups"
													: "e.g. AWS S3 Production"
											}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* AZURE BLOB STORAGE FIELDS */}
						{isAzure ? (
							<>
								<FormField
									control={form.control}
									name="provider"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Authentication Method</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value || "account_key"}
												value={field.value || "account_key"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select Auth Method" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="account_key">
														Storage Account Name & Key (Recommended)
													</SelectItem>
													<SelectItem value="sas_url">
														Shared Access Signature (SAS URL)
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								{form.watch("provider") === "account_key" && (
									<div className="flex flex-col gap-1.5 p-3 rounded-lg border border-dashed bg-muted/40">
										<div className="flex items-center justify-between">
											<span className="text-xs font-medium text-foreground">
												Quick Paste: Azure Connection String
											</span>
											<span className="text-[11px] text-muted-foreground">
												Auto-populates Account & Key
											</span>
										</div>
										<Input
											placeholder="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;"
											value={rawConnectionString}
											onChange={(e) =>
												handlePasteConnectionString(e.target.value)
											}
											className="text-xs h-8 font-mono"
										/>
									</div>
								)}

								{form.watch("provider") === "account_key" ? (
									<>
										<FormField
											control={form.control}
											name="accessKeyId"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Storage Account Name</FormLabel>
													<FormControl>
														<Input
															placeholder="e.g. mystorageaccount"
															{...field}
														/>
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
													<FormLabel>Storage Account Key</FormLabel>
													<div className="relative">
														<FormControl>
															<Input
																type={showSecret ? "text" : "password"}
																placeholder="Shared Access Key"
																className="pr-10"
																{...field}
															/>
														</FormControl>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
															onClick={() => setShowSecret(!showSecret)}
														>
															{showSecret ? (
																<EyeOff className="size-4 text-muted-foreground" />
															) : (
																<Eye className="size-4 text-muted-foreground" />
															)}
														</Button>
													</div>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								) : (
									<FormField
										control={form.control}
										name="secretAccessKey"
										render={({ field }) => (
											<FormItem>
												<FormLabel>SAS URL</FormLabel>
												<FormControl>
													<Input
														placeholder="https://mystorageaccount.blob.core.windows.net/?sv=...&sig=..."
														{...field}
													/>
												</FormControl>
												<FormDescription className="text-xs">
													A Shared Access Signature URL with read, write, and
													list permissions.
												</FormDescription>
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
											<FormLabel>Container Name</FormLabel>
											<FormControl>
												<Input placeholder="dokploy-backups" {...field} />
											</FormControl>
											<FormDescription className="text-xs">
												The Azure Blob container where backup archives are
												stored.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="endpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Custom Endpoint (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="Leave empty for standard Azure (e.g. http://127.0.0.1:10000/devstoreaccount1 for Azurite)"
													{...field}
												/>
											</FormControl>
											<FormDescription className="text-xs">
												Only needed for Sovereign Clouds (Gov/China) or local
												Azurite emulator.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						) : (
							/* S3-COMPATIBLE STORAGE FIELDS */
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
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select an S3 Provider" />
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
											<FormLabel>Access Key ID</FormLabel>
											<FormControl>
												<Input placeholder="AKIA..." {...field} />
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
											<div className="relative">
												<FormControl>
													<Input
														type={showSecret ? "text" : "password"}
														placeholder="Secret access key"
														className="pr-10"
														{...field}
													/>
												</FormControl>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
													onClick={() => setShowSecret(!showSecret)}
												>
													{showSecret ? (
														<EyeOff className="size-4 text-muted-foreground" />
													) : (
														<Eye className="size-4 text-muted-foreground" />
													)}
												</Button>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="bucket"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Bucket Name</FormLabel>
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
											<FormLabel>Endpoint URL</FormLabel>
											<FormControl>
												<Input
													placeholder="https://s3.amazonaws.com"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* COMMON: Additional Flags */}
						<div className="flex flex-col gap-2 pt-2 border-t">
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
														placeholder={
															isAzure
																? "--azureblob-access-tier=cool"
																: "--s3-sign-accept-encoding=false"
														}
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
							"flex w-full justify-between! gap-4 pt-4 border-t",
						)}
					>
						{isCloud ? (
							<div className="flex flex-col gap-4 border p-2 rounded-lg w-full">
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
								Test Connection
							</Button>
						)}

						<Button
							isLoading={isPending}
							form="hook-form-destination-add"
							type="submit"
						>
							{destinationId ? "Update Destination" : "Create Destination"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
