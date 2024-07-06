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

window.addEventListener('offline', () => {
    console.log('You are offline');
    updateSyncStatus('offline');
});

window.addEventListener('online', () => {
    console.log('You are online');
    updateSyncStatus('syncing');
    syncDataWithCouchDB();
});

// Initial setup
showPage('notes');
initFuse();
loadLocalData();
initCouchDBSync();
