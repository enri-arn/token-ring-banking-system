/**
 * Initial balance for the shared bank account
 */
export const INITIAL_BALANCE = 1000;

/**
 * Total number of ATM nodes in the Token Ring
 */
export const NUMBER_OF_NODES = 4;

/**
 * Base port number for the first ATM node
 * Subsequent nodes will use BASE_PORT + 1, BASE_PORT + 2, etc.
 */
export const BASE_PORT = 3001;

/**
 * Display delay in milliseconds when a node has no pending transactions.
 *
 * NOTE: This delay is NOT part of the original Token Ring algorithm.
 * In the correct algorithm, nodes should forward the token IMMEDIATELY
 * when they have no pending transactions.
 *
 * This configurable delay is added ONLY for educational/demonstration purposes
 * to allow visualization of token circulation in university project presentations.
 *
 * For production implementations, this should be set to 0.
 */
export const TOKEN_DISPLAY_DELAY = 5000; // 5 seconds

/**
 * Maximum number of retry attempts before declaring a node as failed.
 * This is used in the failure detection mechanism of the Bully Algorithm.
 */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Timeout in milliseconds for waiting for a response from another node.
 * If a node doesn't respond within this time, it's considered unresponsive.
 */
export const NODE_RESPONSE_TIMEOUT = 3000; // 3 seconds

/**
 * Delay between retry attempts in milliseconds.
 * Used when retrying communication with a potentially failed node.
 */
export const RETRY_DELAY = 2000; // 2 seconds

/**
 * Timeout in milliseconds for waiting for OK responses during election.
 * If no OK received within this time, the node declares itself coordinator.
 */
export const ELECTION_TIMEOUT = 5000; // 5 seconds

/**
 * Timeout in milliseconds for waiting for COORDINATOR message.
 * If no COORDINATOR message is received, a new election is started.
 */
export const COORDINATOR_TIMEOUT = 10000; // 10 seconds

/**
 * Timeout in milliseconds for token circulation monitoring.
 * If a node doesn't see the token within this time, it assumes the token is lost
 * and triggers an election to regenerate it (Scenario A).
 *
 * Calculation: With 4 nodes and TOKEN_DISPLAY_DELAY of 5 seconds,
 * a full token rotation takes ~20 seconds. Setting timeout to 30 seconds
 * allows for some network delays while still detecting lost tokens quickly.
 */
export const TOKEN_CIRCULATION_TIMEOUT = 30000; // 30 seconds
