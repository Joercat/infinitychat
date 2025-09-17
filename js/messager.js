// Global state management
const state = {
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    messagesPerPage: 50,
    messageCache: new Map(),
    lastFetch: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    activeUsers: new Set(),
    pendingUploads: new Map(),
    notifications: []
};

// Initialize WebSocket connection
let ws = null;
const WS_URL = `ws://${window.location.host}/ws`;

// Message queue for offline functionality
const messageQueue = {
    queue: [],
    add: function(message) {
        this.queue.push(message);
        this.persistQueue();
        this.processQueue();
    },
    persistQueue: function() {
        localStorage.setItem('messageQueue', JSON.stringify(this.queue));
    },
    loadQueue: function() {
        const saved = localStorage.getItem('messageQueue');
        this.queue = saved ? JSON.parse(saved) : [];
    },
    processQueue: async function() {
        if (!navigator.onLine) return;
        
        while (this.queue.length > 0) {
            const message = this.queue[0];
            try {
                await sendMessage(message);
                this.queue.shift();
                this.persistQueue();
            } catch (error) {
                console.error('Failed to process queued message:', error);
                break;
            }
        }
    }
};

// Initialize chat system
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    initializeWebSocket();
    setupEventListeners();
    messageQueue.loadQueue();
});

async function initializeChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) {
        console.error('Chat box element not found!');
        return;
    }

    // Initialize IntersectionObserver for lazy loading images
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                observer.unobserve(img);
            }
        });
    });

    // Setup infinite scroll
    const scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && state.hasMore && !state.isLoading) {
            loadMoreMessages();
        }
    }, { threshold: 0.1 });

    // Add sentinel element for infinite scroll
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    chatBox.insertBefore(sentinel, chatBox.firstChild);
    scrollObserver.observe(sentinel);

    // Initial load
    await loadMessages();
}

async function loadMessages(page = 1) {
    if (state.isLoading) return;
    
    state.isLoading = true;
    updateLoadingState(true);
    
    try {
        const response = await fetch(`get_messages.php?page=${page}&limit=${state.messagesPerPage}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        // Update state
        state.currentPage = page;
        state.hasMore = data.pagination.hasMore;
        state.lastFetch = new Date();
        
        // Process messages
        const fragment = document.createDocumentFragment();
        data.messages.forEach(message => {
            const messageElement = createMessageElement(message);
            state.messageCache.set(message.id, message);
            fragment.appendChild(messageElement);
        });
        
        const chatBox = document.getElementById('chat-box');
        const oldScrollHeight = chatBox.scrollHeight;
        
        if (page === 1) {
            chatBox.innerHTML = '';
            chatBox.appendChild(fragment);
            chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            chatBox.insertBefore(fragment, chatBox.firstChild);
            chatBox.scrollTop = chatBox.scrollHeight - oldScrollHeight;
        }
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Failed to load messages. Please try again.');
        
        // Implement exponential backoff for retries
        if (state.reconnectAttempts < state.maxReconnectAttempts) {
            setTimeout(() => {
                state.reconnectAttempts++;
                loadMessages(page);
            }, state.reconnectDelay * Math.pow(2, state.reconnectAttempts));
        }
    } finally {
        state.isLoading = false;
        updateLoadingState(false);
    }
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.user_id === getCurrentUserId() ? 'own-message' : ''}`;
    messageDiv.dataset.messageId = message.id;
    
    // Message header
    const header = document.createElement('div');
    header.className = 'message-header';
    
    const avatar = document.createElement('img');
    avatar.className = 'user-avatar';
    avatar.src = message.avatar_url || 'default-avatar.png';
    avatar.alt = `${message.username}'s avatar`;
    
    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';
    userInfo.innerHTML = `
        <strong class="username">${escapeHtml(message.username)}</strong>
        <span class="user-role ${message.role}">${message.role}</span>
        <span class="timestamp" title="${new Date(message.timestamp).toLocaleString()}">
            ${formatTimestamp(message.timestamp)}
        </span>
        ${message.edited_at ? '<span class="edited-indicator">(edited)</span>' : ''}
    `;
    
    header.appendChild(avatar);
    header.appendChild(userInfo);
    
    // Message content
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = formatMessageContent(message.message);
    
    // File attachments
    if (message.attachments && message.attachments.length > 0) {
        const attachmentsDiv = document.createElement('div');
        attachmentsDiv.className = 'attachments';
        
        message.attachments.forEach(attachment => {
            const attachmentElement = createAttachmentPreview(attachment);
            attachmentsDiv.appendChild(attachmentElement);
        });
        
        content.appendChild(attachmentsDiv);
    }
    
    // Reactions
    if (message.reactions && Object.keys(message.reactions).length > 0) {
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'reactions';
        
        Object.entries(message.reactions).forEach(([type, count]) => {
            const reaction = document.createElement('span');
            reaction.className = 'reaction';
            reaction.innerHTML = `${type} ${count}`;
            reaction.onclick = () => toggleReaction(message.id, type);
            reactionsDiv.appendChild(reaction);
        });
        
        content.appendChild(reactionsDiv);
    }
    
    // Action buttons
    if (message.can_edit || message.can_delete) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        if (message.can_edit) {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.onclick = () => editMessage(message.id);
            actions.appendChild(editBtn);
        }
        
        if (message.can_delete) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.onclick = () => deleteMessage(message.id);
            actions.appendChild(deleteBtn);
        }
        
        header.appendChild(actions);
    }
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    
    return messageDiv;
}

