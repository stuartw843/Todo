function updateSyncStatus(status) {
    const syncStatus = document.getElementById('sync-status');
    if (syncStatus) {
        syncStatus.classList.remove('online', 'offline', 'syncing');
        syncStatus.classList.add(status);
        localStorage.setItem('syncStatus', status);

        // Update Alpine.js state if available
        if (document.querySelector('[x-data]') && document.querySelector('[x-data]').__x) {
            document.querySelector('[x-data]').__x.$data.syncStatus = status;
        }
    } else {
        console.error("Sync status element not found.");
    }
}

function showSettings() {
    document.getElementById('settings-page').classList.remove('hidden');
}

function hideSettings() {
    document.getElementById('settings-page').classList.add('hidden');
}

function saveSettings() {
    localStorage.setItem('couchdbUrl', document.getElementById('couchdb-url').value);
    localStorage.setItem('couchdbUsername', document.getElementById('couchdb-username').value);
    localStorage.setItem('couchdbPassword', document.getElementById('couchdb-password').value);
    initCouchDBSync();
    hideSettings();
}

function showNoteForm() {
    document.getElementById('note-modal').classList.remove('hidden');
}

function hideNoteForm() {
    document.getElementById('note-modal').classList.add('hidden');
}

function showTaskForm() {
    document.getElementById('task-modal').classList.remove('hidden');
}

function hideTaskForm() {
    document.getElementById('task-modal').classList.add('hidden');
}
