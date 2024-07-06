function displayTasks() {
    const highImpactTasksList = document.getElementById('high-impact-tasks');
    const todoTasksList = document.getElementById('todo-tasks');
    const doneTasksList = document.getElementById('done-tasks');

    highImpactTasksList.innerHTML = '';
    todoTasksList.innerHTML = '';
    doneTasksList.innerHTML = '';

    tasks.forEach(task => {
        if (!task) return;  // Skip if task is undefined
        const taskDiv = document.createElement('div');
        taskDiv.classList.add('task-card');
        taskDiv.dataset.id = task._id;
        taskDiv.innerHTML = `
            <div class="task-header">
                <input type="checkbox" ${task.isDone ? 'checked' : ''} onclick="toggleTaskDone('${task._id}')">
                <span class="task-title ${task.isDone ? 'task-done' : ''}">${task.description}</span>
                <div class="task-buttons">
                    <button class="task-button" onclick="editTask('${task._id}')"><i class="fas fa-edit"></i></button>
                    <button class="task-button" onclick="deleteTask('${task._id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="task-details">
                <span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : ''}</span>
                ${task.noteId ? `<span class="related-note">Note: ${notes.find(n => n._id === task.noteId)?.title || ''}</span>` : ''}
            </div>
            <div class="task-action-buttons">
                ${task.status === 'Todo' ? '<button class="task-button" onclick="changeTaskStatus(\'' + task._id + '\', \'High Impact\')">^ High Impact</button>' : ''}
                ${task.status === 'High Impact' ? '<button class="task-button" onclick="changeTaskStatus(\'' + task._id + '\', \'Todo\')">v Todo</button>' : ''}
            </div>
        `;

        if (task.isDone) {
            doneTasksList.appendChild(taskDiv);
        } else if (task.status === 'High Impact') {
            highImpactTasksList.appendChild(taskDiv);
        } else if (task.status === 'Todo') {
            todoTasksList.appendChild(taskDiv);
        }
    });
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

function editTask(id) {
    const task = tasks.find(t => t._id === id);
    showTaskForm(task);
}

async function deleteTask(id) {
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
