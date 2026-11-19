import copy from "copy-to-clipboard";
import { Clipboard } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";

export const ToggleVisibilityInput = ({ ...props }: InputProps) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();

	return (
		<div className="flex w-full items-center space-x-2">
			<Input ref={inputRef} {...props} type="password" />
			<Button
				variant={"secondary"}
				onClick={() => {
					copy(inputRef.current?.value || "");
					toast.success(t("shared.valueCopied"));
				}}
			>
				<Clipboard className="size-4 text-muted-foreground" />
			</Button>
			{/* <Button onClick={togglePasswordVisibility} variant={"secondary"}>
				{isPasswordVisible ? (
					<EyeOffIcon className="size-4 text-muted-foreground" />
				) : (
					<EyeIcon className="size-4 text-muted-foreground" />
				)}
			</Button> */}
		</div>
	);
};
