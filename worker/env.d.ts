// Secrets are not declared in wrangler.jsonc, so `wrangler types` cannot see
// them. Declaration merging adds them to the generated Env interface.
interface Env {
  /**
   * Optional bearer token. Unset means the API is open, which is how the
   * dashboard runs today. Setting it (`wrangler secret put API_TOKEN`) turns on
   * auth across every route via worker/auth.ts, with no route code touched.
   */
  API_TOKEN?: string
}
