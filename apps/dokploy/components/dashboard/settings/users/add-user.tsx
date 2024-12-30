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
import { PlusIcon } from "lucide-react";
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
			email: data.email.toLowerCase(),
		})
			.then(async () => {
				toast.success("Invitation created");
				await utils.user.all.invalidate();
			})
			.catch(() => {
				toast.error("Error creating the invitation");
			});
	};
	return (
		<Dialog>
			<DialogTrigger className="" asChild>
				<Button>
					<PlusIcon className="h-4 w-4" /> Add User
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add User</DialogTitle>
					<DialogDescription>Invite a new user</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

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
