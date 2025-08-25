import { AlertBlock } from "@/components/shared/alert-block";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const buildConcurrencySchema = z.object({
	concurrency: z
		.string()
		.min(1, "Concurrency is required")
		.refine((val) => {
			const num = Number.parseInt(val, 10);
			return !Number.isNaN(num) && num >= 1;
		}, "Concurrency must be at least 1")
		.refine((val) => {
			const num = Number.parseInt(val, 10);
			return !Number.isNaN(num) && num <= 20;
		}, "Concurrency cannot exceed 20"),
});

type BuildConcurrencyForm = z.infer<typeof buildConcurrencySchema>;

export const BuildConcurrencyModal = ({ serverId }: { serverId?: string }) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data: buildsConcurrency, refetch } =
		api.settings.getBuildsConcurrency.useQuery({ serverId });
	const { mutateAsync: changeBuildsConcurrency, isLoading } =
		api.settings.changeBuildsConcurrency.useMutation();

	const form = useForm<BuildConcurrencyForm>({
		resolver: zodResolver(buildConcurrencySchema),
		defaultValues: {
			concurrency: (buildsConcurrency || 1).toString(),
		},
	});

	useEffect(() => {
		form.reset({
			concurrency: (buildsConcurrency || 1).toString(),
		});
	}, [buildsConcurrency]);

	const onSubmit = async (data: BuildConcurrencyForm) => {
		try {
			const concurrency = Number.parseInt(data.concurrency, 10);
			await changeBuildsConcurrency({ concurrency, serverId });
			toast.success("Build concurrency updated successfully");
			setIsOpen(false);
			form.reset({
				concurrency: (concurrency || 1).toString(),
			});
			refetch();
		} catch {
			toast.error("Failed to update build concurrency");
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer"
					onSelect={(e) => e.preventDefault()}
				>
					<span>Change builds concurrency</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Change Build Concurrency</DialogTitle>
					<DialogDescription>
						Set the number of concurrent builds that can run simultaneously.
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="warning">
					<div className="font-medium mb-2">Resource Requirements:</div>
					<div className="text-sm space-y-1">
						<p>Each concurrent build requires approximately:</p>
						<ul className="list-disc list-inside ml-2">
							<li>2 vCPUs</li>
							<li>4GB of RAM</li>
						</ul>
						<p className="mt-2">
							Make sure your server has sufficient resources to handle the
							selected number of concurrent builds.
						</p>
					</div>
				</AlertBlock>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="concurrency"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Concurrent Builds</FormLabel>
									<FormControl>
										<Input
											type="number"
											placeholder="1"
											{...field}
											value={field.value || ""}
											onChange={(e) => {
												const value = e.target.value;
												// Allow empty input or valid numbers
												if (value === "" || /^\d+$/.test(value)) {
													field.onChange(value);
												}
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" isLoading={isLoading}>
								Update Concurrency
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
