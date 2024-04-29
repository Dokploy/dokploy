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
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const addUser = z.object({
	email: z
		.string()
		.min(1, "Email is required")
		.email({ message: "Invalid email" }),
});

type AddUser = z.infer<typeof addUser>;

export const AddUser = () => {
	const utils = api.useUtils();

	const { mutateAsync, isError, error, isLoading } =
		api.admin.createUserInvitation.useMutation();

	const form = useForm<AddUser>({
		defaultValues: {
			email: "",
		},
		resolver: zodResolver(addUser),
	});
	useEffect(() => {
		form.reset();
	}, [form, form.formState.isSubmitSuccessful, form.reset]);

	const onSubmit = async (data: AddUser) => {
		await mutateAsync({
			email: data.email,
		})
			.then(async () => {
				toast.success("Invitation created");
				await utils.user.all.invalidate();
			})
			.catch(() => {
				toast.error("Error to create the invitation");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<Button>Add User</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add User</DialogTitle>
					<DialogDescription>Invite a new user</DialogDescription>
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
						id="hook-form-add-user"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4 "
					>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>Email</FormLabel>
										<FormControl>
											<Input placeholder={"email@dokploy.com"} {...field} />
										</FormControl>
										<FormDescription>
											This will be the email of the new user
										</FormDescription>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						<DialogFooter className="flex w-full flex-row">
							<Button
								isLoading={isLoading}
								form="hook-form-add-user"
								type="submit"
							>
								Create
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
