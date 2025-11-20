import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { HetznerIcon } from "@/components/icons/cloud-provider-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { CloudProvider } from "@dokploy/server/providers/types-client";

const addHetznerProviderSchema = z.object({
	apiToken: z.string().min(1, "API Token is required"),
});

type AddHetznerProvider = z.infer<typeof addHetznerProviderSchema>;

export const AddHetznerProvider = () => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isLoading } =
		api.cloudProvider.credentials.upsert.useMutation();

	const form = useForm<AddHetznerProvider>({
		defaultValues: {
			apiToken: "",
		},
		resolver: zodResolver(addHetznerProviderSchema),
	});

	const onSubmit = async (data: AddHetznerProvider) => {
		await mutateAsync({
			provider: CloudProvider.HETZNER,
			apiToken: data.apiToken,
		})
			.then(async () => {
				toast.success("Hetzner credentials added successfully!");
				await utils.cloudProvider.credentials.list.invalidate();
				setIsOpen(false);
				form.reset();
			})
			.catch((error) => {
				toast.error(error?.message || "Error adding Hetzner credentials");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="flex items-center space-x-1">
					<HetznerIcon className="size-4" />
					<span>Hetzner</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HetznerIcon className="size-5" />
						Add Hetzner Cloud Provider
					</DialogTitle>
					<DialogDescription>
						Enter your Hetzner Cloud API token to enable one-click server
						provisioning
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="apiToken"
							render={({ field }) => (
								<FormItem>
									<FormLabel>API Token</FormLabel>
									<FormControl>
										<Input
											placeholder="Enter your Hetzner Cloud API token"
											{...field}
											type="password"
										/>
									</FormControl>
									<FormDescription>
										You can create an API token in your{" "}
										<a
											href="https://console.hetzner.cloud/"
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary hover:underline"
										>
											Hetzner Cloud Console
										</a>{" "}
										under Security → API Tokens
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => {
									setIsOpen(false);
									form.reset();
								}}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Add Provider
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
