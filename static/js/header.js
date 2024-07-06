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
