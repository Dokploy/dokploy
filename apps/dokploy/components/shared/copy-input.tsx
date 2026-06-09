import copy from "copy-to-clipboard";
import { Clipboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";

export const copyToClipboard = (value: string | undefined): string => {
	const text = value ?? "";
	copy(text);
	toast.success("Value is copied to clipboard");
	return text;
};

export const CopyInput = ({ ...props }: InputProps) => {
	return (
		<div className="flex w-full items-center space-x-2">
			<Input {...props} />
			<Button
				type="button"
				variant={"secondary"}
				onClick={() => copyToClipboard(props.value?.toString())}
			>
				<Clipboard className="size-4 text-muted-foreground" />
			</Button>
		</div>
	);
};
