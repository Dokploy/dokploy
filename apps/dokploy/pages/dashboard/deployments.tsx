import type { GetServerSidePropsContext } from "next";

export default function DeploymentsRedirect() {
	return null;
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const destination =
		ctx.query.tab === "queue"
			? "/dashboard/overview?tab=deployments&subtab=queue"
			: "/dashboard/overview?tab=deployments";

	return {
		redirect: {
			permanent: false,
			destination,
		},
	};
}
