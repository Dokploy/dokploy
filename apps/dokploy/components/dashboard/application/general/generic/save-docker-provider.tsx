import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

const DockerProviderSchema = z.object({
	dockerImage: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
	registryURL: z.string().optional(),
});

type DockerProvider = z.infer<typeof DockerProviderSchema>;

interface Props {
	applicationId: string;
}

export const SaveDockerProvider = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery({ applicationId });

	const { mutateAsync } = api.application.saveDockerProvider.useMutation();
	const form = useForm<DockerProvider>({
		defaultValues: {
			dockerImage: "",
			password: "",
			username: "",
			registryURL: "",
		},
		resolver: zodResolver(DockerProviderSchema),
	});

	const NO_REGISTRY = "none";
	const [userOverride, setUserOverride] = useState(false);
	const [selectedRegistryId, setSelectedRegistryId] = useState<string>("");
	const [selectedImage, setSelectedImage] = useState<string>("");
	const [selectedTag, setSelectedTag] = useState<string>("");
	const [imageError, setImageError] = useState<string>("");
	const [tagError, setTagError] = useState<string>("");

	useEffect(() => {
		if (data) {
			form.reset({
				dockerImage: data.dockerImage || "",
				password: data.password || "",
				username: data.username || "",
				registryURL: data.registryUrl || "",
			});
		}
	}, [form.reset, data?.applicationId, form]);

	const derivedRegistryId = userOverride
		? selectedRegistryId
		: (data?.registryId ?? "");

	const derivedImage = (() => {
		if (userOverride) return selectedImage;
		if (!data?.registryId || !data?.dockerImage) return "";
		const dockerImage = data.dockerImage;
		const tagSep = dockerImage.lastIndexOf(":");
		if (tagSep === -1) return dockerImage;
		let beforeTag = dockerImage.substring(0, tagSep);
		const regUrl = (data.registryUrl || "").replace(/\/+$/, "");
		if (regUrl && beforeTag.startsWith(`${regUrl}/`)) {
			beforeTag = beforeTag.substring(regUrl.length + 1);
		}
		const prefix = data.registry?.imagePrefix;
		if (prefix && beforeTag.startsWith(`${prefix}/`)) {
			beforeTag = beforeTag.substring(prefix.length + 1);
		}
		return beforeTag;
	})();

	const derivedTag = (() => {
		if (userOverride) return selectedTag;
		if (!data?.registryId || !data?.dockerImage) return "";
		const tagSep = data.dockerImage.lastIndexOf(":");
		return tagSep !== -1 ? data.dockerImage.substring(tagSep + 1) : "";
	})();
	const [imageOpen, setImageOpen] = useState(false);
	const [tagOpen, setTagOpen] = useState(false);

	const { data: registries, isLoading: registriesLoading } =
		api.registry.all.useQuery();

	const selectedRegistry = registries?.find(
		(r) => r.registryId === derivedRegistryId,
	);

	// Strip imagePrefix from catalog names for display/storage.
	// The registry API returns full paths (e.g. "docker/empty") but we store
	// only the base name so populateFormFromRegistry can add the prefix back once.
	const stripPrefix = (imageName: string) => {
		const prefix = selectedRegistry?.imagePrefix;
		if (prefix && imageName.startsWith(`${prefix}/`)) {
			return imageName.substring(prefix.length + 1);
		}
		return imageName;
	};

	// Reconstruct full registry path (prefix + base name) for API calls
	const fullImageName = (() => {
		if (!derivedImage) return "";
		const prefix = selectedRegistry?.imagePrefix;
		return prefix ? `${prefix}/${derivedImage}` : derivedImage;
	})();

	const { data: images, isLoading: imagesLoading } =
		api.registry.getImages.useQuery(
			{ registryId: derivedRegistryId },
			{ enabled: !!derivedRegistryId },
		);

	const { data: tags, isLoading: tagsLoading } =
		api.registry.getImageTags.useQuery(
			{ registryId: derivedRegistryId, imageName: fullImageName },
			{ enabled: !!derivedRegistryId && !!derivedImage },
		);

	const populateFormFromRegistry = (
		reg: typeof selectedRegistry,
		image: string,
		tag: string,
	) => {
		if (!reg) return;
		const registryUrl = reg.registryUrl.replace(/\/+$/, "");
		const prefix = reg.imagePrefix;
		const imagePath = prefix ? `${prefix}/${image}` : image;
		const fullImage = `${registryUrl}/${imagePath}:${tag}`;
		form.setValue("dockerImage", fullImage);
		form.setValue("username", reg.username);
		form.setValue("password", reg.password);
		form.setValue("registryURL", reg.registryUrl);
	};

	const handleRegistryChange = (value: string) => {
		setUserOverride(true);
		setSelectedRegistryId(value === NO_REGISTRY ? "" : value);
		setSelectedImage("");
		setSelectedTag("");
		setImageError("");
		setTagError("");
		if (value === NO_REGISTRY) {
			form.setValue("dockerImage", "");
			form.setValue("username", "");
			form.setValue("password", "");
			form.setValue("registryURL", "");
		}
	};

	const handleImageSelect = (image: string) => {
		setUserOverride(true);
		setSelectedImage(image);
		setSelectedTag("");
		setImageOpen(false);
		setImageError("");
		setTagError("");
	};

	const handleTagSelect = (tag: string) => {
		setUserOverride(true);
		setSelectedTag(tag);
		setTagOpen(false);
		setTagError("");
		populateFormFromRegistry(selectedRegistry, derivedImage, tag);
	};

	const onSubmit = async (values: DockerProvider) => {
		if (derivedRegistryId) {
			let hasError = false;
			if (!derivedImage) {
				setImageError("Image is required");
				hasError = true;
			}
			if (!derivedTag) {
				setTagError("Tag is required");
				hasError = true;
			}
			if (hasError) return;
		} else if (!values.dockerImage) {
			form.setError("dockerImage", { message: "Docker image is required" });
			return;
		}
		await mutateAsync({
			dockerImage: values.dockerImage ?? "",
			password: values.password || null,
			applicationId,
			username: values.username || null,
			registryUrl: values.registryURL || null,
			registryId: derivedRegistryId || null,
		})
			.then(async () => {
				toast.success("Docker Provider Saved");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the Docker provider");
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="space-y-4">
					<div>
						<FormLabel>Browse from Registry</FormLabel>
						<Select
							value={derivedRegistryId || NO_REGISTRY}
							onValueChange={handleRegistryChange}
							disabled={registriesLoading}
						>
							<SelectTrigger>
								{registriesLoading ? (
									<div className="flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span className="text-muted-foreground">
											Loading registries...
										</span>
									</div>
								) : (
									<SelectValue placeholder="Select a registry" />
								)}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_REGISTRY}>None (manual input)</SelectItem>
								{registries?.map((reg) => (
									<SelectItem key={reg.registryId} value={reg.registryId}>
										{reg.registryName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{derivedRegistryId && (
						<div className="grid md:grid-cols-2 gap-4">
							<div>
								<FormLabel>Image</FormLabel>
								<Popover open={imageOpen} onOpenChange={setImageOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											aria-expanded={imageOpen}
											className={cn(
											"w-full justify-between font-normal",
											imageError && "border-destructive",
										)}
										>
											{derivedImage || "Select an image..."}
											{imagesLoading ? (
												<Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
											) : (
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
										<Command>
											<CommandInput placeholder="Search images..." />
											<CommandList>
												<CommandEmpty>No images found.</CommandEmpty>
												<CommandGroup>
													{images?.map((image) => {
														const baseName = stripPrefix(image);
														return (
															<CommandItem
																key={image}
																value={baseName}
																onSelect={() => handleImageSelect(baseName)}
															>
																<Check
																	className={cn(
																		"mr-2 h-4 w-4",
																		derivedImage === baseName
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
																{baseName}
															</CommandItem>
														);
													})}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
								{imageError && (
									<p className="text-sm font-medium text-destructive mt-1">{imageError}</p>
								)}
							</div>

							<div>
								<FormLabel>Tag</FormLabel>
								<Popover open={tagOpen} onOpenChange={setTagOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											aria-expanded={tagOpen}
											className={cn(
											"w-full justify-between font-normal",
											tagError && "border-destructive",
										)}
											disabled={!derivedImage}
										>
											{derivedTag || "Select a tag..."}
											{tagsLoading ? (
												<Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
											) : (
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
										<Command>
											<CommandInput placeholder="Search tags..." />
											<CommandList>
												<CommandEmpty>No tags found.</CommandEmpty>
												<CommandGroup>
													{tags?.map((tag) => (
														<CommandItem
															key={tag}
															value={tag}
															onSelect={() => handleTagSelect(tag)}
														>
															<Check
																className={cn(
																	"mr-2 h-4 w-4",
																	derivedTag === tag
																		? "opacity-100"
																		: "opacity-0",
																)}
															/>
															{tag}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
								{tagError && (
									<p className="text-sm font-medium text-destructive mt-1">{tagError}</p>
								)}
							</div>
						</div>
					)}
				</div>

				{!derivedRegistryId && (
					<div className="grid md:grid-cols-2 gap-4 ">
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="dockerImage"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Docker Image</FormLabel>
										<FormControl>
											<Input placeholder="node:16" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="registryURL"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Registry URL</FormLabel>
									<FormControl>
										<Input placeholder="Registry URL" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input
												placeholder="Username"
												autoComplete="username"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="space-y-4">
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												placeholder="Password"
												autoComplete="one-time-code"
												{...field}
												type="password"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</div>
				)}

				<div className="flex flex-row justify-end">
					<Button
						type="submit"
						className="w-fit"
						isLoading={form.formState.isSubmitting}
					>
						Save{" "}
					</Button>
				</div>
			</form>
		</Form>
	);
};
