import type { GetServerSidePropsContext } from "next";

const Networks = () => {
	return null;
};

export default Networks;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const serverId =
		typeof ctx.query.serverId === "string" ? ctx.query.serverId : undefined;

	return {
		redirect: {
			permanent: false,
			destination: `/dashboard/docker?tab=networks${
				serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""
			}`,
		},
	};
}
