let db = new PouchDB('notes_tasks');
let remoteDb = null;
const converter = new showdown.Converter();
const statuses = ["High Impact", "Todo"];
let notes = [];
let tasks = [];
let deletedItems = [];
let editingNoteId = null;
let editingTaskId = null;
let fuse;

function initFuse() {
    fuse = new Fuse(notes, {
        keys: ['title', 'content'],
        threshold: 0.3
    });
}

function updateSyncStatus(status) {
    const syncStatus = document.getElementById('sync-status');
    if (syncStatus) {
        syncStatus.classList.remove('online', 'offline', 'syncing');
        syncStatus.classList.add(status);
    } else {
        console.error("Sync status element not found.");
    }
}

function showPage(page) {
    history.pushState({ page: page }, '', `#${page}`);
    document.getElementById('notes-page').classList.add('hidden');
    document.getElementById('tasks-page').classList.add('hidden');
    document.getElementById(page + '-page').classList.remove('hidden');

    // Highlight active page in the nav bar
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`.nav-links a[onclick="showPage('${page}')"]`).classList.add('active');

    if (page === 'notes') {
        displayNotes();
    } else if (page === 'tasks') {
        displayTasks();
    }
}

window.addEventListener('popstate', function(event) {
    if (event.state) {
        showPage(event.state.page);
    }
});

