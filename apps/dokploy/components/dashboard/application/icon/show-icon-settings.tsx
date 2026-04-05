import DOMPurify from "dompurify";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { type BundledIcon, bundledIcons } from "@/lib/bundled-icons";
import { api } from "@/utils/api";

interface ShowIconSettingsProps {
	applicationId: string;
}

const svgToDataUrl = (icon: BundledIcon): string => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${icon.hex}"><path d="${icon.path}"/></svg>`;
	return `data:image/svg+xml;base64,${btoa(svg)}`;
};

export const ShowIconSettings = ({ applicationId }: ShowIconSettingsProps) => {
	const [uploadedIcon, setUploadedIcon] = useState<string | null>(null);
	const [iconSearchQuery, setIconSearchQuery] = useState("");
	const [iconsToShow, setIconsToShow] = useState(24);

	const filteredIcons = useMemo(() => {
		if (!iconSearchQuery) return bundledIcons;
		const q = iconSearchQuery.toLowerCase();
		return bundledIcons.filter(
			(icon) =>
				icon.title.toLowerCase().includes(q) ||
				icon.slug.toLowerCase().includes(q),
		);
	}, [iconSearchQuery]);

	const displayedIcons = filteredIcons.slice(0, iconsToShow);
	const hasMoreIcons = filteredIcons.length > iconsToShow;

	const { data } = api.application.one.useQuery(
		{ applicationId },
		{ refetchInterval: 5000 },
	);
	const utils = api.useUtils();
	const { mutateAsync: updateApplication } =
		api.application.update.useMutation();

	useEffect(() => {
		if (data?.icon) {
			setUploadedIcon(data.icon);
		} else {
			setUploadedIcon(null);
		}
	}, [data?.icon]);

	useEffect(() => {
		setIconsToShow(24);
	}, [iconSearchQuery]);

	const handleIconSelect = async (icon: BundledIcon) => {
		try {
			const dataUrl = svgToDataUrl(icon);
			setUploadedIcon(dataUrl);
			await updateApplication({
				applicationId,
				icon: dataUrl,
			});
			toast.success("Icon saved successfully");
			await utils.application.one.invalidate({ applicationId });
		} catch (_error) {
			toast.error("Error saving icon");
		}
	};

	const sanitizeSvg = (svgContent: string): string | null => {
		const clean = DOMPurify.sanitize(svgContent, {
			USE_PROFILES: { svg: true, svgFilters: true },
			ADD_TAGS: ["use"],
		});
		if (!clean) return null;
		return `data:image/svg+xml;base64,${btoa(clean)}`;
	};

	return (
		<div className="flex flex-col gap-4 pt-2.5">
			{uploadedIcon && (
				<div className="flex items-center gap-4 p-4 rounded-lg bg-background border">
					{/* biome-ignore lint/performance/noImgElement: icon is data URL */}
					<img
						src={uploadedIcon}
						alt="Uploaded icon"
						className="size-20 object-contain rounded-lg border border-border bg-muted/50 p-2"
					/>
					<div className="flex-1">
						<p className="text-sm font-medium">Icon uploaded</p>
						<p className="text-xs text-muted-foreground mt-1">
							This icon will appear in service cards
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={async () => {
							try {
								await updateApplication({
									applicationId,
									icon: null,
								});
								setUploadedIcon(null);
								toast.success("Icon removed");
								await utils.application.one.invalidate({
									applicationId,
								});
							} catch (_error) {
								toast.error("Error removing icon");
							}
						}}
					>
						<X className="size-4" />
					</Button>
				</div>
			)}

			<div className="space-y-4">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder="Search icons (e.g. react, vue, docker)..."
						value={iconSearchQuery}
						onChange={(e) => setIconSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>

				<div className="max-h-[400px] overflow-y-auto border rounded-lg p-4">
					{displayedIcons.length === 0 ? (
						<div className="text-center py-8 text-sm text-muted-foreground">
							No icons found
						</div>
					) : (
						<>
							<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
								{displayedIcons.map((icon) => (
									<button
										type="button"
										key={icon.slug}
										onClick={() => handleIconSelect(icon)}
										className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-muted transition-colors group"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											className="size-8 group-hover:scale-110 transition-transform"
											fill={`#${icon.hex}`}
										>
											<path d={icon.path} />
										</svg>
										<span className="text-xs text-muted-foreground capitalize truncate w-full text-center">
											{icon.title}
										</span>
									</button>
								))}
							</div>
							{hasMoreIcons && (
								<div className="flex justify-center mt-4">
									<Button
										variant="outline"
										onClick={() => setIconsToShow((prev) => prev + 24)}
									>
										Load More ({filteredIcons.length - iconsToShow} remaining)
									</Button>
								</div>
							)}
						</>
					)}
				</div>

				<div className="relative pt-4 border-t">
					<p className="text-sm text-muted-foreground text-center mb-4">
						or upload a custom icon
					</p>
					<div className="[&>div>div]:!h-32 [&>div>div]:!py-4 [&>div>div]:!px-6 [&>div>div>div]:!flex [&>div>div>div]:!flex-col [&>div>div>div]:!items-center [&>div>div>div]:!gap-2 [&>div>div>div>span]:!text-sm [&>div>div>div>span>svg]:!size-8">
						<Dropzone
							dropMessage="Drag & drop an icon or click to upload"
							accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
							onChange={async (files) => {
								if (!files || files.length === 0) return;
								const file = files[0];
								if (!file) return;

								const allowedTypes = [
									"image/jpeg",
									"image/jpg",
									"image/png",
									"image/svg+xml",
								];
								const fileExtension = file.name.split(".").pop()?.toLowerCase();
								const allowedExtensions = ["jpg", "jpeg", "png", "svg"];

								if (
									!allowedTypes.includes(file.type) &&
									!allowedExtensions.includes(fileExtension || "")
								) {
									toast.error("Only JPG, JPEG, PNG, and SVG files are allowed");
									return;
								}

								if (file.size > 2 * 1024 * 1024) {
									toast.error("Image size must be less than 2MB");
									return;
								}

								const isSvg =
									file.type === "image/svg+xml" || fileExtension === "svg";

								if (isSvg) {
									const text = await file.text();
									const sanitizedDataUrl = sanitizeSvg(text);
									if (!sanitizedDataUrl) {
										toast.error("Invalid SVG file");
										return;
									}
									setUploadedIcon(sanitizedDataUrl);
									try {
										await updateApplication({
											applicationId,
											icon: sanitizedDataUrl,
										});
										toast.success("Icon saved!");
										await utils.application.one.invalidate({
											applicationId,
										});
									} catch (_error) {
										toast.error("Error saving icon");
										setUploadedIcon(null);
									}
									return;
								}

								const reader = new FileReader();
								reader.onload = async (event) => {
									const result = event.target?.result as string;
									setUploadedIcon(result);
									try {
										await updateApplication({
											applicationId,
											icon: result,
										});
										toast.success("Icon saved!");
										await utils.application.one.invalidate({
											applicationId,
										});
									} catch (_error) {
										toast.error("Error saving icon");
										setUploadedIcon(null);
									}
								};
								reader.readAsDataURL(file);
							}}
							classNameWrapper="border-2 border-dashed border-border hover:border-primary bg-muted/30 hover:bg-muted/50 transition-all rounded-lg"
						/>
					</div>
					<div className="mt-3 text-center text-xs text-muted-foreground">
						Supported formats: JPG, JPEG, PNG, SVG (max 2MB)
					</div>
				</div>
			</div>
		</div>
	);
};
