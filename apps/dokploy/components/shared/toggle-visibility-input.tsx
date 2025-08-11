import copy from "copy-to-clipboard";
import { Clipboard, EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";

export const ToggleVisibilityInput = ({ ...props }: InputProps) => {
	const { t } = useTranslation("dashboard");
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevVisibility) => !prevVisibility);
	};

	return (
		<div className="flex w-full items-center space-x-2">
			<Input
				ref={inputRef}
				type={isPasswordVisible ? "text" : "password"}
				{...props}
			/>
			<Button
				variant={"secondary"}
				onClick={() => {
					copy(inputRef.current?.value || "");
					toast.success(t("dashboard.shared.valueCopiedToClipboard"));
				}}
			>
				<Clipboard className="size-4 text-muted-foreground" />
			</Button>
			<Button onClick={togglePasswordVisibility} variant={"secondary"}>
				{isPasswordVisible ? (
					<EyeOffIcon className="size-4 text-muted-foreground" />
				) : (
					<EyeIcon className="size-4 text-muted-foreground" />
				)}
			</Button>
		</div>
	);
};
