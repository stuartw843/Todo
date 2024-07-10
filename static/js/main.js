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
        theme: 'snow',
        modules: {
            history: {
                delay: 2000,
                maxStack: 500,
                userOnly: true
            },
        }
    });

    quill.on('text-change', () => {
        autoSaveNote();
    });

    initFuse();
    loadLocalData();
    initCouchDBSync();

    const highImpactTasks = document.getElementById('high-impact-tasks');
    const todoTasks = document.getElementById('todo-tasks');

    [highImpactTasks, todoTasks].forEach(list => {
        new Sortable(list, {
            group: 'tasks',
            handle: '.task-handle',
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
    createSnapshot(); // Update snapshot after saving
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
                    <input type="checkbox" ${task.isDone ? 'checked' : ''} onclick="toggleTaskDone('${task._id}')">
                    <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                    <div class="task-buttons">
                        <button class="task-button" onclick="editTask('${task._id}', event);"><i class="fas fa-edit"></i></button>
                        <button class="task-button" onclick="deleteTask('${task._id}', event);"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="task-details">
                    ${task.dueDate ? `<span>${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
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
    autoSaveNote();
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
let autoSaveTimeout;
async function autoSaveNote() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        const title = document.getElementById('note-title').value.trim();
        const content = quill.root.innerHTML.trim();
        const taskElements = document.querySelectorAll('#note-tasks .task-item');
        const noteTasks = [];

        // Don't save blank notes
        if (!title && !content) {
            return;
        }

        for (const taskElement of taskElements) {
            const taskId = taskElement.dataset.id;
            const description = taskElement.querySelector('.task-desc').value.trim();
            const dueDate = taskElement.querySelector('.task-due-date').value;
            const status = taskElement.querySelector('.task-status').value;

            // Don't save blank tasks
            if (!description) {
                continue;
            }

            let task = tasks.find(t => t._id === taskId);
            if (!task) {
                task = {
                    _id: taskId,
                    description,
                    isDone: false,
                    dueDate,
                    status,
                    updatedAt: new Date().toISOString(),
                    source: 'local',
                    type: 'task',
                    noteId: editingNoteId // Set noteId for new tasks
                };
                tasks.push(task);
            } else {
                task.description = description;
                task.dueDate = dueDate;
                task.status = status;
                task.updatedAt = new Date().toISOString();
                task.source = 'local';
                task.noteId = editingNoteId; // Update noteId for existing tasks
                delete task._deleted;
            }

            // Fetch the latest revision before saving
            try {
                const latestTask = await db.get(task._id);
                task._rev = latestTask._rev;
            } catch (error) {
                if (error.status !== 404) {
                    console.error('Error fetching latest task revision:', error);
                }
            }

            noteTasks.push(task._id);
            try {
                await db.put(task);
            } catch (error) {
                console.error('Error saving task:', error);
            }
        }

        // Handle tasks marked for deletion
        const tasksToDelete = tasks.filter(t => t._deleted);
        for (const task of tasksToDelete) {
            try {
                await db.remove(task);
            } catch (error) {
                console.error('Error deleting task:', error);
            }
        }
        tasks = tasks.filter(t => !t._deleted);

        const updatedAt = new Date().toISOString();
        let note;
        if (editingNoteId) {
            note = notes.find(n => n._id === editingNoteId);
            note.title = title;
            note.content = content;
            note.tasks = noteTasks;
            note.updatedAt = updatedAt;
            note.source = 'local';
            // Fetch the latest revision before saving
            try {
                const latestNote = await db.get(note._id);
                note._rev = latestNote._rev;
            } catch (error) {
                if (error.status !== 404) {
                    console.error('Error fetching latest note revision:', error);
                }
            }
        } else {
            note = {
                _id: uuid.v4(),
                title,
                content,
                tasks: noteTasks,
                updatedAt,
                source: 'local',
                type: 'note'
            };
            notes.push(note);
            editingNoteId = note._id; // Set editingNoteId to the newly created note's ID
        }
        try {
            await db.put(note);
        } catch (error) {
            console.error('Error saving note:', error);
        }
        syncDataWithCouchDB();
        initFuse();
        displayNotes();
        displayTasks();
        updateSnapshot(); // Update snapshot after saving
    }, 1000); // Save after 1 second of inactivity
}

function addNoteTask(task = {}) {
    const noteTasksDiv = document.getElementById('note-tasks');
    const taskId = task._id || uuid.v4();
    const taskDiv = document.createElement('div');
    taskDiv.classList.add('task-item');
    taskDiv.dataset.id = taskId;
    taskDiv.innerHTML = `
        <input type="text" class="task-desc" placeholder="Task description" value="${task.description || ''}">
        <input type="date" class="task-due-date" value="${task.dueDate || ''}">
        <select class="task-status">
            ${statuses.map(status => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
        <button onclick="removeNoteTask('${taskId}', event)"><i class="fas fa-trash"></i></button>
    `;
    noteTasksDiv.appendChild(taskDiv);

    // Add event listeners to trigger auto-save
    taskDiv.querySelector('.task-desc').addEventListener('input', autoSaveNote);
    taskDiv.querySelector('.task-due-date').addEventListener('input', autoSaveNote);
    taskDiv.querySelector('.task-status').addEventListener('change', autoSaveNote);
}


async function removeNoteTask(taskId, event) {
    event.stopPropagation();
    const taskElement = document.querySelector(`#note-tasks .task-item[data-id="${taskId}"]`);
    if (taskElement) {
        taskElement.remove();
    }
    // Mark the task for deletion if it exists in the tasks array
    const taskIndex = tasks.findIndex(t => t._id === taskId);
    if (taskIndex > -1) {
        try {
            const task = await db.get(taskId); // Fetch the latest revision
            tasks[taskIndex] = { ...tasks[taskIndex], _deleted: true, _rev: task._rev };
        } catch (error) {
            console.error('Error fetching latest task revision:', error);
        }
    }
    autoSaveNote(); // Trigger auto-save after removing a task
}



function editNoteModal(id) {
    const note = notes.find(n => n._id === id);
    showNoteForm(note);
}

async function deleteNoteModal(id) {
    if (confirm("Are you sure you want to delete this note?")) {
        const note = notes.find(n => n._id === id);
        if (note) {
            // Find all tasks associated with this note
            const tasksToDelete = tasks.filter(task => note.tasks.includes(task._id));

            // Delete each associated task from the database and tasks array
            for (const task of tasksToDelete) {
                await db.remove(task);
                tasks = tasks.filter(t => t._id !== task._id);
            }

            // Delete the note itself
            deletedItems.push({ _id: note._id, type: 'note', updatedAt: new Date().toISOString() });
            notes = notes.filter(n => n._id !== id);
            await db.remove(note);

            syncDataWithCouchDB();
            initFuse();
            displayNotes();
            displayTasks();
            createSnapshot(); // Update snapshot after saving
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
                <div class="task-handle">☰</div>
                <input type="checkbox" ${task.isDone ? 'checked' : ''} onclick="toggleTaskDone('${task._id}')">
                <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                <div class="task-buttons">
                    <button class="task-button" onclick="editTask('${task._id}', event);"><i class="fas fa-edit"></i></button>
                    <button class="task-button" onclick="deleteTask('${task._id}', event);"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="task-details">
                ${task.dueDate ? `<span>${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
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
    try {
        // Fetch the latest revision of the task
        const task = await db.get(id);
        
        // Mark the task for deletion
        await db.remove(task);
        
        // Remove the task from the local tasks array
        tasks = tasks.filter(t => t._id !== id);

        // Sync and update UI
        syncDataWithCouchDB();
        displayTasks();
        displayNotes();
    } catch (error) {
        console.error('Failed to delete the task:', error);
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
        createSnapshot(); // Update snapshot after saving
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
    createSnapshot(); // Update snapshot after saving
}

async function toggleTaskDone(id) {
    const task = tasks.find(t => t._id === id);
    task.isDone = !task.isDone;
    task.updatedAt = new Date().toISOString();
    task.status = task.isDone ? 'Done' : 'Todo'; // Update status based on done state
    task.source = 'local';

    try {
        await db.put(task);
    } catch (error) {
        console.error('Failed to update the document:', error);
    }

    // Re-fetch and display tasks to ensure correct order
    await loadLocalData();
    displayTasks();
    createSnapshot(); // Update snapshot after saving
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
        createSnapshot(); // Update snapshot after saving
    }
}

function showSettings() {
    populateSnapshotDropdown();
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

function populateSnapshotDropdown() {
    const snapshotSelect = document.getElementById('snapshot-select');
    snapshotSelect.innerHTML = '';
    const snapshots = JSON.parse(localStorage.getItem('snapshots')) || [];
    snapshots.forEach(snapshot => {
        const option = document.createElement('option');
        option.value = snapshot.timestamp;
        option.text = new Date(snapshot.timestamp).toLocaleString();
        snapshotSelect.appendChild(option);
    });
}


async function restoreSnapshot() {
    const snapshotSelect = document.getElementById('snapshot-select');
    const timestamp = snapshotSelect.value;
    const snapshots = JSON.parse(localStorage.getItem('snapshots')) || [];
    const snapshot = snapshots.find(s => s.timestamp === timestamp);

    if (snapshot) {
        notes = snapshot.notes;
        tasks = snapshot.tasks;
        deletedItems = snapshot.deletedItems;

        // Save the restored data to the database
        await db.bulkDocs([...notes, ...tasks, ...deletedItems]);

        syncDataWithCouchDB();
        initFuse();
        displayNotes();
        displayTasks();
        alert('Snapshot restored successfully!');
    } else {
        alert('Failed to restore snapshot.');
    }
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

function createSnapshot() {
    const snapshot = {
        notes,
        tasks,
        deletedItems,
        timestamp: new Date().toISOString()
    };
    let snapshots = JSON.parse(localStorage.getItem('snapshots')) || [];

    // Clean up old snapshots (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    snapshots = snapshots.filter(snapshot => new Date(snapshot.timestamp) > sevenDaysAgo);

    // Replace or add the snapshot for today
    const today = new Date().toISOString().split('T')[0];
    const todaySnapshotIndex = snapshots.findIndex(s => s.timestamp.split('T')[0] === today);
    if (todaySnapshotIndex >= 0) {
        snapshots[todaySnapshotIndex] = snapshot;
    } else {
        snapshots.push(snapshot);
    }

    localStorage.setItem('snapshots', JSON.stringify(snapshots));
    populateSnapshotDropdown(); // Refresh the dropdown
}


// Initial setup
showPage('notes');
initFuse();
loadLocalData();
initCouchDBSync();

            
