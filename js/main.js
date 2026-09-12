
// Initialize Application

async function loadPoolStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;
        const data = await response.json();

        document.getElementById('stat-total-val').textContent = data.total;
        document.getElementById('stat-draw-val').textContent = data.draw;
        document.getElementById('stat-exam-length-val').textContent = `50 Questions (Drawn from a pool of ${data.total})`;

        const variety = (data.total / data.draw).toFixed(1);
        document.getElementById('stat-variety-val').textContent = `${variety}×`;

        const limits = {
            "Objective 1_easy": 4,
            "Objective 1_medium": 11,
            "Objective 1_hard": 6,
            "Objective 2_easy": 6,
            "Objective 2_medium": 14,
            "Objective 2_hard": 9
        };

        const mapping = {
            "Objective 1_easy": { val: 'stat-o1e-val', sub: 'stat-o1e-sub' },
            "Objective 1_medium": { val: 'stat-o1m-val', sub: 'stat-o1m-sub' },
            "Objective 1_hard": { val: 'stat-o1h-val', sub: 'stat-o1h-sub' },
            "Objective 2_easy": { val: 'stat-o2e-val', sub: 'stat-o2e-sub' },
            "Objective 2_medium": { val: 'stat-o2m-val', sub: 'stat-o2m-sub' },
            "Objective 2_hard": { val: 'stat-o2h-val', sub: 'stat-o2h-sub' }
        };

        for (const [key, map] of Object.entries(mapping)) {
            const count = data.categories[key] || 0;
            const draw = limits[key];
            const coverage = (count / draw).toFixed(1);
            document.getElementById(map.val).textContent = `${coverage}×`;
            document.getElementById(map.sub).textContent = `${count} pool / ${draw} draw`;

            const valEl = document.getElementById(map.val);
            valEl.className = "pool-stat-value"; // reset
            if (coverage >= 4) valEl.classList.add("pool-coverage-good");
            else if (coverage >= 2) valEl.classList.add("pool-coverage-medium");
            else valEl.classList.add("pool-coverage-poor");
        }
    } catch (e) {
        console.error("Failed to load pool stats", e);
    }
}
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadExamHistory();
    loadPoolStats();
    restoreExamSession();
});


// Event Listeners Setup
function setupEventListeners() {
    elements.startExamBtn.addEventListener("click", startNewExam);
    elements.prevBtn.addEventListener("click", () => navigateQuestion(-1));
    elements.nextBtn.addEventListener("click", () => navigateQuestion(1));
    elements.submitBtn.addEventListener("click", openSubmitModal);
    elements.markReviewChk.addEventListener("change", handleMarkForReviewChange);
    elements.reportExitBtn.addEventListener("click", returnToDashboard);
    elements.newExamBtn.addEventListener("click", () => {
        returnToDashboard();
        setTimeout(startNewExam, 50); // small delay lets dashboard render first
    });

    // Sidebar toggle
    elements.toggleDrawerBtn.addEventListener("click", () => {
        elements.sidebarDrawer.classList.toggle("open");
        elements.sidebarDrawer.classList.toggle("closed");
        elements.toggleDrawerBtn.textContent = elements.sidebarDrawer.classList.contains("open") ? "◂" : "▸";
    });

    // CLI input handler
    elements.terminalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const cmd = elements.terminalInput.value.trim();
            elements.terminalInput.value = "";
            if (cmd) executeCommand(cmd);
        }
    });

    // Modal control handlers
    elements.modalCancelBtn.addEventListener("click", () => elements.submitModal.close());
    elements.modalConfirmBtn.addEventListener("click", submitExamForGrading);

    // Export focus guide click handler
    elements.exportReportBtn.addEventListener("click", exportFocusStudyGuide);

    // Global keyboard listener for hotkeys on single-choice questions
    // Also handles arrow key navigation and letter/number selection
    window.addEventListener("keydown", (e) => {
        // Skip hotkeys if user is currently typing in input or textarea fields
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea") return;

        // Only run if we are in the active exam view
        const examView = document.getElementById("exam-view");
        if (!examView || !examView.classList.contains("active")) return;

        // Arrow key navigation (works for all question types)
        if (e.key === "ArrowRight") {
            e.preventDefault();
            navigateQuestion(1);
            logStatus("Navigated → next question via arrow key.");
            return;
        }
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            navigateQuestion(-1);
            logStatus("Navigated ← previous question via arrow key.");
            return;
        }

        const q = state.questions[state.currentIdx];

        // M key: toggle Mark for Review (works for all question types)
        if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            elements.markReviewChk.checked = !elements.markReviewChk.checked;
            elements.markReviewChk.dispatchEvent(new Event("change"));
            logStatus(`Question ${state.currentIdx + 1} mark-for-review ${elements.markReviewChk.checked ? "set" : "cleared"} via keyboard.`);
            return;
        }

        if (!q || q.type !== "single-choice") return;

        const key = e.key.toUpperCase();
        let targetIdx = -1;

        if (key >= "1" && key <= "9") {
            targetIdx = parseInt(key) - 1;
        } else if (key >= "A" && key <= "I" && key.length === 1) {
            targetIdx = key.charCodeAt(0) - 65; // A = 65
        }

        if (targetIdx >= 0 && targetIdx < q.options.length) {
            e.preventDefault();
            const inputs = elements.answersContainer.querySelectorAll("input[type='radio']");
            if (inputs[targetIdx]) {
                inputs[targetIdx].click();
            }
        }
    });
}