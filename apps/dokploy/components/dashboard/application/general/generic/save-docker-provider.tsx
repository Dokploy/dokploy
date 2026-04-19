import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";

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

	const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(
		null,
	);
	const [selectedImage, setSelectedImage] = useState<string>("");
	const [selectedTag, setSelectedTag] = useState<string>("latest");
	const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
	const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
	const [imageSearchInput, setImageSearchInput] = useState("");
	const [tagSearchInput, setTagSearchInput] = useState("");

	const debouncedImageSearch = useDebounce(imageSearchInput, 400);

	const { data: registries } = api.registry.all.useQuery();

	const { data: images, isFetching: imagesFetching } =
		api.registry.getImages.useQuery(
			{
				registryId: selectedRegistryId ?? "",
				search: debouncedImageSearch || undefined,
			},
			{
				enabled: !!selectedRegistryId,
				staleTime: 30_000,
				retry: false,
			},
		);

	const { data: tags, isFetching: tagsFetching } =
		api.registry.getTags.useQuery(
			{ registryId: selectedRegistryId ?? "", imageName: selectedImage },
			{
				enabled: !!selectedRegistryId && !!selectedImage,
				staleTime: 30_000,
				retry: false,
			},
		);

	const filteredTags = (tags ?? []).filter((t) =>
		t.toLowerCase().includes(tagSearchInput.toLowerCase()),
	);

	const form = useForm<DockerProvider>({
		defaultValues: {
			dockerImage: "",
			password: "",
			username: "",
			registryURL: "",
		},
		resolver: zodResolver(DockerProviderSchema),
	});

	useEffect(() => {
		if (!data) return;
		if (data.registryId) {
			setSelectedRegistryId(data.registryId);
			if (data.dockerImage) {
				const idx = data.dockerImage.lastIndexOf(":");
				if (idx !== -1) {
					setSelectedImage(data.dockerImage.substring(0, idx));
					setSelectedTag(data.dockerImage.substring(idx + 1));
				} else {
					setSelectedImage(data.dockerImage);
					setSelectedTag("latest");
				}
			}
		} else {
			setSelectedRegistryId(null);
			form.reset({
				dockerImage: data.dockerImage || "",
				password: data.password || "",
				username: data.username || "",
				registryURL: data.registryUrl || "",
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.applicationId]);

	const handleRegistryChange = (value: string) => {
		setSelectedRegistryId(value === "none" ? null : value);
		setSelectedImage("");
		setSelectedTag("latest");
		setImageSearchInput("");
		setTagSearchInput("");
	};

	const onSubmit = async (values: DockerProvider) => {
		if (selectedRegistryId) {
			if (!selectedImage) {
				toast.error("Please select an image");
				return;
			}
			await mutateAsync({
				dockerImage: `${selectedImage}:${selectedTag}`,
				applicationId,
				username: null,
				password: null,
				registryUrl: null,
				registryId: selectedRegistryId,
			})
				.then(async () => {
					toast.success("Docker Provider Saved");
					await refetch();
				})
				.catch(() => {
					toast.error("Error saving the Docker provider");
				});
		} else {
			if (!values.dockerImage?.trim()) {
				form.setError("dockerImage", { message: "Docker image is required" });
				return;
			}
			await mutateAsync({
				dockerImage: values.dockerImage,
				password: values.password || null,
				applicationId,
				username: values.username || null,
				registryUrl: values.registryURL || null,
				registryId: null,
			})
				.then(async () => {
					toast.success("Docker Provider Saved");
					await refetch();
				})
				.catch(() => {
					toast.error("Error saving the Docker provider");
				});
		}
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-4"
			>
				<div className="space-y-2">
					<Label>Registry</Label>
					<Select
						value={selectedRegistryId ?? "none"}
						onValueChange={handleRegistryChange}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="None (Manual Input)" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="none">None (Manual Input)</SelectItem>
								{registries?.map((reg) => (
									<SelectItem key={reg.registryId} value={reg.registryId}>
										{reg.registryName}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					{registries !== undefined && registries.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No registries configured.{" "}
							<Link
								href="/dashboard/settings/registry"
								className="underline underline-offset-2"
							>
								Add a registry
							</Link>{" "}
							to enable image browsing.
						</p>
					)}
				</div>

				{selectedRegistryId ? (
					<div className="grid md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Image</Label>
							<Popover
								open={imagePopoverOpen}
								onOpenChange={setImagePopoverOpen}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										aria-expanded={imagePopoverOpen}
										className="w-full justify-between bg-input font-normal"
									>
										{selectedImage ? (
											selectedImage
										) : (
											<span className="text-muted-foreground">
												Search images...
											</span>
										)}
										{imagesFetching ? (
											<Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
										) : (
											<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="p-0"
									style={{ width: "var(--radix-popover-trigger-width)" }}
									align="start"
								>
									<Command shouldFilter={false}>
										<CommandInput
											placeholder="Search images..."
											value={imageSearchInput}
											onValueChange={setImageSearchInput}
										/>
										<CommandList>
											{!imagesFetching &&
												(!images || images.length === 0) && (
													<CommandEmpty>No images found.</CommandEmpty>
												)}
											{imagesFetching && (
												<div className="flex items-center justify-center py-4">
													<Loader2 className="h-4 w-4 animate-spin" />
												</div>
											)}
											<CommandGroup>
												{images?.map((img) => (
													<CommandItem
														key={img}
														value={img}
														onSelect={(val) => {
															setSelectedImage(val);
															setSelectedTag("latest");
															setTagSearchInput("");
															setImagePopoverOpen(false);
														}}
													>
														<Check
															className={cn(
																"mr-2 h-4 w-4",
																selectedImage === img
																	? "opacity-100"
																	: "opacity-0",
															)}
														/>
														{img}
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<div className="space-y-2">
							<Label>Tag / Version</Label>
							<Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										aria-expanded={tagPopoverOpen}
										className="w-full justify-between bg-input font-normal"
										disabled={!selectedImage}
									>
										{selectedTag ? (
											selectedTag
										) : (
											<span className="text-muted-foreground">
												Select tag...
											</span>
										)}
										{tagsFetching ? (
											<Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
										) : (
											<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="p-0"
									style={{ width: "var(--radix-popover-trigger-width)" }}
									align="start"
								>
									<Command shouldFilter={false}>
										<CommandInput
											placeholder="Filter tags..."
											value={tagSearchInput}
											onValueChange={setTagSearchInput}
										/>
										<CommandList>
											{!tagsFetching && filteredTags.length === 0 && (
												<CommandEmpty>No tags found.</CommandEmpty>
											)}
											{tagsFetching && (
												<div className="flex items-center justify-center py-4">
													<Loader2 className="h-4 w-4 animate-spin" />
												</div>
											)}
											<CommandGroup>
												{filteredTags.map((tag) => (
													<CommandItem
														key={tag}
														value={tag}
														onSelect={(val) => {
															setSelectedTag(val);
															setTagPopoverOpen(false);
														}}
													>
														<Check
															className={cn(
																"mr-2 h-4 w-4",
																selectedTag === tag
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
						</div>
					</div>
				) : (
					<div className="grid md:grid-cols-2 gap-4">
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
						Save
					</Button>
				</div>
			</form>
		</Form>
	);
};
