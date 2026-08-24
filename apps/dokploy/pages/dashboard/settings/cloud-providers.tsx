import { validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const { req } = ctx;
	const { user } = await validateRequest(req);

	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		redirect: {
			permanent: true,
			destination: "/dashboard/settings/configuration#cloud-providers",
		},
	};
}

const Page = () => null;

export default Page;
