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

function toggleEditorSize() {
    const editorContainer = document.getElementById('tinymce-editor-container');
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

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function stripHtml(html) {
    var tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

function cleanUpTinyMCE() {
    if (tinymce.get('tinymce-editor')) {
        tinymce.get('tinymce-editor').destroy();
    }
}

const debouncedAutoSaveNote = debounce(autoSaveNote, 2000);


document.addEventListener('DOMContentLoaded', (event) => {
    // Initialize TinyMCE editor
    tinymce.init({
        selector: '#tinymce-editor',
        height: 200,
        menubar: false,
        plugins: 'autosave lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table code autolink',
        toolbar: 'undo redo | formatselect | bold italic fullscreen | h1 h2 h3 | bullist numlist outdent indent | removeformat | link image backcolor',
        autosave_interval: '30s',
        content_css: '//www.tiny.cloud/css/codepen.min.css',
        setup: function (editor) {
            editor.on('Change', function () {
                debouncedAutoSaveNote();
            });
        },
        style_formats: [
            { title: 'Heading 1', format: 'h1' },
            { title: 'Heading 2', format: 'h2' },
            { title: 'Heading 3', format: 'h3' },
        ],
        formats: {
            h1: { block: 'h1' },
            h2: { block: 'h2' },
            h3: { block: 'h3' },
        },
        invalid_elements: 'script,iframe',
        extended_valid_elements: 'span[*],div[*]',
        link_context_toolbar: true,
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

async function updateTaskOrder(event) {
    const fromListId = event.from.id;
    const toListId = event.to.id;
    const newOrder = [...event.to.children].map(child => child.dataset.id);

    let newStatus;
    if (toListId === 'high-impact-tasks') {
        newStatus = 'High Impact';
    } else if (toListId === 'todo-tasks') {
        newStatus = 'Todo';
    }

    for (let i = 0; i < newOrder.length; i++) {
        const taskId = newOrder[i];
        let task = tasks.find(t => t._id === taskId);

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

        try {
            await db.put(task);
        } catch (error) {
            console.error('Failed to update the document:', error);
        }
    }

    await loadLocalData();
    displayTasks();
    createSnapshot();
}

function initFuse() {
    const processedNotes = notes.map(note => ({
        ...note,
        strippedContent: stripHtml(note.content)
    }));

    fuse = new Fuse(processedNotes, {
        keys: ['title', 'strippedContent'],
        threshold: 0.3
    });
}

function showPage(page) {
    document.getElementById('notes-page').classList.add('hidden');
    document.getElementById('tasks-page').classList.add('hidden');
    document.getElementById(page + '-page').classList.remove('hidden');
    if (page === 'notes') {
        displayNotes();
        initFuse();
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
    initFuse(); 
}

function viewNoteModal(note) {
    document.getElementById('view-note-title').innerText = note.title;
    document.getElementById('view-note-content').innerHTML = converter.makeHtml(note.content);
    const noteTasksDiv = document.getElementById('view-note-tasks');
    noteTasksDiv.innerHTML = '';

    const orderedTasks = note.tasks.map(taskId => tasks.find(t => t._id === taskId)).sort((a, b) => a.isDone - b.isDone || new Date(b.updatedAt) - new Date(a.updatedAt));

    orderedTasks.forEach(task => {
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
        tinymce.get('tinymce-editor').setContent(note.content);
        note.tasks.forEach(taskId => {
            const task = tasks.find(t => t._id === taskId);
            if (task) addNoteTask(task);
        });
        editingNoteId = note._id;
    } else {
        document.getElementById('note-title').value = '';
        tinymce.get('tinymce-editor').setContent('');
        editingNoteId = null;
    }
}


function hideNoteForm() {
    debouncedAutoSaveNote();
    document.getElementById('note-modal').classList.add('hidden');
    const taskElements = document.querySelectorAll('#note-tasks .task-item');
    taskElements.forEach(taskElement => {
        taskElement.querySelector('.task-desc').removeEventListener('input', autoSaveNote);
        taskElement.querySelector('.task-due-date').removeEventListener('input', autoSaveNote);
        taskElement.querySelector('.task-status').removeEventListener('change', autoSaveNote);
    });
    //cleanUpTinyMCE();
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
        const content = tinymce.get('tinymce-editor').getContent();
        const taskElements = document.querySelectorAll('#note-tasks .task-item');
        const noteTasks = [];

        if (!title && !content) {
            return;
        }

        for (const taskElement of taskElements) {
            const taskId = taskElement.dataset.id;
            const description = taskElement.querySelector('.task-desc').value.trim();
            const dueDate = taskElement.querySelector('.task-due-date').value;
            const status = taskElement.querySelector('.task-status').value;

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
                    noteId: editingNoteId
                };
                tasks.push(task);
            } else {
                task.description = description;
                task.dueDate = dueDate;
                task.status = status;
                task.updatedAt = new Date().toISOString();
                task.source = 'local';
                task.noteId = editingNoteId;
                delete task._deleted;
            }

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
            editingNoteId = note._id;
        }
        try {
            await db.put(note);
        } catch (error) {
            console.error('Error saving note:', error);
        }
        syncDataWithCouchDB();
        displayNotes();
        displayTasks();
        createSnapshot();
        initFuse();
    }, 1000);
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

    taskDiv.querySelector('.task-desc').addEventListener('input', autoSaveNote);
    taskDiv.querySelector('.task-due-date').addEventListener('input', autoSaveNote);
    taskDiv.querySelector('.task-status').addEventListener('change', autoSaveNote);
    
}

async function removeNoteTask(taskId, event) {
    event.stopPropagation();
    
    const taskElement = document.querySelector(`#note-tasks .task-item[data-id="${taskId}"]`);
    if (taskElement) {
        taskElement.querySelector('.task-desc').removeEventListener('input', autoSaveNote);
        taskElement.querySelector('.task-due-date').removeEventListener('input', autoSaveNote);
        taskElement.querySelector('.task-status').removeEventListener('change', autoSaveNote);

        taskElement.remove();
    }
    const taskIndex = tasks.findIndex(t => t._id === taskId);
    if (taskIndex > -1) {
        try {
            const task = await db.get(taskId);
            tasks[taskIndex] = { ...tasks[taskIndex], _deleted: true, _rev: task._rev };
        } catch (error) {
            console.error('Error fetching latest task revision:', error);
        }
    }
    debouncedAutoSaveNote();
}

function editNoteModal(id) {
    const note = notes.find(n => n._id === id);
    showNoteForm(note);
}

async function deleteNoteModal(id) {
    if (confirm("Are you sure you want to delete this note?")) {
        const note = notes.find(n => n._id === id);
        if (note) {
            const tasksToDelete = tasks.filter(task => note.tasks.includes(task._id));

            for (const task of tasksToDelete) {
                await db.remove(task);
                tasks = tasks.filter(t => t._id !== task._id);
            }

            deletedItems.push({ _id: note._id, type: 'note', updatedAt: new Date().toISOString() });
            notes = notes.filter(n => n._id !== id);
            await db.remove(note);

            syncDataWithCouchDB();
            displayNotes();
            initFuse();
            displayTasks();
            createSnapshot();
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
    tasks.filter(task => task.status === 'Done').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(task => renderTask(task, doneTasksList));
}

function editTask(id, event) {
    event.stopPropagation();
    const task = tasks.find(t => t._id === id);
    showTaskForm(task);
}

async function deleteTask(id, event) {
    event.stopPropagation();
    try {
        const task = await db.get(id);

        await db.remove(task);

        tasks = tasks.filter(t => t._id !== id);

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
        createSnapshot();
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
    createSnapshot();
}

async function toggleTaskDone(taskId) {
    try {
        const task = await db.get(taskId);
        task.isDone = !task.isDone;
        task.status = task.isDone ? 'Done' : 'Todo';
        task.updatedAt = new Date().toISOString();
        task.source = 'local';

        await db.put(task);

        const taskIndex = tasks.findIndex(t => t._id === taskId);
        if (taskIndex > -1) {
            tasks[taskIndex] = task;
        }

        displayTasks();
        displayNotes();
    } catch (error) {
        console.error('Failed to update the task:', error);
    }
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
        createSnapshot();
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
        fetch: function (url, opts) {
            opts.headers.set('Authorization', 'Basic ' + btoa(couchdbUsername + ':' + couchdbPassword));
            return PouchDB.fetch(url, opts);
        }
    });

    const dbSync = db.sync(remoteDb, {
        live: true,
        retry: true,
        back_off_function: function (delay) {
            if (delay === 0) {
                return 5000;
            }
            return delay * 1.5;
        }
    });

    // Increase the max listeners for the sync instance
    dbSync.on('change', (info) => {
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

    dbSync.setMaxListeners(30);
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

function createSnapshot() {
    const snapshot = {
        notes,
        tasks,
        deletedItems,
        timestamp: new Date().toISOString()
    };
    let snapshots = JSON.parse(localStorage.getItem('snapshots')) || [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    snapshots = snapshots.filter(snapshot => new Date(snapshot.timestamp) > sevenDaysAgo);

    const today = new Date().toISOString().split('T')[0];
    const todaySnapshotIndex = snapshots.findIndex(s => s.timestamp.split('T')[0] === today);
    if (todaySnapshotIndex >= 0) {
        snapshots[todaySnapshotIndex] = snapshot;
    } else {
        snapshots.push(snapshot);
    }

    localStorage.setItem('snapshots', JSON.stringify(snapshots));
    populateSnapshotDropdown();
}

async function clearDatabase() {
    if (confirm("Are you sure you want to clear the entire database? This action cannot be undone.")) {
        try {
            // Fetch all documents
            const allDocs = await db.allDocs();
            const deletePromises = allDocs.rows.map(doc => {
                return db.remove(doc.id, doc.value.rev);
            });

            // Wait for all delete operations to complete
            await Promise.all(deletePromises);

            // Reset local arrays
            notes = [];
            tasks = [];
            deletedItems = [];

            // Reinitialize the application state
            syncDataWithCouchDB();
            displayNotes();
            displayTasks();
            createSnapshot();
            alert("Database cleared successfully!");
        } catch (error) {
            console.error("Error clearing the database:", error);
            alert("An error occurred while clearing the database. Please try again.");
        }
    }
}
// Add the clearDatabase function to the global scope for the button to access it
window.clearDatabase = clearDatabase;

showPage('notes');
initFuse();
loadLocalData();
initCouchDBSync();
