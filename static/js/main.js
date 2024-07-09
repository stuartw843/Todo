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
let quill;

function toggleEditorSize() {
    const editorContainer = document.getElementById('quill-editor-container');
    const toggleIcon = document.getElementById('toggle-icon');
    const modalContent = document.querySelector('#note-modal .modal-content');
    editorContainer.classList.toggle('expanded');
    modalContent.classList.toggle('expanded-editor');
    if (editorContainer.classList.contains('expanded')) {
        toggleIcon.classList.remove('fa-expand');
        toggleIcon.classList.add('fa-compress');
    } else {
        toggleIcon.classList.remove('fa-compress');
        toggleIcon.classList.add('fa-expand');
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    quill = new Quill('#quill-editor', {
        theme: 'snow'
    });
    initFuse();
    loadLocalData();
    initCouchDBSync();

    // Initialize Sortable for each task list with handle option
    const highImpactTasks = document.getElementById('high-impact-tasks');
    const todoTasks = document.getElementById('todo-tasks');
    const doneTasks = document.getElementById('done-tasks');

    [highImpactTasks, todoTasks, doneTasks].forEach(list => {
        new Sortable(list, {
            group: 'tasks',
            handle: '.task-handle', // Specify the handle for dragging
            animation: 150,
            onEnd: updateTaskOrder
        });
    });
});


// Function to update task order in the database
async function updateTaskOrder(event) {
    const fromListId = event.from.id;
    const toListId = event.to.id;
    const newOrder = [...event.to.children].map(child => child.dataset.id);

    // Determine the new status based on the target list
    let newStatus;
    if (toListId === 'high-impact-tasks') {
        newStatus = 'High Impact';
    } else if (toListId === 'todo-tasks') {
        newStatus = 'Todo';
    } else if (toListId === 'done-tasks') {
        newStatus = 'Done';
    }

    // Update the task order and status
    for (let i = 0; i < newOrder.length; i++) {
        const taskId = newOrder[i];
        let task = tasks.find(t => t._id === taskId);

        // Fetch the latest revision of the document
        try {
            const latestDoc = await db.get(taskId);
            task = { ...task, ...latestDoc };
        } catch (error) {
            console.error('Failed to fetch the latest document revision:', error);
            continue;
        }

        task.order = i;
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();
        task.source = 'local';

        // Attempt to update the document
        try {
            await db.put(task);
        } catch (error) {
            console.error('Failed to update the document:', error);
        }
    }

    // Re-fetch and display tasks to ensure correct order
    await loadLocalData();
    displayTasks();
}

function initFuse() {
    fuse = new Fuse(notes, {
        keys: ['title', 'content'],
        threshold: 0.3
    });
}

function showPage(page) {
    document.getElementById('notes-page').classList.add('hidden');
    document.getElementById('tasks-page').classList.add('hidden');
    document.getElementById(page + '-page').classList.remove('hidden');
    if (page === 'notes') {
        displayNotes();
    } else if (page === 'tasks') {
        displayTasks();
    }
}

function displayNotes(filteredNotes = notes) {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';
    filteredNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    filteredNotes.forEach(note => {
        const noteDiv = document.createElement('div');
        noteDiv.classList.add('note');
        noteDiv.innerHTML = `
            <h3>${note.title}</h3>
            <div class="note-content">${converter.makeHtml(note.content)}</div>
            <small>Updated: ${new Date(note.updatedAt).toLocaleString()}</small>
            <button class="task-button" onclick="editNoteModal('${note._id}'); event.stopPropagation();"><i class="fas fa-edit"></i></button>
            <button class="task-button" onclick="deleteNoteModal('${note._id}'); event.stopPropagation();"><i class="fas fa-trash"></i></button>
        `;
        noteDiv.addEventListener('click', () => viewNoteModal(note));
        notesList.appendChild(noteDiv);
    });
}

function viewNoteModal(note) {
    document.getElementById('view-note-title').innerText = note.title;
    document.getElementById('view-note-content').innerHTML = converter.makeHtml(note.content);
    const noteTasksDiv = document.getElementById('view-note-tasks');
    noteTasksDiv.innerHTML = '';
    note.tasks.forEach(taskId => {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
            const taskDiv = document.createElement('div');
            taskDiv.classList.add('task-card');
            taskDiv.dataset.id = task._id;
            taskDiv.innerHTML = `
                <div class="task-header">
                    <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                </div>
                <div class="task-details">
                    <span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''}</span>
                </div>
            `;
            noteTasksDiv.appendChild(taskDiv);
        }
    });
    document.getElementById('view-note-modal').classList.remove('hidden');
}

function hideViewNoteModal() {
    document.getElementById('view-note-modal').classList.add('hidden');
}

