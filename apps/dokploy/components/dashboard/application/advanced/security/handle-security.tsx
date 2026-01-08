import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

const AddSecuritychema = z.object({
	username: z.string().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
});

type AddSecurity = z.infer<typeof AddSecuritychema>;

interface Props {
	applicationId: string;
	securityId?: string;
	children?: React.ReactNode;
}

export const HandleSecurity = ({
	applicationId,
	securityId,
	children = <PlusIcon className="h-4 w-4" />,
}: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data } = api.security.one.useQuery(
		{
			securityId: securityId ?? "",
		},
		{
			enabled: !!securityId,
		},
	);

	const { mutateAsync, isLoading, error, isError } = securityId
		? api.security.update.useMutation()
		: api.security.create.useMutation();

	const form = useForm<AddSecurity>({
		defaultValues: {
			username: "",
			password: "",
		},
		resolver: zodResolver(AddSecuritychema),
	});

	useEffect(() => {
		form.reset({
			username: data?.username || "",
			password: data?.password || "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddSecurity) => {
		await mutateAsync({
			applicationId,
			...data,
			securityId: securityId || "",
		})
			.then(async () => {
				toast.success(securityId ? "Security Updated" : "Security Created");
				await utils.application.one.invalidate({
					applicationId,
				});
				await utils.application.readTraefikConfig.invalidate({
					applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					securityId
						? "Error updating the security"
						: "Error creating security",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{securityId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>{children}</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Security</DialogTitle>
					<DialogDescription>
						{securityId ? "Update" : "Add"} security to your application
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-security"
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
											<Input placeholder="test1" {...field} />
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
											<Input placeholder="test" type="password" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-add-security"
							type="submit"
						>
							{securityId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
