import { AlertTriangle, Server, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";

interface SelfHostedRegistryProps {}

export const SelfHostedRegistry = ({}: SelfHostedRegistryProps) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [formData, setFormData] = useState({
		username: "registry",
		password: "registry123",
		domain: "registry.localhost",
		registryName: "Default Self Hosted Registry",
	});

	const {
		mutateAsync: createSimpleRegistry,
		error: simpleError,
		isError: isSimpleError,
	} = api.registry.createSimpleRegistry.useMutation();

	const handleInputChange = (field: string, value: string) => {
		setFormData((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);

		try {
			await createSimpleRegistry({
				username: formData.username,
				password: formData.password,
				domain: formData.domain,
				registryName: formData.registryName,
			});

			await utils.registry.all.invalidate();
			toast.success("Self-hosted registry setup completed successfully!");
			setIsOpen(false);
		} catch (error) {
			console.error("Registry setup error:", error);
			toast.error("Failed to create self-hosted registry setup");
		} finally {
			setIsLoading(false);
		}
	};

	// Always show the button, regardless of existing registries

	return (
		<div className="flex flex-col gap-2">
			{/* Error Display */}
			{isSimpleError && (
				<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
					<AlertTriangle className="text-red-600 dark:text-red-400" />
					<span className="text-sm text-red-600 dark:text-red-400">
						{simpleError?.message || "Self-hosted registry setup failed"}
					</span>
				</div>
			)}

			{/* Self Hosted Registry Button */}
			<div className="flex gap-2">
				<Dialog open={isOpen} onOpenChange={setIsOpen}>
					<DialogTrigger asChild>
						<Button className="cursor-pointer space-x-3 bg-green-600 hover:bg-green-700">
							<Server className="h-4 w-4" />
							Self Hosted Registry
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>Create Self-Hosted Registry</DialogTitle>
							<DialogDescription>
								Configure your custom self-hosted Docker registry settings.
							</DialogDescription>
						</DialogHeader>
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="registryName">Registry Name</Label>
								<Input
									id="registryName"
									value={formData.registryName}
									onChange={(e) =>
										handleInputChange("registryName", e.target.value)
									}
									placeholder="Default Self Hosted Registry"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="username">Username</Label>
								<Input
									id="username"
									value={formData.username}
									onChange={(e) =>
										handleInputChange("username", e.target.value)
									}
									placeholder="registry"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									value={formData.password}
									onChange={(e) =>
										handleInputChange("password", e.target.value)
									}
									placeholder="registry123"
									required
									minLength={6}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="domain">Domain</Label>
								<Input
									id="domain"
									value={formData.domain}
									onChange={(e) => handleInputChange("domain", e.target.value)}
									placeholder="registry.localhost"
									required
								/>
								<p className="text-xs text-muted-foreground">
									Use localhost domains for local testing (e.g.,
									registry.localhost)
								</p>
							</div>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsOpen(false)}
								>
									Cancel
								</Button>
								<Button type="submit" isLoading={isLoading}>
									Create Registry
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
};
