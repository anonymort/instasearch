/**
 * Instasearch - Privacy-First Instagram Message Search
 * All processing happens locally in the browser
 */

(function() {
    'use strict';

    // ============================================
    // Configuration
    // ============================================
    const RESULTS_PER_PAGE = 50;
    const MAX_NAME_LENGTH = 100;

    // ============================================
    // State
    // ============================================
    const state = {
        messages: [],
        worker: null,
        hasFiles: false,
        isSearching: false,
        currentQuery: '',
        currentResults: [],
        currentPage: 0
    };

    // ============================================
    // DOM Elements
    // ============================================
    const elements = {
        // Theme
        themeToggle: document.getElementById('themeToggle'),

        // Hero & Upload
        heroSection: document.getElementById('heroSection'),
        uploadZone: document.getElementById('uploadZone'),
        fileInput: document.getElementById('fileInput'),

        // Search
        searchSection: document.getElementById('searchSection'),
        searchInput: document.getElementById('searchInput'),
        clearSearch: document.getElementById('clearSearch'),
        messageCount: document.getElementById('messageCount'),
        searchStats: document.getElementById('searchStats'),

        // Results
        resultsSection: document.getElementById('resultsSection'),
        loadingState: document.getElementById('loadingState'),
        emptyState: document.getElementById('emptyState'),
        noResultsState: document.getElementById('noResultsState'),
        resultsList: document.getElementById('resultsList'),

        // Modal
        contextModal: document.getElementById('contextModal'),
        contextMessages: document.getElementById('contextMessages'),
        closeModal: document.getElementById('closeModal'),

        // Other
        toastContainer: document.getElementById('toastContainer'),
        addMoreFiles: document.getElementById('addMoreFiles')
    };

    // ============================================
    // Initialize
    // ============================================
    function init() {
        initTheme();
        initWorker();
        bindEvents();
        checkBrowserSupport();
    }

    // ============================================
    // Theme Management
    // ============================================
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // ============================================
    // Web Worker (with optimized Set intersection)
    // ============================================
    function initWorker() {
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
        state.worker = new Worker(blobURL);
        URL.revokeObjectURL(blobURL);

        state.worker.onmessage = handleWorkerMessage;
        state.worker.onerror = handleWorkerError;
    }

    function handleWorkerMessage(e) {
        const { type, count, results, query, searchTime } = e.data;

        if (type === 'processed') {
            updateMessageCount(count);
            showToast(`Loaded ${count.toLocaleString()} messages`, 'success');
        } else if (type === 'searchResults') {
            state.isSearching = false;
            state.currentResults = results;
            displayResults(results, query, searchTime, 0);
        }
    }

    function handleWorkerError(e) {
        console.error('Worker error:', e);
        showToast('An error occurred while processing', 'error');
        state.isSearching = false;
    }

    // ============================================
    // Event Bindings
    // ============================================
    function bindEvents() {
        // Theme
        elements.themeToggle.addEventListener('click', toggleTheme);

        // File upload
        elements.fileInput.addEventListener('change', handleFileSelect);
        elements.uploadZone.addEventListener('dragover', handleDragOver);
        elements.uploadZone.addEventListener('dragleave', handleDragLeave);
        elements.uploadZone.addEventListener('drop', handleDrop);
        elements.addMoreFiles.addEventListener('click', () => elements.fileInput.click());

        // Search
        elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
        elements.clearSearch.addEventListener('click', clearSearch);

        // Modal
        elements.closeModal.addEventListener('click', closeModal);
        elements.contextModal.addEventListener('click', (e) => {
            if (e.target === elements.contextModal) closeModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeydown);
    }

    function handleKeydown(e) {
        // Escape closes modal
        if (e.key === 'Escape' && elements.contextModal.classList.contains('active')) {
            closeModal();
        }

        // Cmd/Ctrl + K focuses search
        if ((e.metaKey || e.ctrlKey) && e.key === 'k' && state.hasFiles) {
            e.preventDefault();
            elements.searchInput.focus();
        }
    }

    // ============================================
    // File Handling
    // ============================================
    function handleFileSelect(e) {
        const files = Array.from(e.target.files).filter(f => f.name.endsWith('.html'));
        if (files.length > 0) {
            processFiles(files);
        } else {
            showToast('Please select HTML files from Instagram data export', 'warning');
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
        elements.uploadZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        elements.uploadZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        elements.uploadZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.html'));
        if (files.length > 0) {
            processFiles(files);
        } else {
            showToast('Please drop HTML files from Instagram data export', 'warning');
        }
    }

    async function processFiles(files) {
        let messageIdCounter = state.messages.length;
        let totalNewMessages = 0;

        for (const file of files) {
            try {
                const text = await file.text();
                const messages = parseHTML(text, messageIdCounter);

                if (messages.length > 0) {
                    state.worker.postMessage({ type: 'addMessages', messages });
                    state.messages = state.messages.concat(messages);
                    messageIdCounter += messages.length;
                    totalNewMessages += messages.length;
                }
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                showToast(`Error processing ${file.name}`, 'error');
            }
        }

        if (totalNewMessages > 0) {
            transitionToSearchMode();
        } else {
            showToast('No messages found in the uploaded files', 'warning');
        }
    }

    function parseHTML(html, startId) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const messageDivs = doc.querySelectorAll('.pam._3-95._2ph-._a6-g');
        let id = startId;

        return Array.from(messageDivs).map(div => {
            const senderEl = div.querySelector('._a6-h');
            const contentEl = div.querySelector('._a6-p');
            const dateEl = div.querySelector('._a6-o');

            return {
                id: id++,
                sender: senderEl ? senderEl.textContent.trim() : '',
                content: contentEl ? contentEl.textContent.trim() : '',
                date: dateEl ? dateEl.textContent.trim() : ''
            };
        }).filter(m => m.sender && m.content && m.date);
    }

    // ============================================
    // UI State Transitions
    // ============================================
    function transitionToSearchMode() {
        state.hasFiles = true;

        // Collapse hero
        elements.heroSection.classList.add('collapsed');

        // Show search section
        elements.searchSection.classList.add('active');

        // Show results section with empty state
        elements.resultsSection.classList.add('active');
        elements.emptyState.classList.add('active');

        // Show FAB
        elements.addMoreFiles.classList.add('visible');

        // Focus search input
        setTimeout(() => elements.searchInput.focus(), 300);
    }

    function updateMessageCount(count) {
        elements.messageCount.textContent = `${count.toLocaleString()} messages loaded`;
    }

    // ============================================
    // Search
    // ============================================
    function handleSearch(e) {
        const query = e.target.value.trim();
        state.currentQuery = query;

        // Update clear button visibility
        elements.clearSearch.classList.toggle('visible', query.length > 0);

        if (!query) {
            showEmptyState();
            elements.searchStats.textContent = '';
            return;
        }

        showLoadingState();
        state.isSearching = true;
        state.worker.postMessage({ type: 'search', query });
    }

    function clearSearch() {
        elements.searchInput.value = '';
        elements.clearSearch.classList.remove('visible');
        elements.searchStats.textContent = '';
        state.currentQuery = '';
        state.currentResults = [];
        state.currentPage = 0;
        showEmptyState();
        elements.searchInput.focus();
    }

    // Truncate long names for display
    function truncateName(name, maxLength = MAX_NAME_LENGTH) {
        if (!name || typeof name !== 'string') return '';
        const trimmed = name.trim();
        if (trimmed.length <= maxLength) return trimmed;
        return trimmed.substring(0, maxLength - 3) + '...';
    }

    function displayResults(results, query, searchTime, page = 0) {
        hideAllStates();
        state.currentPage = page;

        if (results.length === 0) {
            showNoResultsState();
            elements.searchStats.textContent = '';
            return;
        }

        const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
        const startIndex = page * RESULTS_PER_PAGE;
        const endIndex = Math.min(startIndex + RESULTS_PER_PAGE, results.length);
        const pageResults = results.slice(startIndex, endIndex);

        elements.searchStats.textContent = `${results.length.toLocaleString()} results in ${searchTime.toFixed(1)}ms`;
        elements.resultsList.innerHTML = '';

        // Use DocumentFragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        pageResults.forEach(message => {
            const card = createMessageCard(message, query);
            fragment.appendChild(card);
        });

        elements.resultsList.appendChild(fragment);

        // Add pagination if needed
        if (totalPages > 1) {
            const paginationDiv = createPagination(page, totalPages, results.length, query, searchTime);
            elements.resultsList.appendChild(paginationDiv);
        }
    }

    function createMessageCard(message, query) {
        const card = document.createElement('div');
        card.className = 'message-card';
        const displayName = truncateName(message.sender);
        card.innerHTML = `
            <div class="message-sender" title="${escapeHTML(message.sender)}">${highlightText(escapeHTML(displayName), query)}</div>
            <div class="message-content">${highlightText(escapeHTML(message.content), query)}</div>
            <div class="message-date">${escapeHTML(message.date)}</div>
        `;
        card.addEventListener('click', () => showContext(message.id));
        return card;
    }

    function createPagination(page, totalPages, totalResults, query, searchTime) {
        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-controls';
        paginationDiv.innerHTML = `
            <button class="pagination-btn" ${page === 0 ? 'disabled' : ''} id="prevPage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Previous
            </button>
            <span class="pagination-info">Page ${page + 1} of ${totalPages}</span>
            <button class="pagination-btn" ${page >= totalPages - 1 ? 'disabled' : ''} id="nextPage">
                Next
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        `;

        const prevBtn = paginationDiv.querySelector('#prevPage');
        const nextBtn = paginationDiv.querySelector('#nextPage');

        if (prevBtn && page > 0) {
            prevBtn.addEventListener('click', () => displayResults(state.currentResults, query, searchTime, page - 1));
        }
        if (nextBtn && page < totalPages - 1) {
            nextBtn.addEventListener('click', () => displayResults(state.currentResults, query, searchTime, page + 1));
        }

        return paginationDiv;
    }

    // ============================================
    // Results States
    // ============================================
    function hideAllStates() {
        elements.loadingState.classList.remove('active');
        elements.emptyState.classList.remove('active');
        elements.noResultsState.classList.remove('active');
        elements.resultsList.innerHTML = '';
    }

    function showLoadingState() {
        hideAllStates();
        elements.loadingState.classList.add('active');
    }

    function showEmptyState() {
        hideAllStates();
        elements.emptyState.classList.add('active');
    }

    function showNoResultsState() {
        hideAllStates();
        elements.noResultsState.classList.add('active');
    }

    // ============================================
    // Context Modal
    // ============================================
    function showContext(messageId) {
        if (messageId === undefined || messageId === null) return;

        const index = state.messages.findIndex(m => m.id === messageId);
        if (index === -1) return;

        const start = Math.max(0, index - 10);
        const end = Math.min(state.messages.length, index + 11);
        const contextMsgs = state.messages.slice(start, end);

        elements.contextMessages.innerHTML = '';

        // Use DocumentFragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        contextMsgs.forEach((msg, i) => {
            const div = document.createElement('div');
            div.className = 'context-message' + (i === index - start ? ' current' : '');

            // Defensive null checks
            const safeSender = msg?.sender ?? '';
            const safeContent = msg?.content ?? '';
            const safeDate = msg?.date ?? '';

            div.innerHTML = `
                <div class="message-sender" title="${escapeHTML(safeSender)}">${escapeHTML(truncateName(safeSender))}</div>
                <div class="message-content">${escapeHTML(safeContent)}</div>
                <div class="message-date">${escapeHTML(safeDate)}</div>
            `;
            fragment.appendChild(div);
        });

        elements.contextMessages.appendChild(fragment);
        elements.contextModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Scroll to current message
        setTimeout(() => {
            const current = elements.contextMessages.querySelector('.current');
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    function closeModal() {
        elements.contextModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ============================================
    // Toast Notifications
    // ============================================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHTML(message)}</span>
            <button class="toast-close" aria-label="Dismiss">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => removeToast(toast));

        elements.toastContainer.appendChild(toast);

        // Auto-dismiss after 4 seconds
        setTimeout(() => removeToast(toast), 4000);
    }

    function removeToast(toast) {
        toast.style.animation = 'slideUp 0.2s ease reverse';
        setTimeout(() => toast.remove(), 200);
    }

    // ============================================
    // Utilities
    // ============================================
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        if (typeof str !== 'string') str = String(str);
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, c => map[c]);
    }

    function highlightText(text, query) {
        if (!query || typeof query !== 'string') return text;

        const words = query.split(/\s+/).filter(w => w);
        if (words.length === 0) return text;

        const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');

        return text.replace(regex, '<span class="highlight">$1</span>');
    }

    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function checkBrowserSupport() {
        const required = ['File', 'FileReader', 'FileList', 'Blob', 'Worker'];
        const unsupported = required.filter(api => !(api in window));

        if (unsupported.length > 0) {
            showToast('Your browser may not support all features. Please use a modern browser.', 'warning');
        }
    }

    // ============================================
    // Start
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
