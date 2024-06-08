import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

interface ToggleVisibilityInputProps {
    value: string | undefined
}

export default function ToggleVisibilityInput({ value }: ToggleVisibilityInputProps) {
    const [inputType, setInputType] = useState<'password' | 'text'>('password');

    const togglePasswordVisibility = () => {
        setInputType(prevType => (prevType === 'password' ? 'text' : 'password'));
    };
    return (
        <div className="flex w-full items-center space-x-2">
            <Input value={value} type={inputType} />
            <Button onClick={togglePasswordVisibility}>{inputType === "password" ? <EyeIcon /> : <EyeOffIcon />}</Button>
        </div>
    )
}
