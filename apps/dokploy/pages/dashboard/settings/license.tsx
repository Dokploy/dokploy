import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormMessage,
	Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { validateRequest } from "@/server/auth/auth";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useEffect, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
	licenseKey: z.string(),
});

type Schema = z.infer<typeof schema>;

export default function License() {
	const { data } = api.admin.one.useQuery();
	const { mutateAsync, isLoading } = api.license.setLicense.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			licenseKey: data?.licenseKey || "",
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (data?.licenseKey) {
			form.reset({
				licenseKey: data.licenseKey,
			});
		}
	}, [data]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync(data.licenseKey)
			.then(async () => {
				toast.success("License Key Saved");
			})
			.catch(() => {
				toast.error("Error to save the license key");
			});
	};
	return (
		<>
			<div className="w-full">
				<Card className="bg-transparent">
					<CardHeader>
						<CardTitle className="text-xl">License</CardTitle>
						<CardDescription className="flex flex-row gap-2">
							Set your license key to unlock the features
							<Link
								target="_blank"
								href="https://dokploy.com/pricing"
								className="text-primary text-md"
							>
								See pricing
							</Link>
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="grid w-full gap-4 "
							>
								<FormField
									control={form.control}
									name="licenseKey"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>License Key</FormLabel>
												<FormControl>
													<Input
														className="w-full"
														placeholder={"Enter your license key"}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<div className="flex justify-end">
									<Button isLoading={isLoading} type="submit">
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</Card>
			</div>
		</>
	);
}

License.getLayout = (page: ReactElement) => {
	return (
		<DashboardLayout tab={"settings"}>
			<SettingsLayout>{page}</SettingsLayout>
		</DashboardLayout>
	);
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	const { user, session } = await validateRequest(ctx.req, ctx.res);
	if (!user || user.rol === "user") {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
