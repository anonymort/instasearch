document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const DEV_MODE = false; // Set to true for development logging
    const RESULTS_PER_PAGE = 50; // Pagination limit
    const MAX_NAME_LENGTH = 100; // Maximum display length for sender names

    // Variables and DOM Elements
    const statusDiv = document.getElementById('status');
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const clearSearchButton = document.getElementById('clearSearch');
    const searchStats = document.getElementById('searchStats');
    const contextModal = document.getElementById('contextModal');
    const contextMessages = document.getElementById('contextMessages');
    const closeModalButtons = [document.getElementById('closeModal'), document.getElementById('closeModalBackground')];
    const fileDropZone = document.getElementById('fileDropZone');
    let worker;
    let fullMessageList = [];
    let messageIdCounter = 0;
    let currentPage = 0;
    let currentResults = [];
    let currentQuery = '';

    // Initialize logging (only in dev mode)
    const log = DEV_MODE
        ? (message, level = 'info') => {
            const timestamp = new Date().toISOString();
            console[level](`[${timestamp}] ${message}`);
        }
        : () => {}; // No-op in production

    log('Application initialized');

    // Initialize Dark Mode
    initDarkMode();

    // Create Web Worker
    worker = createWorker();

    // Event Listeners
    fileInput.addEventListener('change', handleFileInput);
    searchInput.addEventListener('input', debounce(handleSearchInput, 300));
    darkModeToggle.addEventListener('click', toggleDarkMode);
    clearSearchButton.addEventListener('click', clearSearch);
    closeModalButtons.forEach(button => button.addEventListener('click', closeModal));
    window.addEventListener('click', handleWindowClick);
    fileDropZone.addEventListener('dragover', handleDragOver);
    fileDropZone.addEventListener('dragleave', handleDragLeave);
    fileDropZone.addEventListener('drop', handleFileDrop);

    // Initialize Application
    init();

    // Functions

    // Initialize Dark Mode
    function initDarkMode() {
        log('Initializing dark mode');
        const isDarkMode = localStorage.getItem('darkMode') === 'enabled';
        document.body.classList.toggle('dark-mode', isDarkMode);
        updateDarkModeButton(isDarkMode);
        log(`Dark mode initialized. Current state: ${isDarkMode ? 'enabled' : 'disabled'}`);
    }

    function updateDarkModeButton(isDark) {
        log(`Updating dark mode button. isDark: ${isDark}`);
        darkModeToggle.classList.toggle('is-dark', isDark);
        darkModeToggle.classList.toggle('is-light', !isDark);
        darkModeToggle.innerHTML = isDark
            ? '<span class="icon"><i class="fas fa-sun"></i></span><span>Light Mode</span>'
            : '<span class="icon"><i class="fas fa-moon"></i></span><span>Dark Mode</span>';
    }

    function toggleDarkMode() {
        const body = document.body;
        const darkModeToggle = document.getElementById('darkModeToggle');

        body.classList.toggle('dark-mode');

        if (body.classList.contains('dark-mode')) {
            darkModeToggle.innerHTML = '<span class="icon"><i class="fas fa-sun"></i></span><span>Light Mode</span>';
            localStorage.setItem('darkMode', 'enabled');
        } else {
            darkModeToggle.innerHTML = '<span class="icon"><i class="fas fa-moon"></i></span><span>Dark Mode</span>';
            localStorage.setItem('darkMode', 'disabled');
        }
    }

    // Create Web Worker
    function createWorker() {
        log('Creating Web Worker');
        const workerCode = `
            let messages = [];
            let invertedIndex = {};

            function updateInvertedIndex(message, index) {
                const text = (message.sender + ' ' + message.content + ' ' + message.date).toLowerCase();
                const words = text.split(/\\s+/);
                words.forEach(word => {
                    if (!invertedIndex[word]) {
                        invertedIndex[word] = new Set();
                    }
                    invertedIndex[word].add(index);
                });
            }

            function search(query) {
                const startTime = performance.now();
                const queryWords = query.toLowerCase().split(/\\s+/).filter(word => word);
                if (queryWords.length === 0) return { results: [], searchTime: 0 };

                let resultSet = null;
                for (const word of queryWords) {
                    if (invertedIndex[word]) {
                        if (resultSet === null) {
                            resultSet = new Set(invertedIndex[word]);
                        } else {
                            // Optimized Set intersection without spread/filter
                            const newSet = new Set();
                            const wordSet = invertedIndex[word];
                            for (const idx of resultSet) {
                                if (wordSet.has(idx)) newSet.add(idx);
                            }
                            resultSet = newSet;
                        }
                    } else {
                        // Word not found, no results possible
                        return { results: [], searchTime: performance.now() - startTime };
                    }
                }

                const results = resultSet ? Array.from(resultSet).map(index => messages[index]) : [];
                const endTime = performance.now();
                const searchTime = endTime - startTime;
                return { results, searchTime };
            }

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
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobURL = URL.createObjectURL(blob);
        const worker = new Worker(blobURL);
        // Revoke the blob URL to prevent memory leak
        URL.revokeObjectURL(blobURL);
        log('Web Worker created successfully');
        return worker;
    }

    // Handle File Input Change
    function handleFileInput(event) {
        log('File input change detected');
        const files = Array.from(event.target.files).filter(file => file.name.endsWith('.html'));
        log(`${files.length} HTML files selected`);
        if (files.length > 0) {
            processFiles(files);
        } else {
            log('No valid HTML files selected', 'warn');
            addNotification('Please upload valid HTML files.', 'is-warning');
        }
    }

    // Handle Search Input
    function handleSearchInput(event) {
        const query = event.target.value;
        log(`Search input detected: "${query}"`);
        if (query.trim() === '') {
            log('Empty search query, clearing results');
            clearResults();
            return;
        }
        log('Initiating search');
        loadingIndicator.style.display = 'block';
        worker.postMessage({ type: 'search', query });
    }

    // Handle Drag Over
    function handleDragOver(event) {
        event.preventDefault();
        fileDropZone.classList.add('drag-over');
    }

    // Handle Drag Leave
    function handleDragLeave(event) {
        event.preventDefault();
        fileDropZone.classList.remove('drag-over');
    }

    // Handle File Drop
    function handleFileDrop(event) {
        event.preventDefault();
        fileDropZone.classList.remove('drag-over');
        const files = Array.from(event.dataTransfer.files).filter(file => file.name.endsWith('.html'));
        log(`${files.length} HTML files dropped`);
        if (files.length > 0) {
            processFiles(files);
        } else {
            log('No valid HTML files dropped', 'warn');
            addNotification('Please upload valid HTML files.', 'is-warning');
        }
    }

    // Handle Window Click (for closing modal)
    function handleWindowClick(event) {
        if (event.target.classList.contains('modal-background')) {
            closeModal();
        }
    }

    // Close Modal
    function closeModal() {
        contextModal.classList.remove('is-active');
    }

    // Clear Search
    function clearSearch() {
        searchInput.value = '';
        clearResults();
    }

    // Clear Results
    function clearResults() {
        resultsDiv.innerHTML = '';
        searchStats.textContent = '';
    }

    // Debounce Function
    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Add Notification
    function addNotification(message, type) {
        log(`Adding notification: ${message} (${type})`);
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <button class="delete"></button>
            ${message}
        `;
        statusDiv.appendChild(notification);
        notification.style.display = 'block';

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            notification.classList.add('is-hidden');
            notification.addEventListener('transitionend', () => notification.remove());
        }, 5000);

        // Dismiss on delete button click
        notification.querySelector('.delete').addEventListener('click', () => {
            notification.classList.add('is-hidden');
            notification.addEventListener('transitionend', () => notification.remove());
        });
    }

    // Process Files
    async function processFiles(files) {
        log(`Processing ${files.length} files`);
        let processedFiles = 0;
        let totalMessages = 0;

        for (let file of files) {
            let messages = [];
            try {
                log(`Processing file: ${file.name}`);
                const text = await file.text();
                messages = processHTML(text);
                log(`Extracted ${messages.length} messages from ${file.name}`);

                // Send to worker first, then update local list on success
                worker.postMessage({ type: 'addMessages', messages });
                fullMessageList = fullMessageList.concat(messages);
                totalMessages += messages.length;
                processedFiles++;
            } catch (error) {
                log(`Error processing ${file.name}: ${error.message}`, 'error');
                console.error(`Error processing ${file.name}:`, error);
                addNotification(`Error processing ${file.name}: ${error.message}`, 'is-danger');

                // Rollback message IDs if processing failed
                if (messages.length > 0) {
                    messageIdCounter -= messages.length;
                }
            }
        }

        log(`Finished processing files. Processed: ${processedFiles}, Total messages: ${totalMessages}`);
        if (processedFiles > 0) {
            addNotification(`Processed ${processedFiles} file(s): ${totalMessages} message(s)`, 'is-success');
        }
    }

    // Process HTML Content
    function processHTML(html) {
        log('Processing HTML content');
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const messageDivs = doc.querySelectorAll('.pam._3-95._2ph-._a6-g');

        const messages = Array.from(messageDivs).map((div) => {
            const senderElement = div.querySelector('._a6-h');
            const contentElement = div.querySelector('._a6-p');
            const dateElement = div.querySelector('._a6-o');
            return {
                id: messageIdCounter++,
                sender: senderElement ? senderElement.textContent.trim() : '',
                content: contentElement ? contentElement.textContent.trim() : '',
                date: dateElement ? dateElement.textContent.trim() : ''
            };
        }).filter(message => message.sender && message.content && message.date);

        log(`Extracted ${messages.length} messages from HTML`);
        return messages;
    }

    // Truncate long names for display
    function truncateName(name, maxLength = MAX_NAME_LENGTH) {
        if (!name || typeof name !== 'string') return '';
        const trimmed = name.trim();
        if (trimmed.length <= maxLength) return trimmed;
        return trimmed.substring(0, maxLength - 3) + '...';
    }

    // Display Results with pagination and DocumentFragment optimization
    function displayResults(results, query, page = 0) {
        log(`Displaying ${results.length} search results for query: "${query}", page: ${page}`);

        // Store for pagination
        currentResults = results;
        currentQuery = query;
        currentPage = page;

        resultsDiv.innerHTML = '';

        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="notification is-warning">No messages found.</div>';
            return;
        }

        const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
        const startIndex = page * RESULTS_PER_PAGE;
        const endIndex = Math.min(startIndex + RESULTS_PER_PAGE, results.length);
        const pageResults = results.slice(startIndex, endIndex);

        // Use DocumentFragment for batch DOM insertion (10-50x faster for large result sets)
        const fragment = document.createDocumentFragment();

        pageResults.forEach(message => {
            const messageCard = document.createElement('div');
            messageCard.className = 'box message';
            const displayName = truncateName(message.sender);
            messageCard.innerHTML = `
                <article class="media">
                    <div class="media-content">
                        <div class="content">
                            <p>
                                <strong class="sender-name" title="${escapeHTML(message.sender)}">${highlightText(displayName, query)}</strong>
                                <br>
                                ${highlightText(message.content, query)}
                                <br>
                                <small>${highlightText(message.date, query)}</small>
                            </p>
                        </div>
                    </div>
                </article>
            `;
            messageCard.addEventListener('click', () => showContext(message.id, query));
            fragment.appendChild(messageCard);
        });

        resultsDiv.appendChild(fragment);

        // Add pagination controls if needed
        if (totalPages > 1) {
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'pagination-controls has-text-centered mt-4';
            paginationDiv.innerHTML = `
                <nav class="pagination is-centered" role="navigation" aria-label="pagination">
                    <button class="pagination-previous button" ${page === 0 ? 'disabled' : ''} id="prevPage">Previous</button>
                    <span class="pagination-info mx-3">Page ${page + 1} of ${totalPages} (${results.length} results)</span>
                    <button class="pagination-next button" ${page >= totalPages - 1 ? 'disabled' : ''} id="nextPage">Next</button>
                </nav>
            `;
            resultsDiv.appendChild(paginationDiv);

            // Attach pagination event listeners
            const prevBtn = document.getElementById('prevPage');
            const nextBtn = document.getElementById('nextPage');
            if (prevBtn && page > 0) {
                prevBtn.addEventListener('click', () => displayResults(currentResults, currentQuery, currentPage - 1));
            }
            if (nextBtn && page < totalPages - 1) {
                nextBtn.addEventListener('click', () => displayResults(currentResults, currentQuery, currentPage + 1));
            }
        }
    }

    // Show Context Messages with DocumentFragment optimization
    function showContext(messageId, query) {
        log(`Showing context for message ID: ${messageId}, query: "${query}"`);

        // Defensive check for messageId
        if (messageId === undefined || messageId === null) {
            log('Invalid message ID provided', 'warn');
            return;
        }

        const index = fullMessageList.findIndex(m => m.id === messageId);
        if (index === -1) {
            log(`Message with ID ${messageId} not found in list`, 'warn');
            return;
        }

        const start = Math.max(0, index - 10);
        const end = Math.min(fullMessageList.length, index + 11);
        const contextMessagesToShow = fullMessageList.slice(start, end);

        contextMessages.innerHTML = '';

        // Use DocumentFragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        contextMessagesToShow.forEach((message, i) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'box mb-2';
            if (i === index - start) messageDiv.classList.add('highlight');

            // Defensive null checks for message properties
            const safeSender = message?.sender ?? '';
            const safeContent = message?.content ?? '';
            const safeDate = message?.date ?? '';

            messageDiv.innerHTML = `
                <article class="media">
                    <div class="media-content">
                        <div class="content">
                            <p>
                                <strong class="sender-name" title="${escapeHTML(safeSender)}">${escapeHTML(truncateName(safeSender))}</strong>
                                <br>
                                ${escapeHTML(safeContent)}
                                <br>
                                <small>${escapeHTML(safeDate)}</small>
                            </p>
                        </div>
                    </div>
                </article>
            `;
            fragment.appendChild(messageDiv);
        });

        contextMessages.appendChild(fragment);
        contextModal.classList.add('is-active');

        // Scroll to the highlighted message
        const highlightedMessage = contextMessages.querySelector('.highlight');
        if (highlightedMessage) {
            highlightedMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Escape HTML to prevent XSS (with defensive null check)
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        if (typeof str !== 'string') str = String(str);
        return str.replace(/[&<>'"]/g, (tag) => {
            const chars = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            };
            return chars[tag] || tag;
        });
    }

    // Highlight Text (with defensive null check)
    function highlightText(text, query) {
        // Defensive null check - escapeHTML handles null/undefined
        const safeText = escapeHTML(text);
        if (!query || typeof query !== 'string') return safeText;
        const words = query.trim().split(/\s+/).filter(word => word);
        if (words.length === 0) return safeText;
        const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        return safeText.replace(regex, '<span class="highlight">$1</span>');
    }

    // Update Search Statistics
    function updateSearchStats(resultCount, searchTime) {
        log(`Updating search stats: ${resultCount} results in ${searchTime.toFixed(2)} ms`);
        searchStats.textContent = `Found ${resultCount} result(s) in ${searchTime.toFixed(2)} ms`;
    }

    // Initialize Application
    function init() {
        log('Initializing application');
        if (!(window.File && window.FileReader && window.FileList && window.Blob && window.Worker)) {
            log('Browser does not support required features', 'error');
            addNotification('Your browser does not support one or more features required for this application. Please use a modern browser.', 'is-danger');
        }

        // Worker Message Handling
        worker.onmessage = function(e) {
            log(`Received message from worker: ${e.data.type}`);
            if (e.data.type === 'processed') {
                log(`Worker processed messages. Total count: ${e.data.count}`);
                addNotification(`Processed messages. Total count: ${e.data.count}`, 'is-success');
            } else if (e.data.type === 'searchResults') {
                log(`Received search results: ${e.data.results.length} results for query "${e.data.query}" in ${e.data.searchTime.toFixed(2)} ms`);
                displayResults(e.data.results, e.data.query);
                loadingIndicator.style.display = 'none';
                updateSearchStats(e.data.results.length, e.data.searchTime);
            }
        };

        worker.onerror = function(e) {
            log(`Worker error: ${e.message}`, 'error');
            console.error('Worker error:', e);
            addNotification('An error occurred in the worker thread.', 'is-danger');
        };

        log('Application initialization complete');
    }
});