import { LinearClient } from "@linear/sdk";
import { getCredentials } from "../auth/credentials.js";

export async function getClient(): Promise<LinearClient> {
  const creds = await getCredentials();
  const apiUrl = process.env.LINEAR_API_URL;
  const authOption = creds.kind === "oauth" ? { accessToken: creds.token } : { apiKey: creds.token };
  return new LinearClient({ ...authOption, ...(apiUrl ? { apiUrl } : {}) });
}
