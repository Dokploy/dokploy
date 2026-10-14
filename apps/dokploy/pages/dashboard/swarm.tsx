import type { GetServerSidePropsContext } from "next";

const Swarm = () => {
	return null;
};

export default Swarm;

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
	const serverId =
		typeof ctx.query.serverId === "string" ? ctx.query.serverId : undefined;

	return {
		redirect: {
			permanent: false,
			destination: `/dashboard/docker?tab=swarm${
				serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""
			}`,
		},
	};
}