function searchNotes() {
    const searchTerm = document.getElementById('search-input').value;
    if (!searchTerm) {
        displayNotes(notes);
        return;
    }
    const results = fuse.search(searchTerm);
    const filteredNotes = results.map(result => result.item);
    displayNotes(filteredNotes);
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    displayNotes(notes);
}

function showNoteForm(note) {
    document.getElementById('note-modal').classList.remove('hidden');
    document.getElementById('note-tasks').innerHTML = '';
    if (note) {
        document.getElementById('note-title').value = note.title;
        quill.root.innerHTML = converter.makeHtml(note.content);
        note.tasks.forEach(taskId => {
            const task = tasks.find(t => t._id === taskId);
            if (task) addNoteTask(task);
        });
        editingNoteId = note._id;
    } else {
        document.getElementById('note-title').value = '';
        quill.root.innerHTML = '';
        editingNoteId = null;
    }
}

function hideNoteForm() {
    document.getElementById('note-modal').classList.add('hidden');
}

function toggleModalSize() {
    const modalContent = document.querySelector('#note-modal .modal-content');
    const toggleButton = document.getElementById('toggle-size-button');
    modalContent.classList.toggle('expanded');
    if (modalContent.classList.contains('expanded')) {
        toggleButton.textContent = 'Collapse';
    } else {
        toggleButton.textContent = 'Expand';
    }
}

async function saveNote() {
    const title = document.getElementById('note-title').value;
    const content = quill.root.innerHTML;
    const taskElements = document.querySelectorAll('#note-tasks .task');
    const noteTasks = [];
    for (const taskElement of taskElements) {
        const taskId = taskElement.dataset.id;
        if (taskId) {
            noteTasks.push(taskId);
        } else {
            const task = {
    _id: uuid.v4(),
    description,
    isDone: false,
    dueDate,
    status,
    order: tasks.filter(t => t.status === status).length,
    updatedAt,
    source: 'local',
    type: 'task'
};
tasks.push(task);
await db.put(task);
            noteTasks.push(task._id);
            
        }
    }
    const updatedAt = new Date().toISOString();
    if (editingNoteId) {
        const note = notes.find(n => n._id === editingNoteId);
        note.title = title;
        note.content = content;
        note.tasks = noteTasks;
        note.updatedAt = updatedAt;
        note.source = 'local';
        await db.put(note);
    } else {
        const note = {
            _id: uuid.v4(),
            title,
            content,
            tasks: noteTasks,
            updatedAt,
            source: 'local',
            type: 'note'
        };
        notes.push(note);
        await db.put(note);
    }
    syncDataWithCouchDB();
    initFuse();
    hideNoteForm();
    displayNotes();
    displayTasks();
}

