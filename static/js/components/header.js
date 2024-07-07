function initHeader() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const page = link.getAttribute('href').substring(1); // Assuming links are like <a href="#notes">Notes</a>
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
