import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { PlusIcon, TrashIcon } from "lucide-react";
import * as React from "react";

interface EnvPair {
	key: string;
	value: string;
}

interface StandardEnvFormProps {
	value: string;
	onChange: (value: string) => void;
}

const parseEnvString = (str: string): EnvPair[] => {
	if (!str) return [{ key: "", value: "" }];

	return str
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			const [key, ...valueParts] = line.split("=");
			return {
				key: key?.trim() ?? "",
				value: valueParts.join("=").trim(),
			};
		});
};

const toEnvString = (pairs: EnvPair[]): string => {
	return pairs
		.filter((pair) => pair.key || pair.value)
		.map((pair) => `${pair.key}=${pair.value}`)
		.join("\n");
};

export const StandardEnvForm: React.FC<StandardEnvFormProps> = ({
	value,
	onChange,
}) => {
	const [isVisible, setIsVisible] = React.useState(false);
	const [pairs, setPairs] = React.useState<EnvPair[]>(() =>
		parseEnvString(value),
	);

	React.useEffect(() => {
		// Update pairs when value changes externally
		setPairs(parseEnvString(value));
	}, [value]);

	const updatePair = (
		index: number,
		field: keyof EnvPair,
		newValue: string,
	) => {
		const newPairs = pairs.map((pair, i) =>
			i === index ? { ...pair, [field]: newValue } : pair,
		);
		setPairs(newPairs);
		onChange(toEnvString(newPairs));
	};

	const addPair = () => {
		setPairs([...pairs, { key: "", value: "" }]);
	};

	const removePair = (index: number) => {
		const newPairs = pairs.filter((_, i) => i !== index);
		if (newPairs.length === 0) {
			newPairs.push({ key: "", value: "" });
		}
		setPairs(newPairs);
		onChange(toEnvString(newPairs));
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-medium">Environment Variables</h3>
				<Toggle
					aria-label="Toggle visibility"
					pressed={isVisible}
					onPressedChange={setIsVisible}
				>
					{isVisible ? (
						<EyeIcon className="h-4 w-4 text-muted-foreground" />
					) : (
						<EyeOffIcon className="h-4 w-4 text-muted-foreground" />
					)}
				</Toggle>
			</div>

			<div className="space-y-2">
				{pairs.map((pair, index) => (
					<div key={index} className="flex gap-2 items-center">
						<Input
							placeholder="Key"
							value={pair.key}
							onChange={(e) => updatePair(index, "key", e.target.value)}
							className="flex-1"
						/>
						<Input
							type={isVisible ? "text" : "password"}
							placeholder="Value"
							value={pair.value}
							onChange={(e) => updatePair(index, "value", e.target.value)}
							className="flex-1"
						/>
						<Button
							variant="ghost"
							size="icon"
							type="button"
							onClick={() => removePair(index)}
						>
							<TrashIcon className="h-4 w-4" />
						</Button>
					</div>
				))}
			</div>

			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={addPair}
				className="w-full mt-2"
			>
				<PlusIcon className="h-4 w-4 mr-2" />
				Add Variable
			</Button>
		</div>
	);
};
