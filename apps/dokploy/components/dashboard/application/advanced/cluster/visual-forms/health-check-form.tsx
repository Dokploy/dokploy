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

interface HealthCheckFormProps {
	form: UseFormReturn<any>;
}

export const HealthCheckForm = ({ form }: HealthCheckFormProps) => {
	const healthCheckValue = form.watch("healthCheckSwarm");
	let parsed: {
		Test?: string[];
		Interval?: number;
		Timeout?: number;
		StartPeriod?: number;
		Retries?: number;
	} = {};

	if (healthCheckValue) {
		try {
			parsed =
				typeof healthCheckValue === "string"
					? JSON.parse(healthCheckValue)
					: healthCheckValue;
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updateHealthCheck = (field: string, value: any) => {
		const updated = { ...parsed, [field]: value };
		form.setValue("healthCheckSwarm", JSON.stringify(updated, null, 2));
	};

	const addTestCommand = () => {
		const tests = parsed.Test || [];
		updateHealthCheck("Test", [...tests, ""]);
	};

	const updateTestCommand = (index: number, value: string) => {
		const tests = [...(parsed.Test || [])];
		tests[index] = value;
		updateHealthCheck("Test", tests);
	};

	const removeTestCommand = (index: number) => {
		const tests = [...(parsed.Test || [])];
		tests.splice(index, 1);
		updateHealthCheck("Test", tests);
	};

	return (
		<FormField
			control={form.control}
			name="healthCheckSwarm"
			render={() => (
				<FormItem>
					<FormLabel>Health Check</FormLabel>
					<FormDescription>
						Configure health check commands and timing settings
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							<div className="space-y-2">
								<FormLabel className="text-sm">Test Commands</FormLabel>
								{(parsed.Test || []).map((test, index) => (
									<div key={index} className="flex gap-2">
										<Input
											value={test}
											onChange={(e) => updateTestCommand(index, e.target.value)}
											placeholder="CMD-SHELL, curl -f http://localhost:3000/health"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeTestCommand(index)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addTestCommand}
								>
									<PlusIcon className="h-4 w-4 mr-2" />
									Add Test Command
								</Button>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<FormLabel className="text-sm">Interval (ms)</FormLabel>
									<NumberInput
										value={parsed.Interval || ""}
										onChange={(e) =>
											updateHealthCheck(
												"Interval",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Timeout (ms)</FormLabel>
									<NumberInput
										value={parsed.Timeout || ""}
										onChange={(e) =>
											updateHealthCheck(
												"Timeout",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Start Period (ms)</FormLabel>
									<NumberInput
										value={parsed.StartPeriod || ""}
										onChange={(e) =>
											updateHealthCheck(
												"StartPeriod",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10000"
									/>
								</div>
								<div className="space-y-2">
									<FormLabel className="text-sm">Retries</FormLabel>
									<NumberInput
										value={parsed.Retries || ""}
										onChange={(e) =>
											updateHealthCheck(
												"Retries",
												e.target.value === "" ? undefined : Number(e.target.value),
											)
										}
										placeholder="10"
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

