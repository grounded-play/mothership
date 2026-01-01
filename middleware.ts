export { default } from "next-auth/middleware";

export const config = {
    matcher: ["/menu/:path*", "/character/:path*", "/settings/:path*"],
};
