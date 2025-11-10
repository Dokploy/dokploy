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

interface ServiceModeFormProps {
	form: UseFormReturn<any>;
}

type ServiceModeType = "Replicated" | "Global" | "ReplicatedJob" | "GlobalJob";

export const ServiceModeForm = ({ form }: ServiceModeFormProps) => {
	const modeValue = form.watch("modeSwarm");
	let parsedMode: {
		type?: ServiceModeType;
		replicas?: number;
		maxConcurrent?: number;
		totalCompletions?: number;
	} = {};

	if (modeValue) {
		try {
			const parsed = typeof modeValue === "string" ? JSON.parse(modeValue) : modeValue;
			if (parsed.Replicated) {
				parsedMode = { type: "Replicated", replicas: parsed.Replicated.Replicas };
			} else if (parsed.Global) {
				parsedMode = { type: "Global" };
			} else if (parsed.ReplicatedJob) {
				parsedMode = {
					type: "ReplicatedJob",
					maxConcurrent: parsed.ReplicatedJob.MaxConcurrent,
					totalCompletions: parsed.ReplicatedJob.TotalCompletions,
				};
			} else if (parsed.GlobalJob) {
				parsedMode = { type: "GlobalJob" };
			}
		} catch {
			// Invalid JSON, ignore
		}
	}

	const handleModeChange = (type: ServiceModeType) => {
		let newValue: any = {};
		if (type === "Replicated") {
			newValue = { Replicated: { Replicas: parsedMode.replicas || 1 } };
		} else if (type === "Global") {
			newValue = { Global: {} };
		} else if (type === "ReplicatedJob") {
			newValue = {
				ReplicatedJob: {
					MaxConcurrent: parsedMode.maxConcurrent || 1,
					TotalCompletions: parsedMode.totalCompletions || 1,
				},
			};
		} else if (type === "GlobalJob") {
			newValue = { GlobalJob: {} };
		}
		form.setValue("modeSwarm", JSON.stringify(newValue, null, 2));
	};

	const handleReplicasChange = (replicas: number) => {
		if (parsedMode.type === "Replicated") {
			const newValue = { Replicated: { Replicas: replicas } };
			form.setValue("modeSwarm", JSON.stringify(newValue, null, 2));
		}
	};

	const handleJobConfigChange = (field: "maxConcurrent" | "totalCompletions", value: number) => {
		if (parsedMode.type === "ReplicatedJob") {
			const newValue = {
				ReplicatedJob: {
					MaxConcurrent: field === "maxConcurrent" ? value : parsedMode.maxConcurrent || 1,
					TotalCompletions:
						field === "totalCompletions" ? value : parsedMode.totalCompletions || 1,
				},
			};
			form.setValue("modeSwarm", JSON.stringify(newValue, null, 2));
		}
	};

	return (
		<FormField
			control={form.control}
			name="modeSwarm"
			render={() => (
				<FormItem>
					<FormLabel>Service Mode</FormLabel>
					<FormDescription>
						Select the service mode and configure replicas or job settings
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							<Select
								value={parsedMode.type || "Replicated"}
								onValueChange={(value) => handleModeChange(value as ServiceModeType)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select service mode" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Replicated">Replicated</SelectItem>
									<SelectItem value="Global">Global</SelectItem>
									<SelectItem value="ReplicatedJob">Replicated Job</SelectItem>
									<SelectItem value="GlobalJob">Global Job</SelectItem>
								</SelectContent>
							</Select>

							{parsedMode.type === "Replicated" && (
								<div className="space-y-2">
									<FormLabel className="text-sm">Number of Replicas</FormLabel>
									<NumberInput
										min={1}
										value={parsedMode.replicas || 1}
										onChange={(e) =>
											handleReplicasChange(
												e.target.value === "" ? 1 : Number(e.target.value),
											)
										}
										placeholder="1"
									/>
								</div>
							)}

							{parsedMode.type === "ReplicatedJob" && (
								<div className="space-y-4">
									<div className="space-y-2">
										<FormLabel className="text-sm">Max Concurrent</FormLabel>
										<NumberInput
											min={1}
											value={parsedMode.maxConcurrent || 1}
											onChange={(e) =>
												handleJobConfigChange(
													"maxConcurrent",
													e.target.value === "" ? 1 : Number(e.target.value),
												)
											}
											placeholder="1"
										/>
									</div>
									<div className="space-y-2">
										<FormLabel className="text-sm">Total Completions</FormLabel>
										<NumberInput
											min={1}
											value={parsedMode.totalCompletions || 1}
											onChange={(e) =>
												handleJobConfigChange(
													"totalCompletions",
													e.target.value === "" ? 1 : Number(e.target.value),
												)
											}
											placeholder="1"
										/>
									</div>
								</div>
							)}
						</div>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

