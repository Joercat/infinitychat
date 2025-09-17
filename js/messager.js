class Messager {
    constructor() {
        this.chatBox = document.getElementById('chat-box');
        this.lastMessageId = 0;
        this.isFetching = false;
        this.pollingInterval = null;
        this.CHUNK_SIZE = 10 * 1024 * 1024;
    }

    async fetchMessages() {
        if (this.isFetching) return;
        this.isFetching = true;
        try {
            const response = await fetch(`api.php?action=get_messages&last_id=${this.lastMessageId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const messages = await response.json();
            if (messages.length > 0) {
                const isScrolledToBottom = this.chatBox.scrollHeight - this.chatBox.clientHeight <= this.chatBox.scrollTop + 50;
                messages.forEach(msg => this.renderMessage(msg));
                this.lastMessageId = messages[messages.length - 1].id;
                if (isScrolledToBottom) {
                    this.chatBox.scrollTop = this.chatBox.scrollHeight;
                }
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (this.pollingInterval) clearInterval(this.pollingInterval);
        } finally {
            this.isFetching = false;
        }
    }

renderMessage(msg) {
    const messageDiv = document.createElement('div');
    
    if (msg.message_type === 'system') {
        messageDiv.classList.add('message', 'message-system');
    } else {
        messageDiv.classList.add('message', msg.is_own ? 'message-own' : 'message-other');
    }
    
    let fileHtml = '';
    if (msg.file_path) {
        const fileName = msg.original_file_name;
        const filePath = msg.file_path;
        const mimeType = msg.file_mime_type || '';
        
        if (mimeType.startsWith('image/')) {
            fileHtml = `<a href="${filePath}" target="_blank"><img src="${filePath}" alt="${fileName}"></a>`;
        } else if (mimeType.startsWith('video/')) {
            fileHtml = `<video controls src="${filePath}" preload="metadata"></video>`;
        } else {
            fileHtml = `<a href="${filePath}" class="file-attachment" download="${fileName}"><svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13Z" /></svg><span>${fileName}</span></a>`;
        }
    }
    
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%?=~_|])/ig;
    const messageText = msg.message_text.replace(urlRegex, url => 
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
    
    
    if (msg.message_type === 'system') {
        messageDiv.innerHTML = `
            <div class="system-message-content">${messageText}</div>
            <div class="timestamp">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="meta">${msg.username}</div>
            <div class="message-content">${messageText}${fileHtml}</div>
            <div class="timestamp">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
    }
    
    this.chatBox.appendChild(messageDiv);

    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            if (!msg.is_own && (document.hidden || !document.hasFocus())) {
                let notifTitle, notifBody;
                
                if (msg.message_type === 'system') {
                    notifTitle = 'InfinityChat';
                    notifBody = msg.message_text;
                } else {
                    notifTitle = msg.username + ' — new message';
                    const tmpDiv = document.createElement('div');
                    tmpDiv.innerHTML = msg.message_text || '';
                    notifBody = tmpDiv.textContent || tmpDiv.innerText || '';
                    if (msg.original_file_name) {
                        notifBody += (notifBody ? ' — ' : '') + 'Attachment: ' + msg.original_file_name;
                    }
                }
                
                if (notifBody.length > 200) notifBody = notifBody.substring(0,197) + '...';
                const notification = new Notification(notifTitle, {
                    body: notifBody,
                    icon: 'images/favicon-32.png',
                    tag: 'chat-msg-' + msg.id
                });
                notification.onclick = function() {
                    window.focus();
                    this.close();
                };
            }
        }
    } catch (e) {
        console.warn('Notification error:', e);
    }
}

async updateUserStatus(status) {
    try {
        const formData = new FormData();
        formData.append('status', status);
        
        const response = await fetch('api.php?action=update_status', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            console.error('Failed to update user status');
        }
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}


    async uploadFileInChunks(file) {
        const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
        const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress');
        const progressFilename = document.getElementById('upload-filename');
        
        progressContainer.style.display = 'block';
        progressFilename.textContent = file.name;
        progressBar.value = 0;
        
        for (let chunkIndex = 1; chunkIndex <= totalChunks; chunkIndex++) {
            const start = (chunkIndex - 1) * this.CHUNK_SIZE;
            const chunk = file.slice(start, start + this.CHUNK_SIZE);
            const formData = new FormData();
            formData.append('fileChunk', chunk);
            formData.append('chunkIndex', chunkIndex);
            formData.append('totalChunks', totalChunks);
            formData.append('originalFilename', file.name);
            formData.append('fileIdentifier', uniqueId);
            
            try {
                const response = await fetch('api.php?action=upload_chunk', { 
                    method: 'POST', 
                    body: formData 
                });
                if (!response.ok) throw new Error(`Chunk ${chunkIndex} failed. Server responded with ${response.status}`);
                const result = await response.json();
                if (result.error) throw new Error(result.error);
                progressBar.value = (chunkIndex / totalChunks) * 100;
                if (chunkIndex === totalChunks && result.final_path) {
                    return { 
                        filePath: result.final_path, 
                        originalName: file.name, 
                        mimeType: file.type 
                    };
                }
            } catch (error) {
                console.error("Upload error:", error);
                alert('File upload failed: ' + error.message);
                progressContainer.style.display = 'none';
                return null;
            }
        }
    }

    async sendMessage(messageText, file = null) {
        let fileInfo = null;
        if (file) {
            fileInfo = await this.uploadFileInChunks(file);
            if (!fileInfo) return false;
        }
        
        const formData = new FormData();
        formData.append('message', messageText);
        if (fileInfo) {
            formData.append('file_path', fileInfo.filePath);
            formData.append('original_file_name', fileInfo.originalName);
            formData.append('file_mime_type', fileInfo.mimeType);
        }
        
        try {
            const response = await fetch('api.php?action=send_message', { 
                method: 'POST', 
                body: formData 
            });
            if (response.ok) {
                const progressContainer = document.getElementById('upload-progress-container');
                progressContainer.style.display = 'none';
                await this.fetchMessages();
                this.chatBox.scrollTop = this.chatBox.scrollHeight;
                return true;
            } else {
                const errorResult = await response.json();
                alert(`Failed to send message: ${errorResult.error || 'Unknown error'}`);
                return false;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('An error occurred. Please try again.');
            return false;
        }
    }

startPolling() {
    this.updateUserStatus('online');
    
    this.fetchMessages().then(() => {
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
        this.pollingInterval = setInterval(() => this.fetchMessages(), 1500);
    });
    
    window.addEventListener('beforeunload', () => {
        const formData = new FormData();
        formData.append('status', 'offline');
        navigator.sendBeacon('api.php?action=update_status', formData);
    });
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          
        } else {
            this.updateUserStatus('online');
        }
    });
}

stopPolling() {
    if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
    }
    this.updateUserStatus('offline');
}
}