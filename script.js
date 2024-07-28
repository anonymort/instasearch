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
        const closeModal = document.getElementsByClassName('close')[0];
        let worker;
        let fullMessageList = [];

        // Initialize dark mode from localStorage
        if (localStorage.getItem('darkMode') === 'enabled') {
            document.body.classList.add('dark-mode');
        }

        // Create a Web Worker
        function createWorker() {
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
                    const queryWords = query.toLowerCase().split(/\\s+/);
                    const resultIndices = queryWords.reduce((acc, word) => {
                        if (invertedIndex[word]) {
                            return acc.length === 0 ? Array.from(invertedIndex[word]) : 
                                acc.filter(index => invertedIndex[word].has(index));
                        }
                        return acc;
                    }, []);
                    
                    const results = resultIndices.map(index => messages[index]);
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
            return new Worker(URL.createObjectURL(blob));
        }

        worker = createWorker();

        worker.onmessage = function(e) {
            if (e.data.type === 'processed') {
                addMessage(`Processed messages. Total count: ${e.data.count}`, 'success');
            } else if (e.data.type === 'searchResults') {
                displayResults(e.data.results, e.data.query);
                loadingIndicator.style.display = 'none';
                updateSearchStats(e.data.results.length, e.data.searchTime);
            }
        };

        function addMessage(message, type) {
            const messageElement = document.createElement('p');
            messageElement.className = type;
            messageElement.textContent = message;
            statusDiv.appendChild(messageElement);

            setTimeout(() => {
                statusDiv.removeChild(messageElement);
            }, 3000);
        }

        function processHTML(html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const messageDivs = doc.querySelectorAll('.pam._3-95._2ph-._a6-g');
            
            return Array.from(messageDivs).map((div, index) => ({
                id: index,
                sender: div.querySelector('._a6-h')?.textContent.trim(),
                content: div.querySelector('._a6-p')?.textContent.trim(),
                date: div.querySelector('._a6-o')?.textContent.trim()
            })).filter(message => message.sender && message.content && message.date);
        }

        async function processFiles(files) {
            let processedFiles = 0;
            let totalMessages = 0;
            fullMessageList = [];

            for (let file of files) {
                try {
                    const text = await file.text();
                    const messages = processHTML(text);
                    fullMessageList = fullMessageList.concat(messages);
                    totalMessages += messages.length;
                    worker.postMessage({ type: 'addMessages', messages });
                    processedFiles++;
                } catch (error) {
                    console.error(`Error processing ${file.name}:`, error);
                    addMessage(`Error processing ${file.name}: ${error.message}`, 'error');
                }
            }

            addMessage(`Processed ${processedFiles} files: ${totalMessages} messages`, 'success');
        }

        fileInput.addEventListener('change', (event) => {
            statusDiv.innerHTML = '';
            const files = event.target.files;
            processFiles(files);
        });

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function highlightText(text, query) {
            if (!query) return text;
            const regex = new RegExp(`(${query.split(' ').join('|')})`, 'gi');
            return text.replace(regex, '<span class="highlight">$1</span>');
        }

        function displayResults(results, query) {
            resultsDiv.innerHTML = '';

            if (results.length === 0) {
                resultsDiv.innerHTML = '<p>No messages found.</p>';
                return;
            }

            results.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.innerHTML = `
                    <div class="sender">${highlightText(message.sender, query)}</div>
                    <div class="content">${highlightText(message.content, query)}</div>
                    <div class="date">${highlightText(message.date, query)}</div>
                `;
                messageDiv.addEventListener('click', () => showContext(message.id));
                resultsDiv.appendChild(messageDiv);
            });
        }

        function showContext(messageId) {
    const index = fullMessageList.findIndex(m => m.id === messageId);
    if (index === -1) return;

    const start = Math.max(0, index - 10);
    const end = Math.min(fullMessageList.length, index + 11);
    const contextMessagesToShow = fullMessageList.slice(start, end);

    contextMessages.innerHTML = '';
    contextMessagesToShow.forEach((message, i) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'context-message';
        if (i === index - start) messageDiv.classList.add('highlight');
        messageDiv.innerHTML = `
            <div class="sender">${escapeHTML(message.sender)}</div>
            <div class="content">${escapeHTML(message.content)}</div>
            <div class="date">${escapeHTML(message.date)}</div>
        `;
        contextMessages.appendChild(messageDiv);
    });

    contextModal.style.display = 'block';
    
    // Scroll to the highlighted message
    const highlightedMessage = contextMessages.querySelector('.highlight');
    if (highlightedMessage) {
        highlightedMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Helper function to escape HTML and prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Event listeners for the modal
closeModal.onclick = function() {
    contextModal.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == contextModal) {
        contextModal.style.display = 'none';
    }
}

function updateSearchStats(resultCount, searchTime) {
    searchStats.textContent = `Found ${resultCount} results in ${searchTime.toFixed(2)} ms`;
}

const debouncedSearch = debounce((query) => {
    loadingIndicator.style.display = 'block';
    worker.postMessage({ type: 'search', query });
}, 300);

searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});

darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
});

clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    resultsDiv.innerHTML = '';
    searchStats.textContent = '';
});

// File drag and drop functionality
const dropZone = document.body;

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    processFiles(files);
});

// Initialize the application
function init() {
    // Check if the browser supports the required APIs
    if (!(window.File && window.FileReader && window.FileList && window.Blob && window.Worker)) {
        alert('Your browser does not support one or more features required for this application. Please use a modern browser.');
        return;
    }

    // Add any additional initialization code here
}

// Call the init function when the page loads
window.addEventListener('load', init);