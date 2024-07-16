import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";

export const ToggleVisibilityInput = ({ ...props }: InputProps) => {
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevVisibility) => !prevVisibility);
	};

	const inputType = isPasswordVisible ? "text" : "password";
	return (
		<div className="flex w-full items-center space-x-2">
			<Input type={inputType} {...props} />
			<Button onClick={togglePasswordVisibility} variant={"secondary"}>
				{inputType === "password" ? (
					<EyeIcon className="size-4 text-muted-foreground" />
				) : (
					<EyeOffIcon className="size-4 text-muted-foreground" />
				)}
			</Button>
		</div>
	);
};
