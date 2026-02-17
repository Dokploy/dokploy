import { zodResolver } from "@hookform/resolvers/zod";
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
	destinationType: z.enum(["s3", "sftp", "rclone"]).default("s3"),
	// S3 fields
	provider: z.string().optional(),
	accessKeyId: z.string().optional(),
	secretAccessKey: z.string().optional(),
	bucket: z.string().optional(),
	region: z.string().optional(),
	endpoint: z.string().optional(),
	// SFTP fields
	sftpHost: z.string().optional(),
	sftpPort: z.number().optional(),
	sftpUsername: z.string().optional(),
	sftpPassword: z.string().optional(),
	sftpKeyPath: z.string().optional(),
	sftpRemotePath: z.string().optional(),
	// Rclone fields
	rcloneConfig: z.string().optional(),
	rcloneRemoteName: z.string().optional(),
	rcloneRemotePath: z.string().optional(),
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

	const { mutateAsync, isError, error, isLoading } = destinationId
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
		isLoading: isLoadingConnection,
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
			sftpHost: "",
			sftpPort: 22,
			sftpUsername: "",
			sftpPassword: "",
			sftpKeyPath: "",
			sftpRemotePath: "/backups",
			rcloneConfig: "",
			rcloneRemoteName: "",
			rcloneRemotePath: "",
		},
		resolver: zodResolver(addDestination),
	});

	const destinationType = form.watch("destinationType");

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
				sftpHost: destination.sftpHost || "",
				sftpPort: destination.sftpPort || 22,
				sftpUsername: destination.sftpUsername || "",
				sftpPassword: destination.sftpPassword || "",
				sftpKeyPath: destination.sftpKeyPath || "",
				sftpRemotePath: destination.sftpRemotePath || "/backups",
				rcloneConfig: destination.rcloneConfig || "",
				rcloneRemoteName: destination.rcloneRemoteName || "",
				rcloneRemotePath: destination.rcloneRemotePath || "",
			});
		} else {
			form.reset();
		}
	}, [form, form.reset, form.formState.isSubmitSuccessful, destination]);

	const onSubmit = async (data: AddDestination) => {
		await mutateAsync({
			destinationType: data.destinationType || "s3",
			provider: data.provider || "",
			accessKey: data.accessKeyId || "",
			bucket: data.bucket || "",
			endpoint: data.endpoint || "",
			name: data.name,
			region: data.region || "",
			secretAccessKey: data.secretAccessKey || "",
			destinationId: destinationId || "",
			sftpHost: data.sftpHost || undefined,
			sftpPort: data.sftpPort || undefined,
			sftpUsername: data.sftpUsername || undefined,
			sftpPassword: data.sftpPassword || undefined,
			sftpKeyPath: data.sftpKeyPath || undefined,
			sftpRemotePath: data.sftpRemotePath || undefined,
			rcloneConfig: data.rcloneConfig || undefined,
			rcloneRemoteName: data.rcloneRemoteName || undefined,
			rcloneRemotePath: data.rcloneRemotePath || undefined,
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
		} else if (destType === "sftp") {
			const result = await form.trigger(["sftpHost", "sftpUsername"]);
			if (!result) {
				toast.error("Please fill host and username");
				return;
			}
		} else if (destType === "rclone") {
			const result = await form.trigger(["rcloneConfig", "rcloneRemoteName"]);
			if (!result) {
				toast.error("Please fill rclone config and remote name");
				return;
			}
		}

		if (isCloud && !serverId) {
			toast.error("Please select a server");
			return;
		}

		await testConnection({
			destinationType: destType,
			provider: form.getValues("provider") || "",
			accessKey: form.getValues("accessKeyId") || "",
			bucket: form.getValues("bucket") || "",
			endpoint: form.getValues("endpoint") || "",
			name: "Test",
			region: form.getValues("region") || "",
			secretAccessKey: form.getValues("secretAccessKey") || "",
			sftpHost: form.getValues("sftpHost") || undefined,
			sftpPort: form.getValues("sftpPort") || undefined,
			sftpUsername: form.getValues("sftpUsername") || undefined,
			sftpPassword: form.getValues("sftpPassword") || undefined,
			sftpKeyPath: form.getValues("sftpKeyPath") || undefined,
			sftpRemotePath: form.getValues("sftpRemotePath") || undefined,
			rcloneConfig: form.getValues("rcloneConfig") || undefined,
			rcloneRemoteName: form.getValues("rcloneRemoteName") || undefined,
			rcloneRemotePath: form.getValues("rcloneRemotePath") || undefined,
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
						SFTP servers, or use a custom rclone configuration for providers
						like Google Drive, OneDrive, Azure Blob, FTP, and more.
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
															{dt.name}
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

						{/* S3 Fields */}
						{destinationType === "s3" && (
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

						{/* SFTP Fields */}
						{destinationType === "sftp" && (
							<>
								<FormField
									control={form.control}
									name="sftpHost"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input
													placeholder={"backup.example.com"}
													{...field}
												/>
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
											<FormLabel>Port</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={"22"}
													{...field}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number.parseInt(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="sftpUsername"
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
									name="sftpPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password (optional if using key)</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder={"Leave empty for key-based auth"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="sftpKeyPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												SSH Key Path (optional if using password)
											</FormLabel>
											<FormControl>
												<Input
													placeholder={"/root/.ssh/id_rsa"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="sftpRemotePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Path</FormLabel>
											<FormControl>
												<Input placeholder={"/backups"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{/* Rclone Custom Fields */}
						{destinationType === "rclone" && (
							<>
								<FormField
									control={form.control}
									name="rcloneConfig"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Rclone Configuration</FormLabel>
											<FormControl>
												<Textarea
													rows={8}
													className="font-mono text-xs"
													placeholder={`[myremote]\ntype = drive\nclient_id = xxx\nclient_secret = xxx\ntoken = {"access_token":"xxx"}`}
													{...field}
												/>
											</FormControl>
											<FormMessage />
											<p className="text-xs text-muted-foreground">
												Paste your rclone config here. You can generate one
												with <code>rclone config</code> on your machine, then
												copy the content from <code>~/.config/rclone/rclone.conf</code>.
												This supports Google Drive, OneDrive, Azure Blob, FTP,
												and 50+ other providers.
											</p>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rcloneRemoteName"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Name</FormLabel>
											<FormControl>
												<Input
													placeholder={"myremote"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
											<p className="text-xs text-muted-foreground">
												The name inside the square brackets of your rclone
												config (e.g., <code>[myremote]</code> means the name is{" "}
												<code>myremote</code>).
											</p>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rcloneRemotePath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Remote Path</FormLabel>
											<FormControl>
												<Input
													placeholder={"dokploy-backups"}
													{...field}
												/>
											</FormControl>
											<FormMessage />
											<p className="text-xs text-muted-foreground">
												The folder/path on the remote where backups will be
												stored.
											</p>
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
									isLoading={isLoadingConnection}
									onClick={async () => {
										await handleTestConnection(form.getValues("serverId"));
									}}
								>
									Test Connection
								</Button>
							</div>
						) : (
							<Button
								isLoading={isLoadingConnection}
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
							isLoading={isLoading}
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
