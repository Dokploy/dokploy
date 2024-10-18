import Stripe from "stripe";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const stripeRouter = createTRPCRouter({
	getProducts: adminProcedure.query(async () => {
		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
			apiVersion: "2024-09-30.acacia",
		});

		const products = await stripe.products.list({
			expand: ["data.default_price"],
		});
		console.log(products);
		return products.data;
	}),
});
// {
// 	"Parallelism": 1,
// 	"Delay": 10000000000,
// 	"FailureAction": "rollback",
// 	"Order": "start-first"
//   }
