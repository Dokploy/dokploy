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

interface UpdateConfigFormProps {
	form: UseFormReturn<any>;
	fieldName: "updateConfigSwarm" | "rollbackConfigSwarm";
	label: string;
}

export const UpdateConfigForm = ({
	form,
	fieldName,
	label,
}: UpdateConfigFormProps) => {
	const configValue = form.watch(fieldName);
	let parsed: {
		Parallelism?: number;
		Delay?: number;
		FailureAction?: string;
		Monitor?: number;
		MaxFailureRatio?: number;
		Order?: string;
	} = {};

	if (configValue) {
		try {
			parsed =
				typeof configValue === "string" ? JSON.parse(configValue) : configValue;
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updateConfig = (field: string, value: any) => {
		const updated = { ...parsed, [field]: value };
		form.setValue(fieldName, JSON.stringify(updated, null, 2));
	};

	return (
		<FormField
			control={form.control}
			name={fieldName}
			render={() => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormDescription>
						Configure how service updates are rolled out
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<FormLabel className="text-sm">Parallelism</FormLabel>
									<NumberInput
										min={1}
										value={parsed.Parallelism || ""}
										onChange={(e) =>
											updateConfig(
												"Parallelism",
												e.target.value === "" ? 1 : Number(e.target.value),
											)
										}
										placeholder="1"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Delay (ms)</FormLabel>
									<NumberInput
										value={parsed.Delay || ""}
										onChange={(e) =>
											updateConfig(
												"Delay",
												e.target.value === ""
													? undefined
													: Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Failure Action</FormLabel>
									<Select
										value={parsed.FailureAction || "pause"}
										onValueChange={(value) =>
											updateConfig(
												"FailureAction",
												value === "pause" ? undefined : value,
											)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select failure action" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="pause">Pause</SelectItem>
											<SelectItem value="continue">Continue</SelectItem>
											<SelectItem value="rollback">Rollback</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Monitor (ms)</FormLabel>
									<NumberInput
										value={parsed.Monitor || ""}
										onChange={(e) =>
											updateConfig(
												"Monitor",
												e.target.value === ""
													? undefined
													: Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">
										Max Failure Ratio (%)
									</FormLabel>
									<NumberInput
										min={0}
										max={100}
										value={parsed.MaxFailureRatio || ""}
										onChange={(e) =>
											updateConfig(
												"MaxFailureRatio",
												e.target.value === ""
													? undefined
													: Number(e.target.value),
											)
										}
										placeholder="10"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Order</FormLabel>
									<Select
										value={parsed.Order || "start-first"}
										onValueChange={(value) => updateConfig("Order", value)}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select order" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="start-first">Start First</SelectItem>
											<SelectItem value="stop-first">Stop First</SelectItem>
										</SelectContent>
									</Select>
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
