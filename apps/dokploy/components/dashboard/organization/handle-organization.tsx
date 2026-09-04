import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";

import { PenBoxIcon, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Logo } from "@/components/shared/logo";
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
import { Dropzone } from "@/components/ui/dropzone";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { resizeImage } from "@/utils/image-processing";
import { sanitizeSvg } from "@/utils/sanitize-svg";

const organizationSchema = z.object({
	name: z.string().min(1, {
		message: "Organization name is required",
	}),
	logo: z.string().optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface Props {
	organizationId?: string;
	children?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function AddOrganization({
	organizationId,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: Props) {
	const [internalOpen, setInternalOpen] = useState(false);
	const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const uploadCounter = useRef(0);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const setOpen = isControlled
		? controlledOnOpenChange || (() => {})
		: setInternalOpen;
	const utils = api.useUtils();
	const { data: organization } = api.organization.one.useQuery(
		{
			organizationId: organizationId ?? "",
		},
		{
			enabled: !!organizationId,
			refetchOnWindowFocus: false,
		},
	);
	const { mutateAsync, isPending } = organizationId
		? api.organization.update.useMutation()
		: api.organization.create.useMutation();

	const form = useForm<OrganizationFormValues>({
		resolver: zodResolver(organizationSchema),
		defaultValues: {
			name: "",
			logo: "",
		},
	});

	useEffect(() => {
		if (organization) {
			uploadCounter.current++;
			setIsUploading(false);
			form.reset({
				name: organization.name,
				logo: organization.logo || "",
			});
			setUploadedFileName(null);
		}
	}, [organization, form]);

	const onSubmit = async (values: OrganizationFormValues) => {
		if (isUploading) return;
		await mutateAsync({
			name: values.name,
			logo: values.logo,
			organizationId: organizationId ?? "",
		})
			.then(() => {
				form.reset();
				setUploadedFileName(null);
				toast.success(
					`Organization ${organizationId ? "updated" : "created"} successfully`,
				);
				utils.organization.all.invalidate();
				if (organizationId) {
					utils.organization.one.invalidate({ organizationId });
					utils.organization.active.invalidate();
				}
				setOpen(false);
			})
			.catch((error) => {
				console.error(error);
				toast.error(
					error?.message ??
						`Failed to ${organizationId ? "update" : "create"} organization`,
				);
			});
	};

	const handleFileUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		const file = files[0];
		if (!file) return;

		const currentUploadId = ++uploadCounter.current;
		setIsUploading(true);

		const allowedTypes = [
			"image/jpeg",
			"image/jpg",
			"image/png",
			"image/svg+xml",
			"image/webp",
		];
		const fileExtension = file.name.split(".").pop()?.toLowerCase();
		const allowedExtensions = ["jpg", "jpeg", "png", "svg", "webp"];

		if (
			!allowedTypes.includes(file.type) &&
			!allowedExtensions.includes(fileExtension || "")
		) {
			toast.error("Only JPG, JPEG, PNG, WEBP, and SVG files are allowed");
			setIsUploading(false);
			return;
		}

		if (file.size > 2 * 1024 * 1024) {
			toast.error("Image size must be less than 2MB");
			setIsUploading(false);
			return;
		}

		const isSvg = file.type === "image/svg+xml" || fileExtension === "svg";

		if (isSvg) {
			try {
				const text = await file.text();
				const sanitizedDataUrl = sanitizeSvg(text);
				if (currentUploadId !== uploadCounter.current) return;
				if (!sanitizedDataUrl) {
					toast.error("Invalid SVG file");
					return;
				}
				form.setValue("logo", sanitizedDataUrl);
				form.trigger("logo");
				setUploadedFileName(file.name);
			} catch (error) {
				if (currentUploadId === uploadCounter.current) {
					toast.error("Error processing SVG");
				}
			} finally {
				if (currentUploadId === uploadCounter.current) {
					setIsUploading(false);
				}
			}
			return;
		}

		// Resize raster images to max 256x256 and convert to WebP to save space
		try {
			const resizedDataUrl = await resizeImage(file, 256);
			if (currentUploadId !== uploadCounter.current) return;
			form.setValue("logo", resizedDataUrl);
			form.trigger("logo");
			setUploadedFileName(file.name);
		} catch (error) {
			if (currentUploadId === uploadCounter.current) {
				toast.error("Error processing image");
			}
		} finally {
			if (currentUploadId === uploadCounter.current) {
				setIsUploading(false);
			}
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(val) => {
				if (!val) {
					uploadCounter.current++;
					setIsUploading(false);
				}
				setOpen(val);
			}}
		>
			<DialogTrigger asChild>
				{organizationId ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
						title="Edit organization"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
					>
						<div className="flex size-6 items-center justify-center rounded-md border bg-background">
							<Plus className="size-4" />
						</div>
						<div className="font-medium text-muted-foreground">
							Add organization
						</div>
					</button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{organizationId ? "Update organization" : "Add organization"}
					</DialogTitle>
					<DialogDescription>
						{organizationId
							? "Update the organization name and logo"
							: "Create a new organization to manage your projects."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid gap-4 py-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="items-center gap-4">
									<div className="flex items-center justify-between">
										<FormLabel className="text-right">Name</FormLabel>
									</div>
									<FormControl>
										<Input
											placeholder="Organization name"
											{...field}
											className="col-span-3"
										/>
									</FormControl>
									<FormMessage className="" />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="logo"
							render={({ field }) => {
								const isDataUrl = field.value?.startsWith("data:");
								const displayValue = isDataUrl
									? uploadedFileName || "Uploaded image"
									: field.value || "";

								return (
									<FormItem className="gap-4">
										<FormLabel className="text-right">
											Logo URL or Upload
										</FormLabel>
										<FormControl>
											<div className="col-span-3 flex flex-col gap-3">
												<div className="flex items-center gap-3">
													<div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/50 overflow-hidden">
														{field.value ? (
															// biome-ignore lint/performance/noImgElement: user uploaded logo preview
															<img
																src={field.value}
																alt="Logo preview"
																className="size-full object-cover"
															/>
														) : (
															<Logo className="size-7" />
														)}
													</div>
													<div className="relative flex-1">
														<Input
															placeholder="https://example.com/logo.png"
															{...field}
															value={displayValue}
															readOnly={isDataUrl}
															onChange={(e) => {
																uploadCounter.current++;
																setIsUploading(false);
																field.onChange(e);
																if (isDataUrl) setUploadedFileName(null);
															}}
															className="w-full pr-8"
														/>
														{field.value && (
															<button
																type="button"
																onClick={() => {
																	uploadCounter.current++;
																	setIsUploading(false);
																	form.setValue("logo", "");
																	setUploadedFileName(null);
																}}
																className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
															>
																<X className="size-4" />
															</button>
														)}
													</div>
												</div>
												<Dropzone
													dropMessage="Drag & drop a logo or click to upload"
													accept=".jpg,.jpeg,.png,.svg,.webp,image/jpeg,image/png,image/svg+xml,image/webp"
													onChange={handleFileUpload}
													classNameWrapper="border-2 border-dashed border-border hover:border-primary bg-muted/30 hover:bg-muted/50 transition-all rounded-lg"
													classNameContent="h-32"
												/>
											</div>
										</FormControl>
										<FormMessage className="col-span-3 col-start-2" />
									</FormItem>
								);
							}}
						/>
						<DialogFooter>
							<Button type="submit" isLoading={isPending || isUploading}>
								{organizationId ? "Update organization" : "Create organization"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
