import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
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
import {
	createConverter,
	NumberInputWithSteps,
} from "@/components/ui/number-input";
import { api } from "@/utils/api";

const CPU_STEP = 0.25;
const MEMORY_STEP_MB = 256;

const formatNumber = (value: number, decimals = 2): string =>
	Number.isInteger(value) ? String(value) : value.toFixed(decimals);

const cpuConverter = createConverter(1_000_000_000, (cpu) =>
	cpu <= 0 ? "" : `${formatNumber(cpu)} CPU`,
);

const memoryConverter = createConverter(1024 * 1024, (mb) => {
	if (mb <= 0) return "";
	return mb >= 1024
		? `${formatNumber(mb / 1024)} GB`
		: `${formatNumber(mb)} MB`;
});

const profileSchema = z.object({
	name: z.string().min(1, "Name is required"),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface Props {
	groupId: string;
	profileId?: string;
}

export const HandleResourceProfile = ({ groupId, profileId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const {
		mutateAsync: createMutateAsync,
		isError,
		error,
		isPending,
	} = api.resourceProfile.createProfile.useMutation();
	const { mutateAsync: updateMutateAsync } =
		api.resourceProfile.updateProfile.useMutation();

	const { data: profile } = api.resourceProfile.oneProfile.useQuery(
		{ profileId: profileId || "" },
		{
			enabled: !!profileId && open,
			refetchOnWindowFocus: false,
		},
	);

	const form = useForm<ProfileForm>({
		defaultValues: {
			name: "",
			memoryReservation: "",
			memoryLimit: "",
			cpuReservation: "",
			cpuLimit: "",
		},
		resolver: zodResolver(profileSchema),
	});

	useEffect(() => {
		if (profile && open) {
			form.reset({
				name: profile.name,
				memoryReservation: profile.memoryReservation || "",
				memoryLimit: profile.memoryLimit || "",
				cpuReservation: profile.cpuReservation || "",
				cpuLimit: profile.cpuLimit || "",
			});
		}
	}, [profile, open, form]);

	useEffect(() => {
		if (!open) {
			form.reset({
				name: "",
				memoryReservation: "",
				memoryLimit: "",
				cpuReservation: "",
				cpuLimit: "",
			});
		}
	}, [open, form]);

	const onSubmit = async (data: ProfileForm) => {
		const values = {
			name: data.name,
			memoryReservation: data.memoryReservation || null,
			memoryLimit: data.memoryLimit || null,
			cpuReservation: data.cpuReservation || null,
			cpuLimit: data.cpuLimit || null,
		};

		if (profileId) {
			await updateMutateAsync({ profileId, ...values })
				.then(() => {
					toast.success("Profile updated");
					utils.resourceProfile.all.invalidate();
					setOpen(false);
				})
				.catch(() => {
					toast.error("Error updating the profile");
				});
		} else {
			await createMutateAsync({ groupId, ...values })
				.then(() => {
					toast.success("Profile created");
					utils.resourceProfile.all.invalidate();
					setOpen(false);
				})
				.catch(() => {
					toast.error("Error creating the profile");
				});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant={profileId ? "ghost" : "outline"}
					size={profileId ? "icon" : "sm"}
				>
					{profileId ? (
						<PenBoxIcon className="size-4 text-primary" />
					) : (
						<>
							<PlusIcon className="size-4 mr-1" />
							Add Profile
						</>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{profileId ? "Edit" : "Create"} Resource Profile
					</DialogTitle>
					<DialogDescription>
						A profile holds the resource limits and reservations that services
						can inherit. Values use the same format as service resources.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="resource-profile-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="API" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="memoryLimit"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Memory Limit</FormLabel>
										<FormControl>
											<NumberInputWithSteps
												value={field.value ?? ""}
												onChange={field.onChange}
												placeholder="1073741824 (1GB in bytes)"
												step={MEMORY_STEP_MB}
												converter={memoryConverter}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="memoryReservation"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Memory Reservation</FormLabel>
										<FormControl>
											<NumberInputWithSteps
												value={field.value ?? ""}
												onChange={field.onChange}
												placeholder="268435456 (256MB in bytes)"
												step={MEMORY_STEP_MB}
												converter={memoryConverter}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="cpuLimit"
								render={({ field }) => (
									<FormItem>
										<FormLabel>CPU Limit</FormLabel>
										<FormControl>
											<NumberInputWithSteps
												value={field.value ?? ""}
												onChange={field.onChange}
												placeholder="2000000000 (2 CPUs)"
												step={CPU_STEP}
												converter={cpuConverter}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="cpuReservation"
								render={({ field }) => (
									<FormItem>
										<FormLabel>CPU Reservation</FormLabel>
										<FormControl>
											<NumberInputWithSteps
												value={field.value ?? ""}
												onChange={field.onChange}
												placeholder="1000000000 (1 CPU)"
												step={CPU_STEP}
												converter={cpuConverter}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter>
							<Button isLoading={isPending} type="submit">
								Save
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
