let recognition;
let isRecording = false;
let currentNote = null;

function toggleMicrophone() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Web Speech API is not supported in this browser.');
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = function() {
        isRecording = true;
        document.getElementById('microphone-button').classList.add('recording');
        createNewNote();
    };

    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        updateNoteContent(finalTranscript + interimTranscript);
    };

    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        stopRecording();
    };

    recognition.onend = function() {
        if (isRecording) {
            recognition.start(); // Restart recognition if still recording
        }
    };

    recognition.start();
}

function stopRecording() {
    if (recognition) {
        isRecording = false;
        recognition.stop();
        document.getElementById('microphone-button').classList.remove('recording');
        saveFinalNote();
    }
}

function createNewNote() {
    const now = new Date();
    const title = `Note ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    currentNote = {
        _id: uuid.v4(),
        title: title,
        content: '',
        tasks: [],
        updatedAt: now.toISOString(),
        source: 'local',
        type: 'note'
    };
    notes.push(currentNote);
    displayNotes();
}

function updateNoteContent(transcript) {
    if (currentNote) {
        currentNote.content = transcript;
        currentNote.updatedAt = new Date().toISOString();
        displayNotes();
    }
}

async function saveFinalNote() {
    if (currentNote) {
        try {
            await db.put(currentNote);
        } catch (error) {
            console.error('Error saving note:', error);
        }
        currentNote = null;
        displayNotes();
        syncDataWithCouchDB();
        initFuse();
    }
}
