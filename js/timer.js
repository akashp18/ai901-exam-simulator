
// Timer Logic
function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.lastActiveTime = Date.now();
    state.timerId = setInterval(() => {
        state.duration += 1;

        // Track time spent on the active question
        const activeQ = state.questions[state.currentIdx];
        if (activeQ) {
            state.timeSpent[activeQ.id] = (state.timeSpent[activeQ.id] || 0) + 1;
        }

        updateTimerDisplay();

        // Save state occasionally to survive browser closing
        if (state.duration % 10 === 0) {
            saveSessionToLocalStorage();
        }
    }, 1000);
}

function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
}

function updateTimerDisplay() {
    const hrs = Math.floor(state.duration / 3600).toString().padStart(2, '0');
    const mins = Math.floor((state.duration % 3600) / 60).toString().padStart(2, '0');
    const secs = (state.duration % 60).toString().padStart(2, '0');
    elements.examTimer.textContent = `${hrs}:${mins}:${secs}`;

    // Critical warning: turn timer red and pulsing when <10 minutes remain (600s)
    // The exam has no enforced time limit — this is a readiness signal
    if (state.duration >= 3000) { // 50 minutes elapsed
        elements.examTimer.classList.add("timer-critical");
    } else {
        elements.examTimer.classList.remove("timer-critical");
    }
}