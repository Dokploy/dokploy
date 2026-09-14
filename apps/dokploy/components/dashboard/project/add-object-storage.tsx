import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { AlertTriangle, Boxes, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	AlarikIcon,
	GarageIcon,
	MinioIcon,
} from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { slugify } from "@/lib/slug";
import { api } from "@/utils/api";
import { APP_NAME_MESSAGE, APP_NAME_REGEX } from "@/utils/schema";

const objectStorageSchema = z.object({
	name: z.string().min(1, "Name required"),
	appName: z
		.string()
		.min(1, {
			message: "App name is required",
		})
		.regex(APP_NAME_REGEX, {
			message: APP_NAME_MESSAGE,
		}),
	provider: z.enum(["minio", "garage", "alarik"]),
	rootUser: z.string().min(1, "Root user required"),
	rootPassword: z.string().min(1, "Root password required"),
	bucket: z.string().optional(),
	region: z.string().optional(),
	dockerImage: z.string(),
	description: z.string().nullable(),
	serverId: z.string().nullable(),
});

type ObjectStorageForm = z.infer<typeof objectStorageSchema>;

const providersMap = {
	minio: {
		icon: <MinioIcon className="h-10 w-10" />,
		label: "MinIO",
	},
	garage: {
		icon: <GarageIcon className="h-10 w-10" />,
		label: "Garage",
	},
	alarik: {
		icon: <AlarikIcon className="h-10 w-10" />,
		label: "Alarik",
	},
};

const providerDefaults: Record<
	ObjectStorageForm["provider"],
	{
		dockerImage: string;
		rootUser: string;
		bucket: string;
		region: string;
	}
> = {
	minio: {
		dockerImage: "minio/minio",
		rootUser: "minioadmin",
		bucket: "dokploy",
		region: "us-east-1",
	},
	garage: {
		dockerImage: "dxflrs/garage:v2.3.0",
		rootUser: "garage",
		bucket: "dokploy",
		region: "us-east-1",
	},
	alarik: {
		dockerImage: "ghcr.io/achtungsoftware/alarik:latest",
		rootUser: "admin",
		bucket: "dokploy",
		region: "us-east-1",
	},
};

interface Props {
	environmentId: string;
	projectName?: string;
}

