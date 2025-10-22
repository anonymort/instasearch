/**
 * Configuration constants for InstaSearch
 */

const CONFIG = {
    // Search configuration
    SEARCH_DEBOUNCE_MS: 300,

    // Context window configuration
    CONTEXT_MESSAGES_BEFORE: 10,
    CONTEXT_MESSAGES_AFTER: 10,

    // Notification configuration
    NOTIFICATION_TIMEOUT_MS: 5000,

    // Instagram HTML selectors
    // Note: These are Instagram-specific CSS classes and may break if Instagram changes their structure
    SELECTORS: {
        MESSAGE_DIVS: '.pam._3-95._2ph-._a6-g',
        SENDER: '._a6-h',
        CONTENT: '._a6-p',
        DATE: '._a6-o'
    },

    // Local storage keys
    STORAGE_KEYS: {
        DARK_MODE: 'darkMode'
    },

    // Dark mode values
    DARK_MODE: {
        ENABLED: 'enabled',
        DISABLED: 'disabled'
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
