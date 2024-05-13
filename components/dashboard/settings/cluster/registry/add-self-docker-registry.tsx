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
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Container } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const AddRegistrySchema = z.object({
	username: z.string().min(1, {
		message: "Username is required",
	}),
	password: z.string().min(1, {
		message: "Password is required",
	}),
	registryUrl: z.string().min(1, {
		message: "Registry URL is required",
	}),
});

type AddRegistry = z.infer<typeof AddRegistrySchema>;

export const AddSelfHostedRegistry = () => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { mutateAsync, error, isError, isLoading } =
		api.registry.enableSelfHostedRegistry.useMutation();
	const router = useRouter();
	const form = useForm<AddRegistry>({
		defaultValues: {
			username: "siumauricio",
			password: "Password123",
			registryUrl: "https://registry.dokploy.com",
		},
		resolver: zodResolver(AddRegistrySchema),
	});

	useEffect(() => {
		form.reset({
			registryUrl: "https://registry.dokploy.com",
			username: "siumauricio",
			password: "Password123",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful]);

	const onSubmit = async (data: AddRegistry) => {
		await mutateAsync({
			registryUrl: data.registryUrl,
			username: data.username,
			password: data.password,
		})
			.then(async (data) => {
				await utils.registry.all.invalidate();
				toast.success("Self Hosted Registry Created");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to create a self hosted registry");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>
					<Container className="h-4 w-4" />
					Enable Self Hosted Registry
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:m:max-w-lg ">
				<DialogHeader>
					<DialogTitle>Add a self hosted registry</DialogTitle>
					<DialogDescription>
						Fill the next fields to add a self hosted registry.
					</DialogDescription>
				</DialogHeader>
				{isError && (
					<div className="flex flex-row gap-4 rounded-lg bg-red-50 p-2 dark:bg-red-950">
						<AlertTriangle className="text-red-600 dark:text-red-400" />
						<span className="text-sm text-red-600 dark:text-red-400">
							{error?.message}
						</span>
					</div>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="username"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Username</FormLabel>
										<FormControl>
											<Input placeholder="Username" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Password</FormLabel>
										<FormControl>
											<Input
												placeholder="Password"
												{...field}
												type="password"
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="registryUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Registry URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://registry.dokploy.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Point a DNS record to the VPS IP address.
										</FormDescription>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter>
							<Button isLoading={isLoading} type="submit">
								Create
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
