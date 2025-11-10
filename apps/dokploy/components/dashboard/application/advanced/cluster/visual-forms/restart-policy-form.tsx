import { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { NumberInput } from "@/components/ui/input";

interface RestartPolicyFormProps {
	form: UseFormReturn<any>;
}

export const RestartPolicyForm = ({ form }: RestartPolicyFormProps) => {
	const restartPolicyValue = form.watch("restartPolicySwarm");
	let parsed: {
		Condition?: string;
		Delay?: number;
		MaxAttempts?: number;
		Window?: number;
	} = {};

	if (restartPolicyValue) {
		try {
			parsed =
				typeof restartPolicyValue === "string"
					? JSON.parse(restartPolicyValue)
					: restartPolicyValue;
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updateRestartPolicy = (field: string, value: any) => {
		const updated = { ...parsed, [field]: value };
		form.setValue("restartPolicySwarm", JSON.stringify(updated, null, 2));
	};

	return (
		<FormField
			control={form.control}
			name="restartPolicySwarm"
			render={() => (
				<FormItem>
					<FormLabel>Restart Policy</FormLabel>
					<FormDescription>
						Configure when and how the service should restart
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							<div className="space-y-2">
								<FormLabel className="text-sm">Condition</FormLabel>
								<Select
									value={parsed.Condition || "none"}
									onValueChange={(value) =>
										updateRestartPolicy("Condition", value === "none" ? undefined : value)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select condition" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">None</SelectItem>
										<SelectItem value="on-failure">On Failure</SelectItem>
										<SelectItem value="any">Any</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<FormLabel className="text-sm">Delay (ms)</FormLabel>
									<NumberInput
										value={parsed.Delay || ""}
										onChange={(e) =>
											updateRestartPolicy(
												"Delay",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Max Attempts</FormLabel>
									<NumberInput
										value={parsed.MaxAttempts || ""}
										onChange={(e) =>
											updateRestartPolicy(
												"MaxAttempts",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Window (ms)</FormLabel>
									<NumberInput
										value={parsed.Window || ""}
										onChange={(e) =>
											updateRestartPolicy(
												"Window",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
							</div>
						</div>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

