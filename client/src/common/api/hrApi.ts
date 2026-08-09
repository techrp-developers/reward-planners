// HR uses the shared cookie-authenticated API client so refresh rotation,
// credentials, and CSRF protection remain identical across every role.
export { api as hrApi } from "./api";
