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
