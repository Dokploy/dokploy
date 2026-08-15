import { ImagePlus, LinkIcon, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
	value?: string;
	onChange: (value: string) => void;
	uploadLabel?: string;
	placeholder?: string;
}

export const OrganizationLogoInput = ({
	value,
	onChange,
	uploadLabel = "Upload logo",
	placeholder = "https://example.com/logo.png",
}: Props) => {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFile = async (file?: File) => {
		if (!file) return;
		if (file.size > 2 * 1024 * 1024) {
			toast.error("Image size must be less than 2MB");
			return;
		}
		const reader = new FileReader();
		reader.onload = (event) => {
			onChange(event.target?.result as string);
		};
		reader.readAsDataURL(file);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
					{value ? (
						<Logo logoUrl={value} className="size-9" />
					) : (
						<ImagePlus className="size-5 text-muted-foreground" />
					)}
				</div>
				<div className="flex flex-col gap-1.5 sm:flex-row">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
					>
						<Upload className="size-4" />
						{uploadLabel}
					</Button>
					<Input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => handleFile(e.target.files?.[0])}
					/>
				</div>
			</div>
			<div className="relative">
				<LinkIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder={placeholder}
					value={value || ""}
					onChange={(e) => onChange(e.target.value)}
					className="pl-8"
				/>
			</div>
		</div>
	);
};
