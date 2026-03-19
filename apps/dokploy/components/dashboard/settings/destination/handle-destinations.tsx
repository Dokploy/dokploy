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

const DESTINATION_TYPES = [
	{ key: "s3", label: "S3 / S3-Compatible" },
	{ key: "sftp", label: "SFTP" },
	{ key: "ftp", label: "FTP" },
] as const;

type DestinationTypeKey = (typeof DESTINATION_TYPES)[number]["key"];

/**
 * Flat schema for the form – all fields are optional at the schema level; we
 * apply conditional validation via superRefine based on the destinationType.
 */
const addDestination = z
	.object({
		name: z.string().min(1, "Name is required"),
		destinationType: z.enum(["s3", "sftp", "ftp"] as const),
		// S3
		provider: z.string().optional(),
		accessKeyId: z.string().optional(),
		secretAccessKey: z.string().optional(),
		bucket: z.string().optional(),
		region: z.string().optional(),
		endpoint: z.string().optional(),
		// SFTP / FTP
		host: z.string().optional(),
		port: z.string().optional(),
		username: z.string().optional(),
		password: z.string().optional(),
		/** Remote base path for SFTP/FTP destinations (maps to `bucket` column). */
		remotePath: z.string().optional(),
		// Cloud
		serverId: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.destinationType === "s3") {
			if (!data.accessKeyId)
				ctx.addIssue({
					code: "custom",
					message: "Access Key is required",
					path: ["accessKeyId"],
				});
			if (!data.secretAccessKey)
				ctx.addIssue({
					code: "custom",
					message: "Secret Access Key is required",
					path: ["secretAccessKey"],
				});
			if (!data.bucket)
				ctx.addIssue({
					code: "custom",
					message: "Bucket is required",
					path: ["bucket"],
				});
			if (!data.endpoint)
				ctx.addIssue({
					code: "custom",
					message: "Endpoint is required",
					path: ["endpoint"],
				});
		} else {
			if (!data.host)
				ctx.addIssue({
					code: "custom",
					message: "Host is required",
					path: ["host"],
				});
			if (!data.username)
				ctx.addIssue({
					code: "custom",
					message: "Username is required",
					path: ["username"],
				});
			if (!data.password)
				ctx.addIssue({
					code: "custom",
					message: "Password is required",
					path: ["password"],
				});
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

	const { mutateAsync: createDestination, isPending: isCreating } =
		api.destination.create.useMutation();
	const { mutateAsync: updateDestination, isPending: isUpdating } =
		api.destination.update.useMutation();

	const isPending = isCreating || isUpdating;

	const [formError, setFormError] = useState<string | null>(null);

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
			host: "",
			port: "",
			username: "",
			password: "",
			remotePath: "",
		},
		resolver: zodResolver(addDestination),
	});

	const destinationType = form.watch("destinationType") as DestinationTypeKey;

	useEffect(() => {
		if (destination) {
			const type =
				(destination.destinationType as DestinationTypeKey | null) ?? "s3";
			form.reset({
				name: destination.name,
				destinationType: type,
				// S3
				provider: destination.provider ?? "",
				accessKeyId: destination.accessKey ?? "",
				secretAccessKey: destination.secretAccessKey ?? "",
				bucket: destination.bucket ?? "",
				region: destination.region ?? "",
				endpoint: destination.endpoint ?? "",
				// SFTP / FTP
				host: destination.host ?? "",
				port: destination.port ?? "",
				username: destination.username ?? "",
				password: destination.password ?? "",
				remotePath: type !== "s3" ? (destination.bucket ?? "") : "",
			});
		} else {
			form.reset({
				destinationType: "s3",
				provider: "",
				accessKeyId: "",
				bucket: "",
				name: "",
				region: "",
				secretAccessKey: "",
				endpoint: "",
				host: "",
				port: "",
				username: "",
				password: "",
				remotePath: "",
			});
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const buildPayload = (data: AddDestination) => {
		const common = { name: data.name };
		if (data.destinationType === "s3") {
			return {
				...common,
				destinationType: "s3" as const,
				provider: data.provider ?? "",
				accessKey: data.accessKeyId ?? "",
				bucket: data.bucket ?? "",
				endpoint: data.endpoint ?? "",
				region: data.region ?? "",
				secretAccessKey: data.secretAccessKey ?? "",
				serverId: data.serverId,
			};
		}
		if (data.destinationType === "sftp") {
			return {
				...common,
				destinationType: "sftp" as const,
				host: data.host ?? "",
				port: data.port ?? "",
				username: data.username ?? "",
				password: data.password ?? "",
				// remotePath maps to the `bucket` column for SFTP/FTP
				bucket: data.remotePath ?? "",
				serverId: data.serverId,
			};
		}
		return {
			...common,
			destinationType: "ftp" as const,
			host: data.host ?? "",
			port: data.port ?? "",
			username: data.username ?? "",
			password: data.password ?? "",
			// remotePath maps to the `bucket` column for FTP
			bucket: data.remotePath ?? "",
			serverId: data.serverId,
		};
	};

	const onSubmit = async (data: AddDestination) => {
		setFormError(null);
		try {
			const payload = buildPayload(data);
			if (destinationId) {
				await updateDestination({ ...payload, destinationId });
			} else {
				await createDestination(payload);
			}
			toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
			await utils.destination.all.invalidate();
			if (destinationId) {
				await utils.destination.one.invalidate({ destinationId });
			}
			setOpen(false);
		} catch (e) {
			const msg =
				e instanceof Error
					? e.message
					: `Error ${destinationId ? "updating" : "creating"} the Destination`;
			setFormError(msg);
			toast.error(msg);
		}
	};

	const handleTestConnection = async (serverId?: string) => {
		const type = form.getValues("destinationType");
		const fieldsToValidate: (keyof AddDestination)[] =
			type === "s3"
				? ["provider", "accessKeyId", "secretAccessKey", "bucket", "endpoint"]
				: ["host", "username", "password"];

		const result = await form.trigger(fieldsToValidate);

		if (!result) {
			const errors = form.formState.errors;
			const errorFields = Object.entries(errors)
				.map(
					([field, error]) =>
						`${field}: ${(error as { message?: string })?.message}`,
				)
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

		const name = form.getValues("name") || "Test";
		const payload = buildPayload({ ...form.getValues(), name, serverId });

		await testConnection(payload)
			.then(() => {
				toast.success("Connection Success");
			})
			.catch((e) => {
				toast.error("Error connecting to destination", {
					description: e.message,
				});
			});
	};

	const isS3 = destinationType === "s3";
	const isSftpOrFtp = destinationType === "sftp" || destinationType === "ftp";
	const isError = !!formError || isErrorConnection;

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
				{isError && (
					<AlertBlock type="error" className="w-full">
						{connectionError?.message || formError}
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

						{/* Destination Type selector */}
						<FormField
							control={form.control}
							name="destinationType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination Type</FormLabel>
									<FormControl>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a destination type" />
											</SelectTrigger>
											<SelectContent>
												{DESTINATION_TYPES.map((dt) => (
													<SelectItem key={dt.key} value={dt.key}>
														{dt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* ── S3-specific fields ─────────────────────────────────── */}
						{isS3 && (
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
														<SelectTrigger>
															<SelectValue placeholder="Select a S3 Provider" />
														</SelectTrigger>
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

						{/* ── SFTP / FTP fields ──────────────────────────────────── */}
						{isSftpOrFtp && (
							<>
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input placeholder={"sftp.example.com"} {...field} />
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
											<FormLabel>
												Port{" "}
												<span className="text-muted-foreground">
													(default: {destinationType === "sftp" ? "22" : "21"})
												</span>
											</FormLabel>
											<FormControl>
												<Input
													placeholder={destinationType === "sftp" ? "22" : "21"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="username"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Username</FormLabel>
											<FormControl>
												<Input placeholder={"backup-user"} {...field} />
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
									name="remotePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Remote Path{" "}
												<span className="text-muted-foreground">
													(optional)
												</span>
											</FormLabel>
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
