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
            <button class="task-button" onclick="editNote('${note._id}')"><i class="fas fa-edit"></i></button>
            <button class="task-button" onclick="deleteNote('${note._id}')"><i class="fas fa-trash"></i></button>
        `;
        noteDiv.addEventListener('click', () => viewFullNotePage(note));
        notesList.appendChild(noteDiv);
    });
}

function viewFullNotePage(note) {
    const notePage = document.createElement('div');
    notePage.innerHTML = `
        <div id="header-container"></div>
        <div class="note-full-page">
            <button onclick="goBack()" class="back-button">Back</button>
            <h2>${note.title}</h2>
            <div class="note-content">${converter.makeHtml(note.content)}</div>
            <h3>Tasks</h3>
            <div id="note-tasks-page"></div>
        </div>
    `;
    document.body.innerHTML = '';
    document.body.appendChild(notePage);

    fetch('static/html/header.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('header-container').innerHTML = data;
            initHeader();
        });

    note.tasks.forEach(taskId => {
        const task = tasks.find(t => t._id === taskId);
        if (task) {
            const taskDiv = document.createElement('div');
            taskDiv.classList.add('task-card');
            taskDiv.dataset.id = task._id;
            taskDiv.innerHTML = `
                <div class="task-header">
                    <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                    <div class="task-buttons">
                        <button class="task-button" onclick="editTask('${task._id}')"><i class="fas fa-edit"></i></button>
                        <button class="task-button" onclick="deleteTask('${task._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="task-details">
                    <span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''}</span>
                </div>
            `;
            document.getElementById('note-tasks-page').appendChild(taskDiv);
        }
    });
}

function goBack() {
    document.body.innerHTML = `
        <div id="header-container"></div>
        <div class="container">
            <div id="notes-page">
                <div class="search-container">
                    <input type="text" id="search-input" placeholder="Search Notes" oninput="searchNotes()">
                    <button class="clear-btn" onclick="clearSearch()">×</button>
                </div>
                <div id="notes-list"></div>
            </div>
            <div id="tasks-page" class="hidden">
                <h2>High Impact Tasks</h2>
                <div id="high-impact-tasks"></div>
                <h2>Todo Tasks</h2>
                <div id="todo-tasks"></div>
                <h2>Done Tasks</h2>
                <div id="done-tasks"></div>
            </div>
            <div id="settings-page" class="hidden">
                <div class="modal" onclick="hideSettings()">
                    <div class="modal-content" onclick="event.stopPropagation()">
                        <span class="close" onclick="hideSettings()">&times;</span>
                        <h2>Settings</h2>
                        <input type="text" id="couchdb-url" placeholder="CouchDB URL"><br>
                        <input type="text" id="couchdb-username" placeholder="CouchDB Username"><br>
                        <input type="password" id="couchdb-password" placeholder="CouchDB Password"><br>
                        <button onclick="saveSettings()">Save Settings</button>
                        <button onclick="hideSettings()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    fetch('static/html/header.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('header-container').innerHTML = data;
            initHeader();
        });

    initFuse();
    loadLocalData();
    initCouchDBSync();
}

function editTask(id) {
    const task = tasks.find(t => t._id === id);
    showTaskForm(task);
}

function initHeader() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const page = link.getAttribute('onclick').match(/showPage\('(.+)'\)/)[1];
            showPage(page);
        });
    });

    document.querySelector('.settings-icon').addEventListener('click', (event) => {
        event.preventDefault();
        showSettings();
    });

    // Update sync status
    const syncStatus = localStorage.getItem('syncStatus');
    if (syncStatus) {
        updateSyncStatus(syncStatus);
    }
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
        document.getElementById('note-content').value = note.content;
        note.tasks.forEach(taskId => {
            const task = tasks.find(t => t._id === taskId);
            if (task) addNoteTask(task);
        });
        editingNoteId = note._id;
    } else {
        document.getElementById('note-title').value = '';
        document.getElementById('note-content').value = '';
        editingNoteId = null;
    }
}

function hideNoteForm() {
    document.getElementById('note-modal').classList.add('hidden');
}

async function saveNote() {
    const title = document.getElementById('note-title').value;
    const content = document.getElementById('note-content').value;
    const taskElements = document.querySelectorAll('#note-tasks .task');
    const noteTasks = [];
    for (const taskElement of taskElements) {
        const taskId = taskElement.dataset.id;
        if (taskId) {
            noteTasks.push(taskId);
        } else {
            const task = {
                _id: uuid.v4(),
                description: taskElement.querySelector('.task-desc').value,
                isDone: false,
                dueDate: taskElement.querySelector('.task-due-date').value,
                status: taskElement.querySelector('.task-status').value,
                updatedAt: new Date().toISOString(),
                source: 'local',
                type: 'task'
            };
            tasks.push(task);
            noteTasks.push(task._id);
            await db.put(task);
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

function editNote(id) {
    const note = notes.find(n => n._id === id);
    showNoteForm(note);
}

async function deleteNote(id) {
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
