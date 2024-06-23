import { validateRequest } from "@/server/auth/auth";
import { api } from "@/utils/api";
import type { GetServerSidePropsContext, NextPage } from "next";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

const Home: NextPage = () => {
	const { data } = api.settings.getOpenApiDocument.useQuery();
	console.log(data);

	if (!data) {
		return <div>Loading...</div>;
	}
	return <SwaggerUI spec={data} />;
};

export default Home;
export async function getServerSideProps(context: GetServerSidePropsContext) {
	const { user } = await validateRequest(context.req, context.res);

	if (!user) {
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
