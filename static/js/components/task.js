function viewFullNotePage(note) {
    const notePageTemplate = document.getElementById('note-full-page-template').content.cloneNode(true);

    document.querySelector('.container').innerHTML = '';
    document.querySelector('.container').appendChild(notePageTemplate);

    const notePage = document.querySelector('.note-full-page');
    notePage.__x = Alpine.data('notePage', () => ({
        noteTitle: note.title,
        noteContent: converter.makeHtml(note.content)
    }));

    Alpine.start();

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

    // Load the header dynamically
    const headerTemplate = document.getElementById('header-template').content.cloneNode(true);
    document.getElementById('header-container').appendChild(headerTemplate);
    initHeader();
}

function goBack() {
    document.querySelector('.container').innerHTML = `
        <div id="notes-page" class="page">
            <div class="search-container">
                <input type="text" id="search-input" placeholder="Search Notes" @input="searchNotes()">
                <button class="clear-btn" @click="clearSearch()">×</button>
            </div>
            <div id="notes-list"></div>
        </div>
        <div id="tasks-page" class="page hidden">
            <h2>High Impact Tasks</h2>
            <div id="high-impact-tasks"></div>
            <h2>Todo Tasks</h2>
            <div id="todo-tasks"></div>
            <h2>Done Tasks</h2>
            <div id="done-tasks"></div>
        </div>
        <div id="settings-page" class="page hidden">
            <div class="modal" @click="hideSettings()">
                <div class="modal-content" @click.stop>
                    <span class="close" @click="hideSettings()">×</span>
                    <h2>Settings</h2>
                    <input type="text" id="couchdb-url" placeholder="CouchDB URL"><br>
                    <input type="text" id="couchdb-username" placeholder="CouchDB Username"><br>
                    <input type="password" id="couchdb-password" placeholder="CouchDB Password"><br>
                    <button @click="saveSettings()">Save Settings</button>
                    <button @click="hideSettings()">Cancel</button>
                </div>
            </div>
        </div>
    `;

    Alpine.start();

    initFuse();
    loadLocalData();
    initCouchDBSync();
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
