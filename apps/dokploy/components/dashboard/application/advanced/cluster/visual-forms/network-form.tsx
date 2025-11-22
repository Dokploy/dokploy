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

interface NetworkFormProps {
	form: UseFormReturn<any>;
}

export const NetworkForm = ({ form }: NetworkFormProps) => {
	const networkValue = form.watch("networkSwarm");
	let parsed: Array<{
		Target?: string;
		Aliases?: string[];
		DriverOpts?: Record<string, string>;
	}> = [];

	if (networkValue) {
		try {
			parsed =
				typeof networkValue === "string"
					? JSON.parse(networkValue)
					: networkValue;
			if (!Array.isArray(parsed)) {
				parsed = [];
			}
		} catch {
			// Invalid JSON, ignore
		}
	}

	const updateNetwork = (networks: typeof parsed) => {
		form.setValue("networkSwarm", JSON.stringify(networks, null, 2));
	};

	const addNetwork = () => {
		updateNetwork([...parsed, { Target: "", Aliases: [], DriverOpts: {} }]);
	};

	const updateNetworkField = (
		index: number,
		field: "Target" | "Aliases" | "DriverOpts",
		value: any,
	) => {
		const networks = [...parsed];
		networks[index] = { ...networks[index], [field]: value };
		updateNetwork(networks);
	};

	const addAlias = (networkIndex: number) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const aliases = network.Aliases || [];
		network.Aliases = [...aliases, ""];
		updateNetwork(networks);
	};

	const updateAlias = (
		networkIndex: number,
		aliasIndex: number,
		value: string,
	) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const aliases = [...(network.Aliases || [])];
		aliases[aliasIndex] = value;
		network.Aliases = aliases;
		updateNetwork(networks);
	};

	const removeAlias = (networkIndex: number, aliasIndex: number) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const aliases = [...(network.Aliases || [])];
		aliases.splice(aliasIndex, 1);
		network.Aliases = aliases;
		updateNetwork(networks);
	};

	const addDriverOpt = (networkIndex: number) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const driverOpts = network.DriverOpts || {};
		network.DriverOpts = { ...driverOpts, "": "" };
		updateNetwork(networks);
	};

	const updateDriverOpt = (
		networkIndex: number,
		key: string,
		value: string,
		isKey: boolean,
	) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const driverOpts = { ...(network.DriverOpts || {}) };
		if (isKey) {
			// Update key
			const oldValue = driverOpts[key];
			delete driverOpts[key];
			driverOpts[value] = oldValue || "";
		} else {
			// Update value
			driverOpts[key] = value;
		}
		network.DriverOpts = driverOpts;
		updateNetwork(networks);
	};

	const removeDriverOpt = (networkIndex: number, key: string) => {
		const networks = [...parsed];
		const network = networks[networkIndex];
		if (!network) return;
		const driverOpts = { ...(network.DriverOpts || {}) };
		delete driverOpts[key];
		network.DriverOpts = driverOpts;
		updateNetwork(networks);
	};

	const removeNetwork = (index: number) => {
		const networks = [...parsed];
		networks.splice(index, 1);
		updateNetwork(networks);
	};

	return (
		<FormField
			control={form.control}
			name="networkSwarm"
			render={() => (
				<FormItem>
					<FormLabel>Network Configuration</FormLabel>
					<FormDescription>
						Configure network targets, aliases, and driver options
					</FormDescription>
					<FormControl>
						<div className="space-y-4">
							{parsed.map((network, networkIndex) => (
								<div
									key={networkIndex}
									className="border rounded-lg p-4 space-y-4"
								>
									<div className="flex justify-between items-center">
										<FormLabel className="text-sm">
											Network {networkIndex + 1}
										</FormLabel>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeNetwork(networkIndex)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>

									<div className="space-y-2">
										<FormLabel className="text-sm">Target Network</FormLabel>
										<Input
											value={network.Target || ""}
											onChange={(e) =>
												updateNetworkField(
													networkIndex,
													"Target",
													e.target.value,
												)
											}
											placeholder="dokploy-network"
										/>
									</div>

									<div className="space-y-2">
										<FormLabel className="text-sm">Aliases</FormLabel>
										{(network.Aliases || []).map((alias, aliasIndex) => (
											<div key={aliasIndex} className="flex gap-2">
												<Input
													value={alias}
													onChange={(e) =>
														updateAlias(
															networkIndex,
															aliasIndex,
															e.target.value,
														)
													}
													placeholder="alias-name"
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => removeAlias(networkIndex, aliasIndex)}
												>
													<X className="h-4 w-4" />
												</Button>
											</div>
										))}
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => addAlias(networkIndex)}
										>
											<PlusIcon className="h-4 w-4 mr-2" />
											Add Alias
										</Button>
									</div>

									<div className="space-y-2">
										<FormLabel className="text-sm">Driver Options</FormLabel>
										{Object.entries(network.DriverOpts || {}).map(
											([key, value], optIndex) => (
												<div key={optIndex} className="flex gap-2">
													<Input
														value={key}
														onChange={(e) =>
															updateDriverOpt(
																networkIndex,
																key,
																e.target.value,
																true,
															)
														}
														placeholder="Option key"
													/>
													<Input
														value={value}
														onChange={(e) =>
															updateDriverOpt(
																networkIndex,
																key,
																e.target.value,
																false,
															)
														}
														placeholder="Option value"
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => removeDriverOpt(networkIndex, key)}
													>
														<X className="h-4 w-4" />
													</Button>
												</div>
											),
										)}
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => addDriverOpt(networkIndex)}
										>
											<PlusIcon className="h-4 w-4 mr-2" />
											Add Driver Option
										</Button>
									</div>
								</div>
							))}

							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addNetwork}
							>
								<PlusIcon className="h-4 w-4 mr-2" />
								Add Network
							</Button>
						</div>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};
