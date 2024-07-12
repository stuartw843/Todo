# Introduction
This project, fully developed through ChatGPT code prompting, is a web-based application designed to help users manage their notes and tasks efficiently. The app uses local storage to save data and offers the option to sync data with IBM Cloudant for cloud storage.

# Features
- Create, edit, and delete notes and tasks.
- Autosave functionality for notes and tasks.
- Drag-and-drop task reordering.
- Sync data with IBM Cloudant for cloud storage.
- Search functionality for notes.
- Snapshots for backup and restore.

# How the App Works
1. Notes and Tasks: Users can create notes and tasks. Each note can have multiple tasks associated with it.
2. Local Storage: The app uses local storage to save notes and tasks. This means your data is stored directly on your device.
3. Autosave: Notes and tasks are automatically saved as you type, ensuring no data is lost.
4. Task Management: Tasks can be reordered using drag-and-drop functionality.
5. Search: The app provides a search feature to quickly find notes.
6. Snapshots: Users can create snapshots of their data for backup purposes and restore them when needed.

# Setup and Installation
## Prerequisites
- A web browser (preferably the latest version of Chrome, Firefox, or Edge)
- Internet connection (for initial setup and cloud sync)
## Running the App Locally
1. Clone the Repository:
```sh
git clone https://github.com/your-repo/notes-tasks-app.git
cd notes-tasks-app
```
2. Open index.html in a Web Browser:
Simply open the index.html file in your preferred web browser.

# Setting Up Cloudant for Cloud Syncing
Create a Cloudant Account:

Sign up for an IBM Cloud account if you don't already have one.
Create a Cloudant service instance from the IBM Cloud catalog.

Get Cloudant Credentials:

- Go to your Cloudant service dashboard.
- Navigate to the "Service Credentials" section.
- Create a new set of credentials if none exist.
- Copy the url, username, and password from the credentials.

Configure the App:

- Open the app in your web browser.
- Go to the settings page by clicking on the settings icon.
- Enter the Cloudant url, username, and password into the respective fields.
- Save the settings to enable cloud syncing.

# Setting Up a License for TinyMCE
TinyMCE requires a license.

Obtain a License:
- Visit the TinyMCE pricing page and choose a plan that suits your needs.
- Follow the instructions to purchase a license and obtain your license key.

Configure TinyMCE with Your License Key:
- Open index.html.
- Add your TinyMCE API key in the script URL:
```html
<script src="https://cdn.tiny.cloud/1/your-api-key/tinymce/6/tinymce.min.js" referrerpolicy="origin"></script>
```

# Snapshots
Snapshots are automatically created on edits and stored for 7 days.

Restore snapshots from the settings page.


Warning: This project is provided as-is with no warranty or support. Use it at your own risk. The authors and contributors are not responsible for any damages or issues that arise from using this software.

Feel free to contribute to this project by submitting issues or pull requests on GitHub. Your feedback and contributions are greatly appreciated!
