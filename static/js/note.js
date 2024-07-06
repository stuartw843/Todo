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

function editTask(id) {
    const task = tasks.find(t => t._id === id);
    showTaskForm(task);
}
