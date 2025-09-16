document.addEventListener('DOMContentLoaded', () => {
    if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(function(permission) {
                console.log('Notification permission:', permission);
            }).catch(function(err){ console.warn('Notif perm error:', err); });
        }
    }

    const messager = new Messager();

    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const fileInput = document.getElementById('file-input');
    const attachBtn = document.getElementById('attach-file-btn');
    const submitBtn = chatForm.querySelector('button[type="submit"]');
    const filePreviewContainer = document.getElementById('file-preview-container');

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        const file = fileInput.files[0];
        
        if (!messageText && !file) return;
        
        submitBtn.disabled = true;
        
        const success = await messager.sendMessage(messageText, file);
        
        if (success) {
            chatForm.reset();
            messageInput.style.height = 'auto';
            filePreviewContainer.innerHTML = '';
        }
        
        submitBtn.disabled = false;
        messageInput.focus();
    };

    attachBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        filePreviewContainer.innerHTML = file ? 
            `Selected file: <strong>${file.name}</strong>` : '';
    });
    
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    });
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if(!submitBtn.disabled) {
                chatForm.dispatchEvent(new Event('submit', { 
                    cancelable: true, 
                    bubbles: true 
                }));
            }
        }
    });
    
    chatForm.addEventListener('submit', handleFormSubmit);

    messager.startPolling();
    messageInput.focus();
});