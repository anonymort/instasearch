document.addEventListener('DOMContentLoaded', () => {
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

    // Initialize logging
    const log = (message, level = 'info') => {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] ${message}`);
    };

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
            localStorage.setItem('theme', 'dark');
        } else {
            darkModeToggle.innerHTML = '<span class="icon"><i class="fas fa-moon"></i></span><span>Dark Mode</span>';
            localStorage.setItem('theme', 'light');
        }
    }

    // Apply the saved theme on page load
    document.addEventListener('DOMContentLoaded', () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            document.getElementById('darkModeToggle').innerHTML = '<span class="icon"><i class="fas fa-sun"></i></span><span>Light Mode</span>';
        }
    });

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
                queryWords.forEach(word => {
                    if (invertedIndex[word]) {
                        if (resultSet === null) {
                            resultSet = new Set(invertedIndex[word]);
                        } else {
                            resultSet = new Set([...resultSet].filter(x => invertedIndex[word].has(x)));
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
        log('Web Worker created successfully');
        return new Worker(URL.createObjectURL(blob));
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
            try {
                log(`Processing file: ${file.name}`);
                const text = await file.text();
                const messages = processHTML(text);
                log(`Extracted ${messages.length} messages from ${file.name}`);
                fullMessageList = fullMessageList.concat(messages);
                totalMessages += messages.length;
                worker.postMessage({ type: 'addMessages', messages });
                processedFiles++;
            } catch (error) {
                log(`Error processing ${file.name}: ${error.message}`, 'error');
                console.error(`Error processing ${file.name}:`, error);
                addNotification(`Error processing ${file.name}: ${error.message}`, 'is-danger');
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

        const messages = Array.from(messageDivs).map((div, index) => {
            const senderElement = div.querySelector('._a6-h');
            const contentElement = div.querySelector('._a6-p');
            const dateElement = div.querySelector('._a6-o');
            return {
                id: fullMessageList.length + index,
                sender: senderElement ? senderElement.textContent.trim() : '',
                content: contentElement ? contentElement.textContent.trim() : '',
                date: dateElement ? dateElement.textContent.trim() : ''
            };
        }).filter(message => message.sender && message.content && message.date);

        log(`Extracted ${messages.length} messages from HTML`);
        return messages;
    }

    // Display Results
    function displayResults(results, query) {
        log(`Displaying ${results.length} search results for query: "${query}"`);
        resultsDiv.innerHTML = '';

        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="notification is-warning">No messages found.</div>';
            return;
        }

        results.forEach(message => {
            const messageCard = document.createElement('div');
            messageCard.className = 'box message';
            messageCard.innerHTML = `
                <article class="media">
                    <div class="media-content">
                        <div class="content">
                            <p>
                                <strong>${highlightText(message.sender, query)}</strong>
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
            resultsDiv.appendChild(messageCard);
        });
    }

    // Show Context Messages
    function showContext(messageId, query) {
        log(`Showing context for message ID: ${messageId}, query: "${query}"`);
        const index = fullMessageList.findIndex(m => m.id === messageId);
        if (index === -1) return;

        const start = Math.max(0, index - 10);
        const end = Math.min(fullMessageList.length, index + 11);
        const contextMessagesToShow = fullMessageList.slice(start, end);

        contextMessages.innerHTML = '';
        contextMessagesToShow.forEach((message, i) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'box mb-2';
            if (i === index - start) messageDiv.classList.add('highlight');
            messageDiv.innerHTML = `
                <article class="media">
                    <div class="media-content">
                        <div class="content">
                            <p>
                                <strong>${escapeHTML(message.sender)}</strong>
                                <br>
                                ${escapeHTML(message.content)}
                                <br>
                                <small>${escapeHTML(message.date)}</small>
                            </p>
                        </div>
                    </div>
                </article>
            `;
            contextMessages.appendChild(messageDiv);
        });

        contextModal.classList.add('is-active');

        // Scroll to the highlighted message
        const highlightedMessage = contextMessages.querySelector('.highlight');
        if (highlightedMessage) {
            highlightedMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Escape HTML to prevent XSS
    function escapeHTML(str) {
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

    // Highlight Text
    function highlightText(text, query) {
        log(`Highlighting text for query: "${query}"`);
        if (!query) return escapeHTML(text);
        const words = query.trim().split(/\s+/).filter(word => word);
        if (words.length === 0) return escapeHTML(text);
        const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        return escapeHTML(text).replace(regex, '<span class="highlight">$1</span>');
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