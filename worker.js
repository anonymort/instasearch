/**
 * Web Worker for InstaSearch
 * Handles message storage, indexing, and search operations
 */

let messages = [];
let invertedIndex = {};

/**
 * Update inverted index with a new message
 * @param {Object} message - Message object with sender, content, and date
 * @param {number} index - Index of the message in the messages array
 */
function updateInvertedIndex(message, index) {
    const text = (message.sender + ' ' + message.content + ' ' + message.date).toLowerCase();
    const words = text.split(/\s+/);
    words.forEach(word => {
        if (!invertedIndex[word]) {
            invertedIndex[word] = new Set();
        }
        invertedIndex[word].add(index);
    });
}

/**
 * Search messages using inverted index
 * @param {string} query - Search query
 * @returns {Object} Search results and execution time
 */
function search(query) {
    const startTime = performance.now();
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word);
    if (queryWords.length === 0) return { results: [], searchTime: 0 };

    let resultSet = null;
    queryWords.forEach(word => {
        if (invertedIndex[word]) {
            if (resultSet === null) {
                resultSet = new Set(invertedIndex[word]);
            } else {
                // Fixed: More efficient set intersection algorithm
                // Iterate through the smaller set for better performance
                const wordSet = invertedIndex[word];
                const newResultSet = new Set();

                // Choose to iterate through the smaller set
                if (resultSet.size <= wordSet.size) {
                    for (const item of resultSet) {
                        if (wordSet.has(item)) {
                            newResultSet.add(item);
                        }
                    }
                } else {
                    for (const item of wordSet) {
                        if (resultSet.has(item)) {
                            newResultSet.add(item);
                        }
                    }
                }

                resultSet = newResultSet;
            }
        } else {
            resultSet = new Set();
        }
    });

    const results = resultSet ? Array.from(resultSet).map(index => messages[index]) : [];
    const endTime = performance.now();
    const searchTime = endTime - startTime;
    return { results, searchTime };
}

/**
 * Handle messages from the main thread
 */
self.onmessage = function(e) {
    if (e.data.type === 'addMessages') {
        const newMessages = e.data.messages;
        const startIndex = messages.length;
        messages = messages.concat(newMessages);
        newMessages.forEach((message, i) => updateInvertedIndex(message, startIndex + i));
        self.postMessage({ type: 'processed', count: messages.length });
    } else if (e.data.type === 'search') {
        const { results, searchTime } = search(e.data.query);
        self.postMessage({ type: 'searchResults', results, query: e.data.query, searchTime });
    }
};
