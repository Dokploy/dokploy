import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input, type InputProps } from "../ui/input";
import { Button } from "../ui/button";

interface ToggleVisibilityInputProps extends InputProps {
	value: string | undefined;
}

export const ToggleVisibilityInput = ({
	value,
	...props
}: ToggleVisibilityInputProps) => {
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevVisibility) => !prevVisibility);
	};

	const inputType = isPasswordVisible ? "text" : "password";
	return (
		<div className="flex w-full items-center space-x-2">
			<Input value={value} type={inputType} {...props} />
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
