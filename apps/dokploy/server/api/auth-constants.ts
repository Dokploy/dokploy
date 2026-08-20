/**
 * Sentinel message attached to UNAUTHORIZED errors that specifically mean
 * "there is no valid session" (i.e. the session expired or is missing), as
 * opposed to the many UNAUTHORIZED errors that represent an authenticated user
 * lacking a role/resource permission.
 *
 * The client (utils/auth-error.ts) keys the "redirect to login" behaviour off
 * this exact message so that permission denials do NOT bounce logged-in users
 * off their page. Keep this file dependency-free so it can be imported from
 * both server and client code.
 */
export const SESSION_EXPIRED_MESSAGE = "SESSION_EXPIRED";
