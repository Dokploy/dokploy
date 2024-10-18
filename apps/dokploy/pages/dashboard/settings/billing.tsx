import { ShowNodes } from "@/components/dashboard/settings/cluster/nodes/show-nodes";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SettingsLayout } from "@/components/layouts/settings-layout";
import { api } from "@/utils/api";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import React, { type ReactElement } from "react";

const Page = () => {
	const { data } = api.stripe.getProducts.useQuery();
	console.log(data);
	return (
		<div className="flex flex-col gap-4 w-full">
			{data?.map((product) => (
				<div key={product.id} className="border p-4 rounded-lg shadow-md">
					<h2 className="text-xl font-semibold">{product.name}</h2>
					{product.description && (
						<p className="text-gray-500">{product.description}</p>
					)}
					<p className="text-lg font-bold">
						Price: {product.default_price.unit_amount / 100}{" "}
						{product.default_price.currency.toUpperCase()}
					</p>
					{/* <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
						Subscribe
					</button> */}
				</div>
			))}
		</div>
	);
};

export default Page;

Page.getLayout = (page: ReactElement) => {
	return (
		<DashboardLayout tab={"settings"}>
			<SettingsLayout>{page}</SettingsLayout>
		</DashboardLayout>
	);
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	if (!IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
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
