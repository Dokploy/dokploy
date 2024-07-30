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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { SquarePen } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const updateUserSchema = z.object({
	email: z
		.string()
		.min(1, "Email is required")
		.email({ message: "Invalid email" }),
	password: z.string(),
});

type UpdateUser = z.infer<typeof updateUserSchema>;

interface Props {
	authId: string;
}

export const UpdateUser = ({ authId }: Props) => {
	const utils = api.useUtils();
	const { mutateAsync, error, isError, isLoading } =
		api.auth.updateByAdmin.useMutation();
	const { data } = api.auth.one.useQuery(
		{
			id: authId,
		},
		{
			enabled: !!authId,
		},
	);

	const form = useForm<UpdateUser>({
		defaultValues: {
			email: "",
			password: "",
		},
		resolver: zodResolver(updateUserSchema),
	});
	useEffect(() => {
		if (data) {
			form.reset({
				email: data.email || "",
				password: "",
			});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: UpdateUser) => {
		await mutateAsync({
			email: formData.email === data?.email ? null : formData.email,
			password: formData.password,
			id: authId,
		})
			.then(() => {
				toast.success("User updated succesfully");
				utils.user.all.invalidate();
			})
			.catch(() => {
				toast.error("Error to update the user");
			})
			.finally(() => {});
	};

	return (
		<Dialog>
			<DialogTrigger asChild className="w-fit">
				<Button
					variant="ghost"
					className=" cursor-pointer space-x-3 w-fit"
					onSelect={(e) => e.preventDefault()}
				>
					<SquarePen className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Update User</DialogTitle>
					<DialogDescription>Update the user</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="grid gap-4">
					<div className="grid items-center gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								id="hook-form-update-user"
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Email</FormLabel>
											<FormControl>
												<Input placeholder="XNl5C@example.com" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="*******"
													{...field}
												/>
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>
								<DialogFooter>
									<Button
										form="hook-form-update-user"
										type="submit"
										isLoading={isLoading}
									>
										Update
									</Button>
								</DialogFooter>
							</form>
						</Form>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
