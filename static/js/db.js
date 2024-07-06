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

async function syncDataWithCouchDB() {
    if (!remoteDb) {
        console.log('Remote CouchDB is not initialized');
        return;
    }

    updateSyncStatus('syncing');

    try {
        const result = await db.sync(remoteDb);
        console.log('Data synchronized successfully.', result);
        updateSyncStatus('online');
    } catch (error) {
        console.error('Data synchronization failed.', error);
        updateSyncStatus('offline');
    }
}

function initCouchDBSync() {
    const couchdbUrl = localStorage.getItem('couchdbUrl');
    const couchdbUsername = localStorage.getItem('couchdbUsername');
    const couchdbPassword = localStorage.getItem('couchdbPassword');

    if (!couchdbUrl || !couchdbUsername || !couchdbPassword) {
        console.log('CouchDB configuration is not complete');
        return;
    }

    remoteDb = new PouchDB(couchdbUrl, {
        auth: {
            username: couchdbUsername,
            password: couchdbPassword
        }
    });

    syncDataWithCouchDB();
    db.sync(remoteDb, {
        live: true,
        retry: true
    }).on('change', (info) => {
        console.log('Change detected', info);
        loadLocalData();
    }).on('paused', (err) => {
        console.log('Replication paused (e.g. replication up to date, user went offline)', err);
        if (!err) {
            updateSyncStatus('online');
        }
    }).on('active', () => {
        console.log('Replication resumed (e.g. new changes replicating, user went back online)');
        updateSyncStatus('syncing');
    }).on('denied', (err) => {
        console.error('Replication denied', err);
        updateSyncStatus('offline');
    }).on('complete', (info) => {
        console.log('Replication complete', info);
    }).on('error', (err) => {
        console.error('Replication error', err);
        updateSyncStatus('offline');
    });
}

async function loadLocalData() {
    const allDocs = await db.allDocs({ include_docs: true });
    notes = allDocs.rows.filter(doc => doc.doc.type === 'note').map(doc => doc.doc);
    tasks = allDocs.rows.filter(doc => doc.doc.type === 'task').map(doc => doc.doc);
    deletedItems = allDocs.rows.filter(doc => doc.doc.type === 'deleted').map(doc => doc.doc);
    initFuse();
    displayNotes();
    displayTasks();
}
