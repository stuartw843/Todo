document.addEventListener('DOMContentLoaded', async () => {
    // Load templates
    const response = await fetch('static/html/templates.html');
    const templates = await response.text();
    document.getElementById('templates').innerHTML = templates;

    // Initialize components
    const headerTemplate = document.getElementById('header-template').content.cloneNode(true);
    document.getElementById('header-container').appendChild(headerTemplate);

    // Initialize global variables
    window.converter = new showdown.Converter();

    showPage('notes');
    initFuse();
    loadLocalData();
    initCouchDBSync();
    initHeader();
    initTasks();

    // Initialize Alpine.js after components are set up
    Alpine.start();
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
