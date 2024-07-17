import { EyeIcon, EyeOffIcon, Clipboard } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";
import { toast } from "sonner";

export const ToggleVisibilityInput = ({ ...props }: InputProps) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null)

  const togglePasswordVisibility = () => {
    setIsPasswordVisible((prevVisibility) => !prevVisibility);
  };

  const copyToClipboard = () => {
    if (!inputRef.current) return;

    const inputElement = inputRef.current;
    const text = inputElement.value;

    inputElement.select();
    inputElement.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(text);

    toast.success("Value is copied to clipboard");
  }

  const inputType = isPasswordVisible ? "text" : "password";
  return (
    <div className="flex w-full items-center space-x-2">
      <Input ref={inputRef} type={inputType} {...props} />
      <Button variant={"secondary"} onClick={copyToClipboard}>
        <Clipboard className="size-4 text-muted-foreground" />
      </Button>
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