function createAttachmentPreview(attachment) {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'attachment-preview';
    
    if (attachment.file_type.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'lazy-image';
        img.dataset.src = attachment.file_path;
        img.alt = attachment.file_name;
        img.loading = 'lazy';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'image-wrapper';
        wrapper.appendChild(img);
        
        // Add lightbox functionality
        wrapper.onclick = () => openLightbox(attachment.file_path);
        
        previewDiv.appendChild(wrapper);
    } else {
        const fileLink = document.createElement('a');
        fileLink.href = attachment.file_path;
        fileLink.className = 'file-attachment';
        fileLink.target = '_blank';
        
        const fileIcon = document.createElement('span');
        fileIcon.className = 'file-icon';
        fileIcon.textContent = getFileIcon(attachment.file_type);
        
        const fileInfo = document.createElement('span');
        fileInfo.className = 'file-info';
        fileInfo.textContent = `${attachment.file_name} (${formatFileSize(attachment.file_size)})`;
        
        fileLink.appendChild(fileIcon);
        fileLink.appendChild(fileInfo);
        previewDiv.appendChild(fileLink);
    }
    
    return previewDiv;
}

// Utility functions
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // less than 1 minute
        return 'just now';
    } else if (diff < 3600000) { // less than 1 hour
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
    } else if (diff < 86400000) { // less than 1 day
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
    } else if (diff < 604800000) { // less than 1 week
        const days = Math.floor(diff / 86400000);
        return `${days}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(fileType) {
    const icons = {
        'image/': '🖼️',
        'video/': '🎥',
        'audio/': '🎵',
        'text/': '📄',
        'application/pdf': '📕',
        'application/zip': '📦',
        'application/x-zip-compressed': '📦',
        'application/x-rar-compressed': '📦'
    };
    
    for (const [type, icon] of Object.entries(icons)) {
        if (fileType.startsWith(type)) return icon;
    }
    return '📎';
}

// WebSocket handling
function initializeWebSocket() {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        state.reconnectAttempts = 0;
        messageQueue.processQueue();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (state.reconnectAttempts < state.maxReconnectAttempts) {
            setTimeout(() => {
                state.reconnectAttempts++;
                initializeWebSocket();
            }, state.reconnectDelay * Math.pow(2, state.reconnectAttempts));
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_message':
            appendNewMessage(data.message);
            break;
        case 'edit_message':
            updateMessage(data.message);
            break;
        case 'delete_message':
            removeMessage(data.message_id);
            break;
        case 'reaction':
            updateMessageReactions(data.message_id, data.reactions);
            break;
        case 'user_status':
            updateUserStatus(data.user_id, data.status);
            break;
        default:
            console.warn('Unknown message type:', data.type);
    }
}

// Error handling and notifications
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const chatBox = document.getElementById('chat-box');
    chatBox.insertBefore(errorDiv, chatBox.firstChild);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function updateLoadingState(isLoading) {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
    }
}

// Export functions for external use
window.chatSystem = {
    loadMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    refreshMessages: () => loadMessages(1)
};
