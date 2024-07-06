document.addEventListener('DOMContentLoaded', async () => {
    // Load templates
    const response = await fetch('static/html/templates.html');
    const templates = await response.text();
    document.querySelector('body').insertAdjacentHTML('beforeend', `<div x-html="templates"></div>`);

    Alpine.start();

    // Initialize components
    const headerTemplate = document.getElementById('header-template').content.cloneNode(true);
    document.getElementById('header-container').appendChild(headerTemplate);

    showPage('notes');
    initFuse();
    loadLocalData();
    initCouchDBSync();
    initHeader();
    initTasks();
});

function app() {
    return {
        page: 'notes',
        syncStatus: 'offline',
        templates: '',
        showPage,
        searchNotes,
        clearSearch,
        showNoteForm,
        showTaskForm,
        showSettings,
        hideSettings,
        addNoteTask,
        saveNote,
        hideNoteForm,
        saveTask,
        hideTaskForm,
        toggleTaskDone,
        deleteTask,
        changeTaskStatus
    };
}
