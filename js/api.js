// REST Client: Load Past Exam Attempts
async function loadExamHistory() {
    try {
        const response = await fetch("/api/history");
        const data = await response.json();

        if (data.history && data.history.length > 0) {
            elements.historyTbody.innerHTML = "";
            data.history.forEach(item => {
                const date = new Date(item.timestamp).toLocaleString();
                const score = item.score;
                const statusClass = item.status === "PASS" ? "status-pass" : "status-fail";
                const total = item.correct_count + item.incorrect_count;

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${date}</td>
                    <td class="cmd-code">${score}</td>
                    <td><span class="badge-status ${statusClass}">${item.status}</span></td>
                    <td>${item.correct_count} / ${total}</td>
                    <td><button class="action-btn secondary-btn medium-btn view-report-btn" data-session="${item.session_id}">View Analytics</button></td>
                `;
                elements.historyTbody.appendChild(row);
            });

            // Bind click handlers to static view buttons
            document.querySelectorAll(".view-report-btn").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const sessId = e.target.getAttribute("data-session");
                    viewPastReport(sessId);
                });
            });
        } else {
            elements.historyTbody.innerHTML = `
                <tr>
                    <td colspan="5" class="no-history">No exam attempts found in database. Start a new exam to begin tracking.</td>
                </tr>
            `;
        }
    } catch (e) {
        console.error("Error loading exam history:", e);
    }
}

// REST Client: Initiate new mock session
async function startNewExam() {
    // Show loading state
    const btn = elements.startExamBtn;
    const originalText = btn.textContent;
    btn.textContent = "⏳ Loading exam...";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    try {
        logStatus("Initiating new mock session...");
        const response = await fetch("/api/exam/start", { method: "POST", body: JSON.stringify({}) });
        const data = await response.json();

        if (data.session_id) {
            // Setup session state
            state = {
                session_id: data.session_id,
                questions: data.questions,
                currentIdx: 0,
                answers: {},
                timeSpent: {},
                marked: new Set(),
                seen: new Set(),
                duration: 0,
                timerId: null,
                lastActiveTime: Date.now()
            };

            // Mark first question as seen
            state.seen.add(state.questions[0].id);

            saveSessionToLocalStorage();
            buildSidebarGrid();
            switchView("exam");
            loadQuestion(0);
            startTimer();
            logStatus("New exam session successfully started.");
        }
    } catch (e) {
        logStatus("Error starting exam: Server communication failure.");
        console.error(e);
    } finally {
        // Restore button regardless of outcome
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = "";
    }
}