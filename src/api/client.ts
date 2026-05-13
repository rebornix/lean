import { LinearClient } from "@linear/sdk";
import { getApiKey } from "../config/index.js";

export function getClient(): LinearClient {
  const apiUrl = process.env.LINEAR_API_URL;
  return new LinearClient({ apiKey: getApiKey(), ...(apiUrl ? { apiUrl } : {}) });
}
