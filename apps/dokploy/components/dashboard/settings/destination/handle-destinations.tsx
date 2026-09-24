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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { S3_PROVIDERS } from "./constants";

const RCLONE_CONFIG_PROVIDER = "RcloneConfig";

const addDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: z.string().min(1, "Provider is required"),
	accessKeyId: z.string(),
	secretAccessKey: z.string(),
	bucket: z.string().min(1, "Bucket is required"),
	region: z.string(),
	endpoint: z.string().min(1, "Endpoint is required"),
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
}).superRefine((data, ctx) => {
	if (data.provider === RCLONE_CONFIG_PROVIDER) return;
	if (!data.accessKeyId) {
		ctx.addIssue({ code: "custom", path: ["accessKeyId"], message: "Access Key Id is required" });
	}
	if (!data.secretAccessKey) {
		ctx.addIssue({ code: "custom", path: ["secretAccessKey"], message: "Secret Access Key is required" });
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

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "additionalFlags",
	});
	const isGenericRclone =
		form.watch("provider") === RCLONE_CONFIG_PROVIDER;

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
			accessKey: data.provider === RCLONE_CONFIG_PROVIDER ? "" : data.accessKeyId,
			bucket: data.bucket,
			endpoint: data.endpoint,
			name: data.name,
			region: data.provider === RCLONE_CONFIG_PROVIDER ? "" : data.region,
			secretAccessKey:
				data.provider === RCLONE_CONFIG_PROVIDER ? "" : data.secretAccessKey,
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
		const result = await form.trigger([
			"provider",
			"accessKeyId",
			"secretAccessKey",
			"bucket",
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
		const accessKey = isGenericRclone ? "" : form.getValues("accessKeyId");
		const secretKey = isGenericRclone ? "" : form.getValues("secretAccessKey");
		const bucket = form.getValues("bucket");
		const endpoint = form.getValues("endpoint");
		const region = isGenericRclone ? "" : form.getValues("region");

		const connectionString = isGenericRclone
			? `--config=${endpoint} ${bucket}`
			: `:s3,provider=${provider},access_key_id=${accessKey},secret_access_key=${secretKey},endpoint=${endpoint}${region ? `,region=${region}` : ""}:${bucket}`;

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
														<SelectValue placeholder="Select a backup provider" />
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
													<SelectItem value={RCLONE_CONFIG_PROVIDER}>
														Rclone config (Google Drive, OneDrive, FTP, SFTP, etc.)
													</SelectItem>
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
										<FormLabel>{isGenericRclone ? "Access Key Id (not used)" : "Access Key Id"}</FormLabel>
										<FormControl>
											<Input
											placeholder={isGenericRclone ? "Not required" : "xcas41dasde"}
											disabled={isGenericRclone}
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
										<FormLabel>
											{isGenericRclone ? "Secret Access Key (not used)" : "Secret Access Key"}
										</FormLabel>
									</div>
									<FormControl>
										<Input
										placeholder={isGenericRclone ? "Not required" : "asd123asdasw"}
										disabled={isGenericRclone}
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
										<FormLabel>{isGenericRclone ? "Rclone Remote" : "Bucket"}</FormLabel>
									</div>
									<FormControl>
										<Input
										placeholder={isGenericRclone ? "gdrive:dokploy-backups" : "dokploy-bucket"}
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
										<FormLabel>{isGenericRclone ? "Region (not used)" : "Region"}</FormLabel>
									</div>
									<FormControl>
										<Input
										placeholder={isGenericRclone ? "Not required" : "us-east-1"}
										disabled={isGenericRclone}
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
									<FormLabel>{isGenericRclone ? "Rclone Config Path" : "Endpoint"}</FormLabel>
									<FormControl>
										<Input
											placeholder={
											isGenericRclone
												? "/etc/dokploy/rclone.conf"
												: "https://us.bucket.aws/s3"
										}
											{...field}
										/>
									</FormControl>
									<FormMessage />
									{isGenericRclone && (
										<p className="text-xs text-muted-foreground">
											The rclone config path and named remote must exist on every execution host that can run this backup, including a selected resource server. Connection testing runs on the selected server when one is chosen; otherwise it runs in Dokploy&apos;s local execution environment.
										</p>
									)}
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
