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
import { Button } from "@/components/ui/button";
import { PlusIcon, X } from "lucide-react";

interface LabelsFormProps {
	form: UseFormReturn<any>;
}

export const LabelsForm = ({ form }: LabelsFormProps) => {
	const labelsValue = form.watch("labelsSwarm");
	let parsed: Record<string, string> = {};

	if (labelsValue) {
		try {
			parsed = typeof labelsValue === "string" ? JSON.parse(labelsValue) : labelsValue;
			if (typeof parsed !== "object" || Array.isArray(parsed)) {
				parsed = {};
			}
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updateLabels = (labels: Record<string, string>) => {
		form.setValue("labelsSwarm", JSON.stringify(labels, null, 2));
	};

	const addLabel = () => {
		updateLabels({ ...parsed, "": "" });
	};

	const updateLabel = (oldKey: string, newKey: string, value: string, isKey: boolean) => {
		const labels = { ...parsed };
		if (isKey) {
			// Update key
			const oldValue = labels[oldKey];
			delete labels[oldKey];
			labels[newKey] = oldValue || "";
		} else {
			// Update value
			labels[oldKey] = value;
		}
		updateLabels(labels);
	};

	const removeLabel = (key: string) => {
		const labels = { ...parsed };
		delete labels[key];
		updateLabels(labels);
	};

	return (
		<FormField
			control={form.control}
			name="labelsSwarm"
			render={() => (
				<FormItem>
					<FormLabel>Labels</FormLabel>
					<FormDescription>
						Add custom labels as key-value pairs for your service
					</FormDescription>
					<FormControl>
						<div className="space-y-2">
							{Object.entries(parsed).map(([key, value]) => (
								<div key={key} className="flex gap-2">
									<Input
										value={key}
										onChange={(e) => updateLabel(key, e.target.value, value, true)}
										placeholder="com.example.app.name"
									/>
									<Input
										value={value}
										onChange={(e) => updateLabel(key, key, e.target.value, false)}
										placeholder="my-app"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => removeLabel(key)}
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button type="button" variant="outline" size="sm" onClick={addLabel}>
								<PlusIcon className="h-4 w-4 mr-2" />
								Add Label
							</Button>
						</div>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