function addNoteTask(task) {
    const noteTasksDiv = document.getElementById('note-tasks');
    const taskDiv = document.createElement('div');
    taskDiv.classList.add('task');
    taskDiv.dataset.id = task ? task._id : '';
    taskDiv.innerHTML = `
        <input type="text" class="task-desc" placeholder="Task description" value="${task ? task.description : ''}">
            <input type="date" class="task-due-date" value="${task ? task.dueDate : ''}">
        <select class="task-status">
            ${statuses.map(status => `<option value="${status}" ${task && task.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
    `;
    noteTasksDiv.appendChild(taskDiv);
}

function editNoteModal(id) {
    const note = notes.find(n => n._id === id);
    showNoteForm(note);
}

async function deleteNoteModal(id) {
    if (confirm("Are you sure you want to delete this note?")) {
        const note = notes.find(n => n._id === id);
        if (note) {
            deletedItems.push({ _id: note._id, type: 'note', updatedAt: new Date().toISOString() });
            notes = notes.filter(n => n._id !== id);
            await db.remove(note);
            await db.put({ _id: note._id, _deleted: true });
            syncDataWithCouchDB();
            initFuse();
            displayNotes();
            displayTasks();
        }
    }
}

function displayTasks() {
    const highImpactTasksList = document.getElementById('high-impact-tasks');
    const todoTasksList = document.getElementById('todo-tasks');
    const doneTasksList = document.getElementById('done-tasks');

    highImpactTasksList.innerHTML = '';
    todoTasksList.innerHTML = '';
    doneTasksList.innerHTML = '';

    const renderTask = (task, list) => {
        const taskDiv = document.createElement('div');
        taskDiv.classList.add('task-card');
        taskDiv.dataset.id = task._id;
        taskDiv.innerHTML = `
            <div class="task-header">
                <div class="task-handle">☰</div> <!-- Add a handle element -->
                <input type="checkbox" ${task.isDone ? 'checked' : ''} onclick="toggleTaskDone('${task._id}')">
                <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                <div class="task-buttons">
                    <button class="task-button" onclick="editTask('${task._id}', event);"><i class="fas fa-edit"></i></button>
                    <button class="task-button" onclick="deleteTask('${task._id}', event);"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="task-details">
                <span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''}</span>
                ${task.noteId ? `<span class="related-note">Note: ${notes.find(n => n._id === task.noteId)?.title || ''}</span>` : ''}
            </div>
        `;
        list.appendChild(taskDiv);
    };

    tasks.filter(task => task.status === 'High Impact').sort((a, b) => a.order - b.order).forEach(task => renderTask(task, highImpactTasksList));
    tasks.filter(task => task.status === 'Todo').sort((a, b) => a.order - b.order).forEach(task => renderTask(task, todoTasksList));
    tasks.filter(task => task.status === 'Done').sort((a, b) => a.order - b.order).forEach(task => renderTask(task, doneTasksList));
}

// Ensure that event.stopPropagation() is called within the editTask and deleteTask functions
function editTask(id, event) {
    event.stopPropagation();
    const task = tasks.find(t => t._id === id);
    showTaskForm(task);
}

async function deleteTask(id, event) {
    event.stopPropagation();
    const task = tasks.find(t => t._id === id);
    if (task) {
        deletedItems.push({ _id: task._id, type: 'task', updatedAt: new Date().toISOString() });
        tasks = tasks.filter(t => t._id !== id);
        await db.remove(task);
        await db.put({ _id: task._id, _deleted: true });
        syncDataWithCouchDB();
        displayTasks();
        displayNotes();
    }
}

async function changeTaskStatus(taskId, newStatus) {
    const task = tasks.find(t => t._id === taskId);
    if (task) {
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();
        task.source = 'local';
        await db.put(task);
        syncDataWithCouchDB();
        displayTasks();
    }
}

function showTaskForm(task) {
    document.getElementById('task-modal').classList.remove('hidden');
    const statusSelect = document.getElementById('task-status');
    statusSelect.innerHTML = statuses.map(status => `<option value="${status}">${status}</option>`).join('');
    if (task) {
        document.getElementById('task-desc').value = task.description;
        document.getElementById('task-due-date').value = task.dueDate;
        statusSelect.value = task.status;
        editingTaskId = task._id;
    } else {
        document.getElementById('task-desc').value = '';
        document.getElementById('task-due-date').value = '';
        statusSelect.value = 'Todo';
        editingTaskId = null;
    }
}

function hideTaskForm() {
    document.getElementById('task-modal').classList.add('hidden');
}

async function saveTask() {
    const description = document.getElementById('task-desc').value;
    const dueDate = document.getElementById('task-due-date').value;
    const status = document.getElementById('task-status').value;
    const updatedAt = new Date().toISOString();
    if (editingTaskId) {
        const task = tasks.find(t => t._id === editingTaskId);
        task.description = description;
        task.dueDate = dueDate;
        task.status = status;
        task.updatedAt = updatedAt;
        task.source = 'local';
        await db.put(task);
    } else {
        const task = { _id: uuid.v4(), description, isDone: false, dueDate, status, updatedAt, source: 'local', type: 'task' };
        tasks.push(task);
        await db.put(task);
    }
    syncDataWithCouchDB();
    hideTaskForm();
    displayTasks();
    displayNotes();
}

async function toggleTaskDone(id) {
    const task = tasks.find(t => t._id === id);
    task.isDone = !task.isDone;
    task.updatedAt = new Date().toISOString();
    task.source = 'local';
    await db.put(task);
    syncDataWithCouchDB();
    displayTasks();
    displayNotes();
}

async function deleteAllNotesAndTasks() {
    if (confirm("Are you sure you want to delete all notes and tasks? This action cannot be undone.")) {
        for (const note of notes) {
            deletedItems.push({ _id: note._id, type: 'note', updatedAt: new Date().toISOString() });
            await db.remove(note);
            await db.put({ _id: note._id, _deleted: true });
        }
        for (const task of tasks) {
            deletedItems.push({ _id: task._id, type: 'task', updatedAt: new Date().toISOString() });
            await db.remove(task);
            await db.put({ _id: task._id, _deleted: true });
        }
        notes = [];
        tasks = [];
        syncDataWithCouchDB();
        displayNotes();
        displayTasks();
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

function updateSyncStatus(status) {
    const syncStatus = document.getElementById('sync-status');
    syncStatus.classList.remove('online', 'offline', 'syncing');
    syncStatus.classList.add(status);
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

window.addEventListener('offline', () => {
    console.log('You are offline');
    updateSyncStatus('offline');
});

window.addEventListener('online', () => {
    console.log('You are online');
    updateSyncStatus('syncing');
    syncDataWithCouchDB();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('static/service-worker.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// Initial setup
showPage('notes');
initFuse();
loadLocalData();
initCouchDBSync();

            
