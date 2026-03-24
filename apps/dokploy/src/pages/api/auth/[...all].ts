import { auth } from "@dokploy/server/index";
import { toNodeHandler } from "better-auth/node";

// Disallow body parsing, we will parse it manually
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth.handler);
