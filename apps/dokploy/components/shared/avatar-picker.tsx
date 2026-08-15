import { Palette } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	FormControl,
	FormDescription,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getAvatarType, isSolidColorAvatar } from "@/lib/avatar-utils";
import { getFallbackAvatarInitials } from "@/lib/utils";

const RANDOM_AVATARS = [
	"/avatars/avatar-1.png",
	"/avatars/avatar-2.png",
	"/avatars/avatar-3.png",
	"/avatars/avatar-4.png",
	"/avatars/avatar-5.png",
	"/avatars/avatar-6.png",
	"/avatars/avatar-7.png",
	"/avatars/avatar-8.png",
	"/avatars/avatar-9.png",
	"/avatars/avatar-10.png",
	"/avatars/avatar-11.png",
	"/avatars/avatar-12.png",
];

interface Props {
	value?: string;
	onChange: (value: string) => void;
	/** Name used to render the initials fallback. */
	fallbackName: string;
	/** Extra avatars appended after the built-in presets. */
	extraAvatars?: string[];
	label?: string;
	description?: string;
}

export const AvatarPicker = ({
	value = "",
	onChange,
	fallbackName,
	extraAvatars = [],
	label = "Avatar",
	description = "Choose a preset, upload your own, or pick a solid color.",
}: Props) => {
	const colorInputRef = useRef<HTMLInputElement>(null);
	const availableAvatars = [...RANDOM_AVATARS, ...extraAvatars];
	const initials = getFallbackAvatarInitials(fallbackName.trim());

	return (
		<FormItem>
			<div className="flex items-center gap-4 mb-4">
				{isSolidColorAvatar(value) ? (
					<div
						className="size-16 rounded-full border shrink-0"
						style={{
							backgroundColor: value?.replace(/^color:/, "") || undefined,
						}}
					/>
				) : (
					<Avatar className="size-16 rounded-full border shrink-0">
						<AvatarImage src={value} alt="Avatar preview" />
						<AvatarFallback className="rounded-full">{initials}</AvatarFallback>
					</Avatar>
				)}
				<div>
					<FormLabel>{label}</FormLabel>
					<FormDescription>{description}</FormDescription>
				</div>
			</div>
			<FormControl>
				<RadioGroup
					onValueChange={onChange}
					defaultValue={getAvatarType(value)}
					value={getAvatarType(value)}
					className="flex flex-row flex-wrap gap-2 max-xl:justify-center"
				>
					<FormItem key="no-avatar">
						<FormLabel className="[&:has([data-state=checked])>.default-avatar]:border-primary [&:has([data-state=checked])>.default-avatar]:border [&:has([data-state=checked])>.default-avatar]:p-px cursor-pointer">
							<FormControl>
								<RadioGroupItem value="" className="sr-only" />
							</FormControl>
							<Avatar className="default-avatar h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-transform">
								<AvatarFallback className="rounded-full">
									{initials}
								</AvatarFallback>
							</Avatar>
						</FormLabel>
					</FormItem>
					<FormItem key="custom-upload">
						<FormLabel className="[&:has([data-state=checked])>.upload-avatar]:border-primary [&:has([data-state=checked])>.upload-avatar]:border [&:has([data-state=checked])>.upload-avatar]:p-px cursor-pointer">
							<FormControl>
								<RadioGroupItem value="upload" className="sr-only" />
							</FormControl>
							<div
								className="upload-avatar h-12 w-12 rounded-full border border-dashed border-muted-foreground hover:border-primary transition-colors flex items-center justify-center bg-muted/50 hover:bg-muted overflow-hidden"
								onClick={() =>
									document.getElementById("avatar-upload")?.click()
								}
							>
								{value?.startsWith("data:") ? (
									<img
										src={value}
										alt="Custom avatar"
										className="h-full w-full object-cover rounded-full"
									/>
								) : (
									<svg
										className="h-5 w-5 text-muted-foreground"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 4v16m8-8H4"
										/>
									</svg>
								)}
							</div>
							<input
								id="avatar-upload"
								type="file"
								accept="image/*"
								className="hidden"
								onChange={async (e) => {
									const file = e.target.files?.[0];
									if (file) {
										if (file.size > 2 * 1024 * 1024) {
											toast.error("Image size must be less than 2MB");
											return;
										}
										const reader = new FileReader();
										reader.onload = (event) => {
											onChange(event.target?.result as string);
										};
										reader.readAsDataURL(file);
									}
								}}
							/>
						</FormLabel>
					</FormItem>
					<FormItem key="color-avatar">
						<FormLabel className="[&:has([data-state=checked])>.color-avatar]:border-primary [&:has([data-state=checked])>.color-avatar]:border [&:has([data-state=checked])>.color-avatar]:p-px cursor-pointer relative">
							<FormControl>
								<RadioGroupItem value="color" className="sr-only" />
							</FormControl>
							<div
								className="color-avatar h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-colors flex items-center justify-center overflow-hidden cursor-pointer"
								style={{
									backgroundColor: isSolidColorAvatar(value)
										? value?.replace(/^color:/, "") || undefined
										: undefined,
								}}
								onClick={() => colorInputRef.current?.click()}
							>
								{!isSolidColorAvatar(value) && (
									<Palette className="h-5 w-5 text-muted-foreground" />
								)}
							</div>
							<input
								ref={colorInputRef}
								type="color"
								className="absolute opacity-0 pointer-events-none w-12 h-12 top-0 left-0"
								value={
									isSolidColorAvatar(value)
										? (value?.replace(/^color:/, "") ?? "#000000")
										: "#000000"
								}
								onChange={(e) => onChange(e.target.value)}
							/>
						</FormLabel>
					</FormItem>
					{availableAvatars.map((image) => (
						<FormItem key={image}>
							<FormLabel className="[&:has([data-state=checked])>img]:border-primary [&:has([data-state=checked])>img]:border [&:has([data-state=checked])>img]:p-px cursor-pointer">
								<FormControl>
									<RadioGroupItem value={image} className="sr-only" />
								</FormControl>
								<img
									src={image}
									alt="avatar"
									className="h-12 w-12 rounded-full border hover:p-px hover:border-primary transition-transform"
								/>
							</FormLabel>
						</FormItem>
					))}
				</RadioGroup>
			</FormControl>
		</FormItem>
	);
};
