import { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlusIcon, X } from "lucide-react";

interface PlacementFormProps {
	form: UseFormReturn<any>;
}

export const PlacementForm = ({ form }: PlacementFormProps) => {
	const placementValue = form.watch("placementSwarm");
	let parsed: {
		Constraints?: string[];
		Preferences?: Array<{ Spread: { SpreadDescriptor: string } }>;
		MaxReplicas?: number;
		Platforms?: Array<{ Architecture: string; OS: string }>;
	} = {};

	if (placementValue) {
		try {
			parsed =
				typeof placementValue === "string" ? JSON.parse(placementValue) : placementValue;
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updatePlacement = (field: string, value: any) => {
		const updated = { ...parsed, [field]: value };
		form.setValue("placementSwarm", JSON.stringify(updated, null, 2));
	};

	const addConstraint = () => {
		const constraints = parsed.Constraints || [];
		updatePlacement("Constraints", [...constraints, ""]);
	};

	const updateConstraint = (index: number, value: string) => {
		const constraints = [...(parsed.Constraints || [])];
		constraints[index] = value;
		updatePlacement("Constraints", constraints);
	};

	const removeConstraint = (index: number) => {
		const constraints = [...(parsed.Constraints || [])];
		constraints.splice(index, 1);
		updatePlacement("Constraints", constraints);
	};

	const addPreference = () => {
		const preferences = parsed.Preferences || [];
		updatePlacement("Preferences", [
			...preferences,
			{ Spread: { SpreadDescriptor: "" } },
		]);
	};

	const updatePreference = (index: number, value: string) => {
		const preferences = [...(parsed.Preferences || [])];
		preferences[index] = { Spread: { SpreadDescriptor: value } };
		updatePlacement("Preferences", preferences);
	};

	const removePreference = (index: number) => {
		const preferences = [...(parsed.Preferences || [])];
		preferences.splice(index, 1);
		updatePlacement("Preferences", preferences);
	};

	const addPlatform = () => {
		const platforms = parsed.Platforms || [];
		updatePlacement("Platforms", [...platforms, { Architecture: "", OS: "" }]);
	};

	const updatePlatform = (index: number, field: "Architecture" | "OS", value: string) => {
		const platforms = [...(parsed.Platforms || [])];
		platforms[index] = { ...platforms[index], [field]: value };
		updatePlacement("Platforms", platforms);
	};

	const removePlatform = (index: number) => {
		const platforms = [...(parsed.Platforms || [])];
		platforms.splice(index, 1);
		updatePlacement("Platforms", platforms);
	};

	return (
		<FormField
			control={form.control}
			name="placementSwarm"
			render={() => (
				<FormItem>
					<FormLabel>Placement</FormLabel>
					<FormDescription>
						Configure where services should be placed in the cluster
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							<div className="space-y-2">
								<FormLabel className="text-sm">Constraints</FormLabel>
								{(parsed.Constraints || []).map((constraint, index) => (
									<div key={index} className="flex gap-2">
										<Input
											value={constraint}
											onChange={(e) => updateConstraint(index, e.target.value)}
											placeholder="node.role==manager"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeConstraint(index)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addConstraint}
								>
									<PlusIcon className="h-4 w-4 mr-2" />
									Add Constraint
								</Button>
							</div>

							<div className="space-y-2">
								<FormLabel className="text-sm">Spread Preferences</FormLabel>
								{(parsed.Preferences || []).map((pref, index) => (
									<div key={index} className="flex gap-2">
										<Input
											value={pref.Spread.SpreadDescriptor}
											onChange={(e) => updatePreference(index, e.target.value)}
											placeholder="node.labels.region"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removePreference(index)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addPreference}
								>
									<PlusIcon className="h-4 w-4 mr-2" />
									Add Preference
								</Button>
							</div>

							<div className="space-y-2">
								<FormLabel className="text-sm">Max Replicas</FormLabel>
								<NumberInput
									value={parsed.MaxReplicas || ""}
									onChange={(e) =>
										updatePlacement(
											"MaxReplicas",
											e.target.value === "" ? undefined : Number(e.target.value),
										)
									}
									placeholder="10"
								/>
							</div>

							<div className="space-y-2">
								<FormLabel className="text-sm">Platforms</FormLabel>
								{(parsed.Platforms || []).map((platform, index) => (
									<div key={index} className="flex gap-2">
										<Input
											value={platform.Architecture}
											onChange={(e) =>
												updatePlatform(index, "Architecture", e.target.value)
											}
											placeholder="amd64"
										/>
										<Input
											value={platform.OS}
											onChange={(e) => updatePlatform(index, "OS", e.target.value)}
											placeholder="linux"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removePlatform(index)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addPlatform}
								>
									<PlusIcon className="h-4 w-4 mr-2" />
									Add Platform
								</Button>
							</div>
						</div>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

