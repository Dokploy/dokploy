import { zodResolver } from "@hookform/resolvers/zod";
import {
	ExternalLink,
	KeyRound,
	PenBoxIcon,
	PlusIcon,
	RefreshCw,
	Shield,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { S3_PROVIDERS } from "./constants";

// Rclone crypt filename encryption options
const FILENAME_ENCRYPTION_OPTIONS = [
	{
		key: "off",
		name: "Off",
		description: "Don't encrypt filenames (recommended for easier management)",
	},
	{
		key: "standard",
		name: "Standard",
		description: "Encrypt filenames using EME encryption",
	},
	{
		key: "obfuscate",
		name: "Obfuscate",
		description: "Simple filename obfuscation (not secure, but hides names)",
	},
] as const;

const addDestination = z
	.object({
		name: z.string().min(1, "Name is required"),
		provider: z.string().min(1, "Provider is required"),
		accessKeyId: z.string().min(1, "Access Key Id is required"),
		secretAccessKey: z.string().min(1, "Secret Access Key is required"),
		bucket: z.string().min(1, "Bucket is required"),
		region: z.string(),
		endpoint: z.string().min(1, "Endpoint is required"),
		serverId: z.string().optional(),
		// Encryption settings (rclone crypt)
		encryptionEnabled: z.boolean().optional(),
		encryptionKey: z.string().optional(),
		encryptionPassword2: z.string().optional(),
		filenameEncryption: z.enum(["standard", "obfuscate", "off"]).optional(),
		directoryNameEncryption: z.boolean().optional(),
	})
	.refine(
		(data) => {
			if (data.encryptionEnabled) {
				return !!data.encryptionKey;
			}
			return true;
		},
		{
			message: "Encryption key is required when encryption is enabled",
			path: ["encryptionKey"],
		},
	);

type AddDestination = z.infer<typeof addDestination>;

const generateEncryptionKey = (): string => {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
};

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
			provider: "",
			accessKeyId: "",
			bucket: "",
			name: "",
			region: "",
			secretAccessKey: "",
			endpoint: "",
			encryptionEnabled: false,
			encryptionKey: "",
			encryptionPassword2: "",
			filenameEncryption: "off",
			directoryNameEncryption: false,
		},
		resolver: zodResolver(addDestination),
	});

	const encryptionEnabled = form.watch("encryptionEnabled");
	const filenameEncryption = form.watch("filenameEncryption");

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
				encryptionEnabled: destination.encryptionEnabled ?? false,
				encryptionKey: destination.encryptionKey ?? "",
				encryptionPassword2: destination.encryptionPassword2 ?? "",
				filenameEncryption:
					(destination.filenameEncryption as "standard" | "obfuscate" | "off") ??
					"off",
				directoryNameEncryption: destination.directoryNameEncryption ?? false,
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
			encryptionEnabled: data.encryptionEnabled,
			encryptionKey: data.encryptionKey,
			encryptionPassword2: data.encryptionPassword2,
			filenameEncryption: data.filenameEncryption,
			directoryNameEncryption: data.directoryNameEncryption,
		})
			.then(async () => {
				toast.success(`Destination ${destinationId ? "Updated" : "Created"}`);
				await utils.destination.all.invalidate();
				setOpen(false);
			})
			.catch(() => {
				toast.error(
					`Error ${destinationId ? "Updating" : "Creating"} the Destination`,
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

		const connectionString = `:s3,provider=${provider},access_key_id=${accessKey},secret_access_key=${secretKey},endpoint=${endpoint}${region ? `,region=${region}` : ""}:${bucket}`;

		await testConnection({
			provider,
			accessKey,
			bucket,
			endpoint,
			name: "Test",
			region,
			secretAccessKey: secretKey,
			serverId,
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

						{/* Encryption Settings - Rclone Crypt */}
						<div className="space-y-4 rounded-lg border p-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Shield className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm font-medium">
										Backup Encryption (At Rest)
									</span>
								</div>
								<a
									href="https://rclone.org/crypt/"
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
								>
									<ExternalLink className="h-3 w-3" />
									Rclone Crypt Docs
								</a>
							</div>

							<FormField
								control={form.control}
								name="encryptionEnabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
										<div className="space-y-0.5">
											<FormLabel>Enable Encryption</FormLabel>
											<FormDescription>
												Encrypt backups using NaCl SecretBox (XSalsa20 +
												Poly1305)
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>

							{encryptionEnabled && (
								<>
									{/* Main Password */}
									<FormField
										control={form.control}
										name="encryptionKey"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Password (Required)</FormLabel>
												<div className="flex gap-2">
													<FormControl>
														<Input
															type="password"
															placeholder="Enter or generate a password"
															{...field}
														/>
													</FormControl>
													<Button
														type="button"
														variant="outline"
														size="icon"
														onClick={() => {
															const key = generateEncryptionKey();
															form.setValue("encryptionKey", key);
															toast.success("Password generated", {
																description:
																	"Make sure to save this password securely.",
															});
														}}
													>
														<RefreshCw className="h-4 w-4" />
													</Button>
												</div>
												<FormDescription>
													<KeyRound className="mr-1 inline h-3 w-3" />
													Main encryption password. Store securely - lost
													passwords cannot be recovered.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									{/* Salt Password (Password2) */}
									<FormField
										control={form.control}
										name="encryptionPassword2"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Salt Password (Recommended)</FormLabel>
												<div className="flex gap-2">
													<FormControl>
														<Input
															type="password"
															placeholder="Optional but recommended"
															{...field}
														/>
													</FormControl>
													<Button
														type="button"
														variant="outline"
														size="icon"
														onClick={() => {
															const key = generateEncryptionKey();
															form.setValue("encryptionPassword2", key);
															toast.success("Salt password generated", {
																description:
																	"Make sure to save this password securely.",
															});
														}}
													>
														<RefreshCw className="h-4 w-4" />
													</Button>
												</div>
												<FormDescription>
													Additional salt for extra security. Should be
													different from the main password.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									{/* Filename Encryption */}
									<FormField
										control={form.control}
										name="filenameEncryption"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Filename Encryption</FormLabel>
												<FormControl>
													<Select
														onValueChange={field.onChange}
														value={field.value}
													>
														<SelectTrigger>
															<SelectValue placeholder="Select filename encryption" />
														</SelectTrigger>
														<SelectContent>
															{FILENAME_ENCRYPTION_OPTIONS.map((option) => (
																<SelectItem
																	key={option.key}
																	value={option.key}
																>
																	<div className="flex flex-col">
																		<span>{option.name}</span>
																		<span className="text-xs text-muted-foreground">
																			{option.description}
																		</span>
																	</div>
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</FormControl>
												<FormDescription>
													Choose how backup filenames should be encrypted.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>

									{/* Directory Name Encryption (only shown when filename encryption is not off) */}
									{filenameEncryption && filenameEncryption !== "off" && (
										<FormField
											control={form.control}
											name="directoryNameEncryption"
											render={({ field }) => (
												<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
													<div className="space-y-0.5">
														<FormLabel>Encrypt Directory Names</FormLabel>
														<FormDescription>
															Also encrypt directory/folder names
														</FormDescription>
													</div>
													<FormControl>
														<Switch
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
												</FormItem>
											)}
										/>
									)}
								</>
							)}
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
