/** A cluster node configured in the UI and persisted to localStorage. */
export interface StoredNode {
  id: string;
  /** Display name, e.g. "master" or "backup". */
  name: string;
  /** Agent base URL, e.g. http://192.168.1.10:8080 */
  baseUrl: string;
  /** Agent API token. */
  token: string;
}
