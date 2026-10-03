/* Repository touch marker. */
export const isMobileRoute = () => window.location.hash === "#mobile" || new URLSearchParams(window.location.search).get("mobile") === "true";