export const AddObjectStorage = ({ environmentId, projectName }: Props) => {
	const utils = api.useUtils();
	const [visible, setVisible] = useState(false);
	const slug = slugify(projectName);
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: webServerSettings } =
		api.settings.getWebServerSettings.useQuery();
	const showLocalOption = !isCloud && !webServerSettings?.remoteServersOnly;
	const { data: servers } = api.server.withSSHKey.useQuery();
	const objectStorageMutation = api.objectstorage.create.useMutation();

	const hasServers = servers && servers.length > 0;
	const shouldShowServerDropdown = hasServers;

	const initialDefaults = providerDefaults.minio;

	const form = useForm({
		defaultValues: {
			name: "",
			appName: `${slug}-`,
			provider: "minio",
			rootUser: initialDefaults.rootUser,
			rootPassword: "",
			bucket: initialDefaults.bucket,
			region: initialDefaults.region,
			dockerImage: initialDefaults.dockerImage,
			description: "",
			serverId: null,
		},
		resolver: zodResolver(objectStorageSchema),
	});

	const provider = form.watch("provider");

	useEffect(() => {
		const defaults = providerDefaults[provider];
		if (defaults) {
			form.setValue("rootUser", defaults.rootUser);
			form.setValue("bucket", defaults.bucket);
			form.setValue("region", defaults.region);
			form.setValue("dockerImage", defaults.dockerImage);
		}
	}, [provider, form]);

	const onSubmit = async (data: ObjectStorageForm) => {
		const defaults = providerDefaults[data.provider];

		await objectStorageMutation
			.mutateAsync({
				name: data.name,
				appName: data.appName,
				dockerImage: data.dockerImage || defaults.dockerImage,
				serverId: data.serverId === "dokploy" ? undefined : data.serverId,
				environmentId,
				description: data.description,
				provider: data.provider,
				rootUser: data.rootUser || defaults.rootUser,
				rootPassword: data.rootPassword,
				bucket: data.bucket || defaults.bucket,
				region: data.region || defaults.region,
			})
			.then(async () => {
				toast.success("Object Storage Created");
				form.reset({
					name: "",
					appName: `${slug}-`,
					provider: "minio",
					rootUser: "",
					rootPassword: "",
					bucket: "",
					region: "",
					dockerImage: "",
					description: "",
					serverId: null,
				});
				setVisible(false);
				await utils.environment.one.invalidate({
					environmentId,
				});
			})
			.catch(() => {
				toast.error("Error creating an Object Storage");
			});
	};

	return (
		<Dialog open={visible} onOpenChange={setVisible}>
			<DialogTrigger className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Boxes className="size-4 text-muted-foreground" />
					<span>Object Storage</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="md:max-h-[90vh] sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Object Storage</DialogTitle>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8"
					>
						<FormField
							control={form.control}
							defaultValue={form.control._defaultValues.provider}
							name="provider"
							render={({ field }) => (
								<FormItem className="space-y-3">
									<FormLabel className="text-muted-foreground">
										Select a provider
									</FormLabel>
									<FormControl>
										<RadioGroup
											onValueChange={field.onChange}
											defaultValue={field.value}
											className="grid w-full grid-cols-1 sm:grid-cols-3 gap-4"
										>
											{Object.entries(providersMap).map(([key, value]) => (
												<FormItem
													key={key}
													className="flex w-full items-center space-x-3 space-y-0"
												>
													<FormControl className="w-full">
														<div>
															<RadioGroupItem
																value={key}
																id={key}
																className="peer sr-only"
															/>
															<Label
																htmlFor={key}
																className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary has-data-[state=checked]:border-primary cursor-pointer"
															>
																{value.icon}
																{value.label}
															</Label>
														</div>
													</FormControl>
												</FormItem>
											))}
										</RadioGroup>
									</FormControl>
									{provider === "minio" && (
										<AlertBlock type="warning">
											MinIO was archived on April 25, 2026. It is recommended to
											use Garage or Alarik instead.
										</AlertBlock>
									)}
									<FormMessage />
									{objectStorageMutation.isError && (
										<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
											<AlertTriangle className="text-red-600 dark:text-red-400" />
											<span className="text-sm text-red-600 dark:text-red-400">
												{objectStorageMutation.error?.message}
											</span>
										</div>
									)}
								</FormItem>
							)}
						/>
						<div className="flex flex-col gap-4">
							<FormLabel className="text-lg font-semibold leading-none tracking-tight">
								Fill the next fields.
							</FormLabel>
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Name</FormLabel>
											<FormControl>
												<Input
													placeholder="Name"
													{...field}
													onChange={(e) => {
														const val = e.target.value || "";
														const serviceName = slugify(val.trim());
														form.setValue("appName", `${slug}-${serviceName}`);
														field.onChange(val);
													}}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								{shouldShowServerDropdown && (
									<FormField
										control={form.control}
										name="serverId"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Select a Server</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={
														field.value ||
														(showLocalOption ? "dokploy" : undefined)
													}
												>
													<SelectTrigger>
														<SelectValue
															placeholder={
																showLocalOption ? "Dokploy" : "Select a Server"
															}
														/>
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{showLocalOption && (
																<SelectItem value="dokploy">
																	<span className="flex items-center gap-2 justify-between w-full">
																		<span>Dokploy</span>
																		<span className="text-muted-foreground text-xs self-center">
																			Default
																		</span>
																	</span>
																</SelectItem>
															)}
															{servers?.map((server) => (
																<SelectItem
																	key={server.serverId}
																	value={server.serverId}
																>
																	{server.name}
																</SelectItem>
															))}
															<SelectLabel>
																Servers (
																{servers?.length + (showLocalOption ? 1 : 0)})
															</SelectLabel>
														</SelectGroup>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
								<FormField
									control={form.control}
									name="appName"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												App Name
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<HelpCircle className="size-4 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent side="right">
															<p>
																This will be the name of the Docker Swarm
																service
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</FormLabel>
											<FormControl>
												<Input placeholder="my-app" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Description</FormLabel>
											<FormControl>
												<Textarea
													className="h-24"
													placeholder="Description"
													{...field}
													value={field.value || ""}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rootUser"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Root User</FormLabel>
											<FormControl>
												<Input
													placeholder={`Default ${providerDefaults[provider].rootUser}`}
													autoComplete="off"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="rootPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Root Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="******************"
													autoComplete="one-time-code"
													enablePasswordGenerator={true}
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
											<FormLabel>Bucket</FormLabel>
											<FormControl>
												<Input
													placeholder={`Default ${providerDefaults[provider].bucket}`}
													autoComplete="off"
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
											<FormLabel>Region</FormLabel>
											<FormControl>
												<Input
													placeholder={`Default ${providerDefaults[provider].region}`}
													autoComplete="off"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="dockerImage"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Docker image</FormLabel>
												<FormControl>
													<Input
														placeholder={`Default ${providerDefaults[provider].dockerImage}`}
														{...field}
													/>
												</FormControl>

												<FormMessage />
											</FormItem>
										);
									}}
								/>
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
