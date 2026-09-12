// ═══════════════════════════════════════════════════════════════════════════
// AI-901 Exam Simulator — Client Logic
// ═══════════════════════════════════════════════════════════════════════════
// Sections:
//   1. XSS Sanitization Utility
//   2. Global Application State
//   3. DOM Element References
//   4. Initialisation
//   5. Event Listeners
//   6. REST API Clients (History, Start Exam)
//   7. Timer
//   8. Sidebar Grid
//   9. Question Renderer
//  10. Answer Types Renderer
//  11. Answer Extractor & Auto-save
//  12. Mark for Review
//  13. Navigation
//  14. Submit & Grading
//  15. Report Builder
//  16. Question Review Cards
//  17. Report Filter
//  18. Past Attempt Loader
//  19. View Switcher
//  20. LocalStorage Session Sync
//  21. System State Footer
//  22. CLI Command Parser
//  23. Review Card Renderer (Part 2)
//  24. Export / Study Guide
// ═══════════════════════════════════════════════════════════════════════════

// ─── § 1 · XSS Sanitization Utility ────────────────────────────────────────
// Safely escapes any HTML in text before inserting via innerHTML
function sanitize(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ─── § 2 · Global Application State ────────────────────────────────────────
let state = {
    session_id: null,
    questions: [],
    currentIdx: 0,
    answers: {},         // q_id -> user answer data structure
    timeSpent: {},       // q_id -> elapsed seconds
    marked: new Set(),   // Set of marked q_ids
    seen: new Set(),     // Set of seen q_ids
    duration: 0,         // total seconds elapsed
    timerId: null,
    lastActiveTime: null
};

// ─── § 3 · DOM Element References ───────────────────────────────────────────
const views = {
    dashboard: document.getElementById("dashboard-view"),
    exam: document.getElementById("exam-view"),
    report: document.getElementById("report-view")
};

const elements = {
    startExamBtn: document.getElementById("start-exam-btn"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    submitBtn: document.getElementById("submit-exam-btn"),
    markReviewChk: document.getElementById("mark-review-chk"),
    questionGrid: document.getElementById("question-grid"),
    toggleDrawerBtn: document.getElementById("toggle-drawer-btn"),
    sidebarDrawer: document.getElementById("sidebar-drawer"),
    
    // Question layout nodes
    qObjective: document.getElementById("q-meta-objective"),
    qDifficulty: document.getElementById("q-meta-difficulty"),
    qTopic: document.getElementById("q-meta-topic"),
    qScenarioCard: document.getElementById("q-scenario-card"),
    qScenarioText: document.getElementById("q-scenario-text"),
    qPromptText: document.getElementById("q-prompt-text"),
    answersContainer: document.getElementById("answers-container"),
    
    // Status text nodes
    questionProgressText: document.getElementById("question-progress-text"),
    examTimer: document.getElementById("exam-timer"),
    progressBarFill: document.getElementById("progress-bar-fill"),
    systemStateFooter: document.getElementById("system-state-footer"),
    
    // CLI nodes
    terminalInput: document.getElementById("terminal-input"),
    terminalStatusLog: document.getElementById("terminal-status-log"),
    
    // Modal nodes
    submitModal: document.getElementById("submit-modal-dialog"),
    modalWarningText: document.getElementById("modal-warning-text"),
    modalCancelBtn: document.getElementById("modal-cancel-btn"),
    modalConfirmBtn: document.getElementById("modal-confirm-btn"),
    
    // History table nodes
    historyTbody: document.getElementById("history-tbody"),
    
    // Report view nodes
    reportSessionId: document.getElementById("report-session-id"),
    gaugeFill: document.getElementById("gauge-fill"),
    gaugeText: document.getElementById("gauge-text"),
    passFailBadge: document.getElementById("pass-fail-badge"),
    passingProbVal: document.getElementById("passing-prob-val"),
    readinessLevelVal: document.getElementById("readiness-level-val"),
    obj1ProgressLabel: document.getElementById("obj1-progress-label"),
    obj1ProgressFill: document.getElementById("obj1-progress-fill"),
    obj2ProgressLabel: document.getElementById("obj2-progress-label"),
    obj2ProgressFill: document.getElementById("obj2-progress-fill"),
    diffEasyLabel: document.getElementById("diff-easy-label"),
    diffEasyFill: document.getElementById("diff-easy-fill"),
    diffMediumLabel: document.getElementById("diff-medium-label"),
    diffMediumFill: document.getElementById("diff-medium-fill"),
    diffHardLabel: document.getElementById("diff-hard-label"),
    diffHardFill: document.getElementById("diff-hard-fill"),
    confusionContainer: document.getElementById("confusion-container"),
    confidenceAnomalies: document.getElementById("confidence-anomalies"),
    readinessMatrixTbody: document.getElementById("readiness-matrix-tbody"),
    roadmapDay1List: document.getElementById("roadmap-day1-list"),
    roadmapDay2List: document.getElementById("roadmap-day2-list"),
    roadmapDay3List: document.getElementById("roadmap-day3-list"),
    learnRecommendationsContainer: document.getElementById("learn-recommendations-container"),
    nextHoursVal: document.getElementById("next-hours-val"),
    nextRetestVal: document.getElementById("next-retest-val"),
    blueprintWeakLabel: document.getElementById("blueprint-weak-label"),
    blueprintOtherLabel: document.getElementById("blueprint-other-label"),
    reviewQuestionsList: document.getElementById("review-questions-list"),
    reportExitBtn: document.getElementById("report-exit-btn"),
    newExamBtn: document.getElementById("new-exam-btn"),
    exportReportBtn: document.getElementById("export-report-btn"),
    // Question type meta badge
    qMetaType: document.getElementById("q-meta-type"),
    // Toast
    saveToast: document.getElementById("save-toast")
};

// ─── § 4 · Initialisation ───────────────────────────────────────────────────
// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    loadExamHistory();
    restoreExamSession();
});

// ─── § 5 · Event Listeners ──────────────────────────────────────────────────
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

// ─── § 6 · REST API Clients ─────────────────────────────────────────────────
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

// ─── § 7 · Timer ────────────────────────────────────────────────────────────
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

// ─── § 8 · Sidebar Grid ─────────────────────────────────────────────────────
// Dynamic Sidebar Grid Generator
function buildSidebarGrid() {
    elements.questionGrid.innerHTML = "";
    state.questions.forEach((q, idx) => {
        const btn = document.createElement("button");
        btn.id = `grid-btn-${idx}`;
        btn.className = "grid-btn";
        btn.textContent = idx + 1;
        
        // Visual indicator classes
        if (state.answers[q.id] !== undefined) {
            btn.classList.add("answered");
        }
        if (state.marked.has(q.id)) {
            btn.classList.add("marked");
        }
        
        btn.addEventListener("click", () => {
            saveCurrentAnswer();
            loadQuestion(idx);
        });
        
        elements.questionGrid.appendChild(btn);
    });
}

// ─── § 9 · Question Renderer ────────────────────────────────────────────────
// Load Question Details
function loadQuestion(index) {
    if (index < 0 || index >= state.questions.length) return;
    
    state.currentIdx = index;
    const q = state.questions[index];
    state.seen.add(q.id);
    
    // Update header metrics
    elements.questionProgressText.textContent = `Question ${index + 1} of ${state.questions.length}`;
    elements.progressBarFill.style.width = `${((index + 1) / state.questions.length) * 100}%`;
    
    // Set metadata tags
    elements.qObjective.textContent = q.objective;
    elements.qDifficulty.textContent = q.difficulty;
    elements.qTopic.textContent = q.topic;

    // Set question type badge
    const typeLabels = {
        "single-choice": "Single Choice",
        "multi-choice": "Multi-Select",
        "true-false-matrix": "True / False",
        "dropdown-hotspot": "Hotspot",
        "drag-drop": "Drag & Drop"
    };
    if (elements.qMetaType) {
        elements.qMetaType.textContent = typeLabels[q.type] || q.type;
    }
    
    // Set scenario description details
    if (q.scenario) {
        elements.qScenarioText.textContent = q.scenario;
        elements.qScenarioCard.style.display = "block";
    } else {
        elements.qScenarioCard.style.display = "none";
    }
    
    // Set prompt text
    elements.qPromptText.textContent = q.question;
    
    // Sync Review Marker checkbox
    elements.markReviewChk.checked = state.marked.has(q.id);
    
    // Update active state in grid navigation
    document.querySelectorAll(".grid-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`grid-btn-${index}`);
    if (activeBtn) activeBtn.classList.add("active");
    
    // Render answers container dynamically based on type
    renderAnswers(q);
    
    // Update bottom CLI states
    updateSystemStateFooter();
    saveSessionToLocalStorage();
}

// ─── § 10 · Answer Types Renderer ───────────────────────────────────────────
// Dynamically Render Input Types based on question structure
function renderAnswers(q) {
    elements.answersContainer.innerHTML = "";
    const savedAns = state.answers[q.id];

    switch (q.type) {
        case "single-choice":
            q.options.forEach((opt, oIdx) => {
                const label = document.createElement("label");
                label.className = "option-label";
                if (savedAns === opt) label.classList.add("selected");
                
                label.innerHTML = `
                    <input type="radio" name="single_choice" value="${opt}" ${savedAns === opt ? 'checked' : ''}>
                    <span class="radio-custom"></span>
                    ${opt}
                `;
                
                label.addEventListener("change", () => {
                    document.querySelectorAll(".option-label").forEach(l => l.classList.remove("selected"));
                    label.classList.add("selected");
                    saveCurrentAnswer();
                });
                
                elements.answersContainer.appendChild(label);
            });
            break;

        case "multi-choice":
            q.options.forEach((opt, oIdx) => {
                const label = document.createElement("label");
                label.className = "option-label";
                const isChecked = Array.isArray(savedAns) && savedAns.includes(opt);
                if (isChecked) label.classList.add("selected");
                
                label.innerHTML = `
                    <input type="checkbox" name="multi_choice" value="${opt}" ${isChecked ? 'checked' : ''}>
                    <span class="checkbox-custom"></span>
                    ${opt}
                `;
                
                label.addEventListener("change", (e) => {
                    label.classList.toggle("selected", e.target.checked);
                    saveCurrentAnswer();
                });
                
                elements.answersContainer.appendChild(label);
            });
            break;

        case "true-false-matrix":
            const table = document.createElement("table");
            table.className = "matrix-table";
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Statement</th>
                        <th>Yes</th>
                        <th>No</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector("tbody");
            
            // statements exist in option properties inside the pool object
            // but in python/sqlite they are read dynamically.
            // Let's assume options contains the statements list for matrix questions.
            q.options.forEach((stmt, sIdx) => {
                const tr = document.createElement("tr");
                const labelText = typeof stmt === 'object' ? stmt.text : stmt;
                const rowAns = Array.isArray(savedAns) ? savedAns[sIdx] : null;
                
                tr.innerHTML = `
                    <td>${labelText}</td>
                    <td><input type="radio" class="matrix-radio" name="matrix_row_${sIdx}" value="Yes" ${rowAns === 'Yes' ? 'checked' : ''}></td>
                    <td><input type="radio" class="matrix-radio" name="matrix_row_${sIdx}" value="No" ${rowAns === 'No' ? 'checked' : ''}></td>
                `;
                
                tr.querySelectorAll("input").forEach(radio => {
                    radio.addEventListener("change", () => saveCurrentAnswer());
                });
                
                tbody.appendChild(tr);
            });
            elements.answersContainer.appendChild(table);
            break;

        case "dropdown-hotspot":
            const p = document.createElement("p");
            p.className = "hotspot-paragraph";
            
            // options array stores parts: {text: "...", options: [...]}
            let pHTML = "";
            q.options.forEach((part, pIdx) => {
                pHTML += part.text;
                
                const selectAns = Array.isArray(savedAns) ? savedAns[pIdx] : "";
                
                let selectHTML = `<select class="hotspot-select" id="hotspot_sel_${pIdx}">`;
                selectHTML += `<option value="" disabled ${!selectAns ? 'selected' : ''}>-- Select --</option>`;
                part.options.forEach(opt => {
                    selectHTML += `<option value="${opt}" ${selectAns === opt ? 'selected' : ''}>${opt}</option>`;
                });
                selectHTML += `</select>`;
                
                pHTML += selectHTML;
            });
            
            p.innerHTML = pHTML;
            elements.answersContainer.appendChild(p);
            
            // Bind change listeners to inline selects
            p.querySelectorAll("select").forEach(sel => {
                sel.addEventListener("change", () => saveCurrentAnswer());
            });
            break;

        case "drag-drop":
            const dragPanel = document.createElement("div");
            dragPanel.className = "drag-drop-panel";
            
            // draggable items panel
            const dragItemsBox = document.createElement("div");
            dragItemsBox.className = "draggable-items-container";
            dragItemsBox.innerHTML = "<h4>Model Options</h4>";
            
            // targets panel
            const dragTargetsBox = document.createElement("div");
            dragTargetsBox.className = "drag-targets-container";
            
            const draggables = q.options.draggableItems || [];
            const targets = q.options.targets || [];

            // Track which items are already placed in a zone (for saved answer restore)
            const savedAnsForDrag = Array.isArray(savedAns) ? savedAns : [];
            const alreadyPlaced = new Set(savedAnsForDrag.filter(Boolean));
            
            // Render draggable boxes — only show if not already placed in a drop zone
            draggables.forEach((item, dIdx) => {
                if (alreadyPlaced.has(item)) return; // hidden from source if already dropped
                const dItem = document.createElement("div");
                dItem.className = "drag-item";
                dItem.draggable = true;
                dItem.textContent = item;
                // Use data attribute to safely carry item text (avoids nested- prefix hack)
                dItem.dataset.itemText = item;
                
                dItem.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("application/x-drag-item", item);
                    e.dataTransfer.setData("text/plain", item);
                    dItem.dataset.sourceType = "bank";
                });
                
                dragItemsBox.appendChild(dItem);
            });
            
            // Render target rows
            targets.forEach((target, tIdx) => {
                const row = document.createElement("div");
                row.className = "target-row";
                
                const labelEl = document.createElement("div");
                labelEl.className = "target-label";
                labelEl.textContent = target.label;
                
                const dropZone = document.createElement("div");
                dropZone.className = "drop-zone";
                dropZone.id = `drop-zone-${tIdx}`;
                dropZone.dataset.zoneIndex = tIdx;
                
                // Restore saved drop
                const savedDrop = savedAnsForDrag[tIdx];
                if (savedDrop) {
                    dropZone.innerHTML = "";
                    const dItem = document.createElement("div");
                    dItem.className = "drag-item";
                    dItem.draggable = true;
                    dItem.textContent = savedDrop;
                    dItem.dataset.itemText = savedDrop;
                    dItem.dataset.sourceType = "zone";
                    dItem.addEventListener("dragstart", (e) => {
                        e.dataTransfer.setData("application/x-drag-item", savedDrop);
                        e.dataTransfer.setData("text/plain", savedDrop);
                        e.dataTransfer.setData("application/x-source-zone", String(tIdx));
                    });
                    dropZone.appendChild(dItem);
                } else {
                    dropZone.textContent = "Drop item here";
                }
                
                // Drag-over and drag-leave
                dropZone.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    dropZone.classList.add("hover");
                });
                dropZone.addEventListener("dragleave", () => {
                    dropZone.classList.remove("hover");
                });

                // Drop handler — enforce one-item-per-zone and clear source zone if applicable
                dropZone.addEventListener("drop", (e) => {
                    e.preventDefault();
                    dropZone.classList.remove("hover");
                    
                    const itemText = e.dataTransfer.getData("application/x-drag-item") ||
                                     e.dataTransfer.getData("text/plain");
                    const sourceZoneIdx = e.dataTransfer.getData("application/x-source-zone");

                    if (!itemText) return;

                    // If dragging FROM another zone, clear that zone first (one-item-per-zone)
                    if (sourceZoneIdx !== "") {
                        const sourceZoneEl = document.getElementById(`drop-zone-${sourceZoneIdx}`);
                        if (sourceZoneEl && sourceZoneEl !== dropZone) {
                            sourceZoneEl.innerHTML = "Drop item here";
                        }
                    }

                    // If this zone already had an item, return it to the source bank
                    const existingItem = dropZone.querySelector(".drag-item");
                    if (existingItem) {
                        const existingText = existingItem.dataset.itemText;
                        // Add it back to bank if it came from bank originally
                        if (!alreadyPlaced.has(existingText) || existingText !== itemText) {
                            addItemBackToBank(dragItemsBox, existingText, draggables);
                        }
                    }

                    // Place new item in zone
                    dropZone.innerHTML = "";
                    const newItem = document.createElement("div");
                    newItem.className = "drag-item";
                    newItem.draggable = true;
                    newItem.textContent = itemText;
                    newItem.dataset.itemText = itemText;
                    newItem.dataset.sourceType = "zone";
                    newItem.addEventListener("dragstart", (ev) => {
                        ev.dataTransfer.setData("application/x-drag-item", itemText);
                        ev.dataTransfer.setData("text/plain", itemText);
                        ev.dataTransfer.setData("application/x-source-zone", String(tIdx));
                    });
                    dropZone.appendChild(newItem);

                    // Remove item from bank if it came from there
                    const bankItem = dragItemsBox.querySelector(`[data-item-text="${CSS.escape(itemText)}"]`);
                    if (bankItem) bankItem.remove();

                    saveCurrentAnswer();
                });
                
                // Double click to return item to bank
                dropZone.addEventListener("dblclick", () => {
                    const droppedItem = dropZone.querySelector(".drag-item");
                    if (droppedItem) {
                        const itemText = droppedItem.dataset.itemText;
                        addItemBackToBank(dragItemsBox, itemText, draggables);
                    }
                    dropZone.innerHTML = "Drop item here";
                    saveCurrentAnswer();
                });
                
                row.appendChild(labelEl);
                row.appendChild(dropZone);
                dragTargetsBox.appendChild(row);
            });
            
            dragPanel.appendChild(dragItemsBox);
            dragPanel.appendChild(dragTargetsBox);
            elements.answersContainer.appendChild(dragPanel);
            break;
    }
}

// ─── § 11 · Answer Extractor & Auto-save ────────────────────────────────────
// Extract and Save Active Answer
function saveCurrentAnswer() {
    const q = state.questions[state.currentIdx];
    if (!q) return;

    let ans = undefined;

    if (q.type === "single-choice") {
        const checked = elements.answersContainer.querySelector("input[name='single_choice']:checked");
        if (checked) ans = checked.value;
    } else if (q.type === "multi-choice") {
        const checkedBoxes = elements.answersContainer.querySelectorAll("input[name='multi_choice']:checked");
        if (checkedBoxes.length > 0) {
            ans = Array.from(checkedBoxes).map(cb => cb.value);
        }
    } else if (q.type === "true-false-matrix") {
        ans = [];
        const rows = elements.answersContainer.querySelectorAll("tbody tr");
        rows.forEach((row, idx) => {
            const checked = row.querySelector("input:checked");
            ans.push(checked ? checked.value : null);
        });
        
        // If all are null, treat as unanswered
        if (ans.every(item => item === null)) ans = undefined;
    } else if (q.type === "dropdown-hotspot") {
        ans = [];
        const selects = elements.answersContainer.querySelectorAll("select");
        selects.forEach(sel => {
            ans.push(sel.value || null);
        });
        if (ans.every(item => item === null)) ans = undefined;
    } else if (q.type === "drag-drop") {
        ans = [];
        const zones = elements.answersContainer.querySelectorAll(".drop-zone");
        zones.forEach(zone => {
            const dragItem = zone.querySelector(".drag-item");
            ans.push(dragItem ? dragItem.textContent : null);
        });
        if (ans.every(item => item === null)) ans = undefined;
    }

    const prevAnswer = state.answers[q.id];
    state.answers[q.id] = ans;

    // Trigger grid button color update
    const gridBtn = document.getElementById(`grid-btn-${state.currentIdx}`);
    if (gridBtn) {
        if (ans !== undefined) {
            gridBtn.classList.add("answered");
        } else {
            gridBtn.classList.remove("answered");
        }
    }

    // Show auto-save toast if answer changed
    if (ans !== undefined && JSON.stringify(ans) !== JSON.stringify(prevAnswer)) {
        showSaveToast();
    }

    // Sync to SQLite database
    const markedVal = state.marked.has(q.id) ? 1 : 0;
    const timeSpentVal = state.timeSpent[q.id] || 0;
    
    // Save to server in background
    syncAnswerToServer(q.id, ans, timeSpentVal, markedVal);
    
    // Local storage updates
    saveSessionToLocalStorage();
    updateSystemStateFooter();
}

async function syncAnswerToServer(qId, answerVal, timeSpentVal, markedVal) {
    try {
        await fetch("/api/exam/answer", {
            method: "POST",
            body: JSON.stringify({
                session_id: state.session_id,
                question_id: qId,
                selected_answer: answerVal !== undefined ? answerVal : null,
                time_spent: timeSpentVal,
                marked_for_review: markedVal
            })
        });
    } catch (e) {
        console.error("Failed to sync answer to server SQLite:", e);
    }
}

// ═══ § 12 · Mark for Review ══════════════════════════════════════════════════
// ─── Auto-save toast ────────────────────────────────────────────────────────
let toastTimer = null;
function showSaveToast() {
    if (!elements.saveToast) return;
    elements.saveToast.classList.add("toast-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        elements.saveToast.classList.remove("toast-visible");
    }, 1800);
}

// ─── § 12 · Mark for Review ─────────────────────────────────────────────────
// Mark for review state handler
function handleMarkForReviewChange() {
    const q = state.questions[state.currentIdx];
    if (!q) return;

    if (elements.markReviewChk.checked) {
        state.marked.add(q.id);
    } else {
        state.marked.delete(q.id);
    }

    // Sync button classes
    const btn = document.getElementById(`grid-btn-${state.currentIdx}`);
    if (btn) {
        btn.classList.toggle("marked", elements.markReviewChk.checked);
    }

    // Trigger save to synchronize reviews
    saveCurrentAnswer();
}

// ─── § 13 · Navigation ──────────────────────────────────────────────────────
// Navigation flow controls
function navigateQuestion(direction) {
    saveCurrentAnswer();
    const targetIdx = state.currentIdx + direction;
    if (targetIdx >= 0 && targetIdx < state.questions.length) {
        loadQuestion(targetIdx);
    }
}

// ─── § 14 · Submit & Grading ────────────────────────────────────────────────
// Submit confirmations
function openSubmitModal() {
    saveCurrentAnswer();
    
    // Count unanswered and marked questions
    let unansweredCount = 0;
    let markedCount = 0;
    state.questions.forEach(q => {
        if (state.answers[q.id] === undefined) unansweredCount++;
        if (state.marked.has(q.id)) markedCount++;
    });

    let warnParts = [];
    if (unansweredCount > 0) {
        warnParts.push(`${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}`);
    }
    if (markedCount > 0) {
        warnParts.push(`${markedCount} marked for review`);
    }

    if (warnParts.length > 0) {
        elements.modalWarningText.textContent = `⚠ WARNING: You still have ${warnParts.join(' and ')} in this session.`;
        elements.modalWarningText.style.color = "var(--error-color)";
        elements.modalWarningText.style.fontWeight = "bold";
    } else {
        elements.modalWarningText.textContent = "✓ All 50 questions answered with no pending review marks. Ready for evaluation.";
        elements.modalWarningText.style.color = "var(--success-color)";
        elements.modalWarningText.style.fontWeight = "normal";
    }

    elements.submitModal.showModal();
}

// Submit & Grade
async function submitExamForGrading() {
    elements.submitModal.close();
    stopTimer();
    
    logStatus("Submitting exam for grading. Compiling analytical report...");
    
    try {
        const response = await fetch("/api/exam/submit", {
            method: "POST",
            body: JSON.stringify({ session_id: state.session_id })
        });
        const report = await response.json();
        
        if (report.score !== undefined) {
            state.lastReport = report;
            renderFinalReport(report);
            clearSessionFromLocalStorage();
            switchView("report");
            logStatus("Report generated. Review diagnostics dashboard below.");
        }
    } catch (e) {
        logStatus("Grade submission error: Server connection lost.");
        console.error(e);
    }
}

// ─── § 15 · Report Builder ──────────────────────────────────────────────────
// Final Diagnostics Report Dashboard Generator
function renderFinalReport(report) {
    elements.reportSessionId.textContent = `Session ID: ${state.session_id}`;
    
    // Grade Gauge circle settings
    const scoreVal = report.score;
    elements.gaugeText.textContent = scoreVal;
    
    // stroke-dasharray = 283 (max circumference)
    // score maps 100-1000. Normalize offset:
    const pct = (scoreVal - 100) / 900;
    const offset = 283 - (pct * 283);
    elements.gaugeFill.style.strokeDashoffset = offset;
    
    // Set Pass/Fail labels
    elements.passFailBadge.textContent = report.status;
    elements.passFailBadge.className = `result-badge ${report.status === "PASS" ? "pass-badge" : "fail-badge"}`;
    
    elements.passingProbVal.textContent = `${report.passing_probability}%`;
    
    // Readiness level with color coding
    let readinessText = "Not Ready";
    let readinessClass = "readiness-low";
    if (scoreVal >= 800) {
        readinessText = "Highly Ready";
        readinessClass = "readiness-high";
    } else if (scoreVal >= 700) {
        readinessText = "Ready";
        readinessClass = "readiness-ready";
    }
    elements.readinessLevelVal.textContent = readinessText;
    elements.readinessLevelVal.className = readinessClass;

    // Objectives metrics
    const obj1 = report.objective_breakdown["Objective 1"];
    elements.obj1ProgressLabel.textContent = `${obj1.accuracy}% (${obj1.correct}/${obj1.total})`;
    elements.obj1ProgressFill.style.width = `${obj1.accuracy}%`;

    const obj2 = report.objective_breakdown["Objective 2"];
    elements.obj2ProgressLabel.textContent = `${obj2.accuracy}% (${obj2.correct}/${obj2.total})`;
    elements.obj2ProgressFill.style.width = `${obj2.accuracy}%`;

    // Difficulties metrics
    const easy = report.difficulty_breakdown["easy"];
    elements.diffEasyLabel.textContent = `${easy.accuracy}% (${easy.correct}/${easy.total})`;
    elements.diffEasyFill.style.width = `${easy.accuracy}%`;

    const med = report.difficulty_breakdown["medium"];
    elements.diffMediumLabel.textContent = `${med.accuracy}% (${med.correct}/${med.total})`;
    elements.diffMediumFill.style.width = `${med.accuracy}%`;

    const hard = report.difficulty_breakdown["hard"];
    elements.diffHardLabel.textContent = `${hard.accuracy}% (${hard.correct}/${hard.total})`;
    elements.diffHardFill.style.width = `${hard.accuracy}%`;

    // Confused services render
    elements.confusionContainer.innerHTML = "";
    if (report.service_confusion && report.service_confusion.length > 0) {
        report.service_confusion.forEach(c => {
            const div = document.createElement("div");
            div.className = "confusion-pair-row";
            div.innerHTML = `
                <div class="confusion-header">
                    <span>${c.pair}</span>
                    <span class="text-incorrect">${c.incorrect_triggers} incorrect inputs</span>
                </div>
                <p>Ensure you review differences. Document Intelligence parses forms, whereas Vision extracts coordinates or tags shapes.</p>
            `;
            elements.confusionContainer.appendChild(div);
        });
    } else {
        elements.confusionContainer.innerHTML = `<div class="no-confusion">No service confusion patterns detected. Outstanding work!</div>`;
    }

    // Confidence metrics render
    elements.confidenceAnomalies.innerHTML = "";
    const correctUncertain = report.confidence_analysis.correct_but_uncertain || [];
    const incorrectConfident = report.confidence_analysis.incorrect_but_confident || [];

    if (correctUncertain.length === 0 && incorrectConfident.length === 0) {
        elements.confidenceAnomalies.innerHTML = `<div class="no-confusion" style="color: var(--text-secondary)">No major confidence discrepancies found. Your confidence aligns with your accuracy.</div>`;
    } else {
        correctUncertain.forEach(item => {
            const div = document.createElement("div");
            div.className = "anomaly-item-row uncertain-correct";
            div.innerHTML = `
                <div class="anomaly-title" style="color: var(--warning-color)">Uncertain but Correct: ${item.topic}</div>
                <p>You answered correctly, but flagged it for review or spent over ${item.time_spent}s (baseline avg: ${item.avg_time}s). Master this topic to eliminate guessing.</p>
            `;
            elements.confidenceAnomalies.appendChild(div);
        });

        incorrectConfident.forEach(item => {
            const div = document.createElement("div");
            div.className = "anomaly-item-row confident-incorrect";
            div.innerHTML = `
                <div class="anomaly-title" style="color: var(--error-color)">Confident but Incorrect: ${item.topic}</div>
                <p>You answered quickly without review markers, but selected a distractor. Beware of commonly confused concepts in this area.</p>
            `;
            elements.confidenceAnomalies.appendChild(div);
        });
    }

    // Domain Matrix Table
    elements.readinessMatrixTbody.innerHTML = "";
    report.exam_readiness_matrix.forEach(m => {
        const tr = document.createElement("tr");
        const riskClass = m.risk_level === "High" ? "risk-high" : (m.risk_level === "Medium" ? "risk-medium" : "risk-low");
        
        tr.innerHTML = `
            <td>${m.domain}</td>
            <td>${m.topic}</td>
            <td><strong>${m.readiness}%</strong></td>
            <td>${m.confidence}%</td>
            <td><span class="risk-tag ${riskClass}">${m.risk_level} Risk</span></td>
        `;
        elements.readinessMatrixTbody.appendChild(tr);
    });

    // Strategy Roadmap Day Lists
    elements.roadmapDay1List.innerHTML = report.study_plan.day1.map(t => `<li>${t}</li>`).join("");
    elements.roadmapDay2List.innerHTML = report.study_plan.day2.map(t => `<li>${t}</li>`).join("");
    elements.roadmapDay3List.innerHTML = report.study_plan.day3.map(t => `<li>${t}</li>`).join("");

    // MS Learn Links
    elements.learnRecommendationsContainer.innerHTML = "";
    if (report.learn_recommendations && report.learn_recommendations.length > 0) {
        report.learn_recommendations.forEach(r => {
            const div = document.createElement("div");
            div.className = "learn-item";
            div.innerHTML = `
                <a href="${r.url}" target="_blank" class="learn-link" rel="noopener">
                    <span>${r.module} ↗</span>
                    <span class="risk-tag risk-low">${r.improvement} expected</span>
                </a>
                <p>${r.why_matters}</p>
            `;
            elements.learnRecommendationsContainer.appendChild(div);
        });
    } else {
        elements.learnRecommendationsContainer.innerHTML = `<p class="no-history">Complete. Maintain current study patterns.</p>`;
    }

    // Retest details
    elements.nextHoursVal.textContent = report.next_attempt.study_hours_required;
    elements.nextRetestVal.textContent = report.next_attempt.recommended_retest_date;
    elements.blueprintWeakLabel.textContent = `${report.next_attempt.blueprint.weak_domains}% Weak Topics`;
    elements.blueprintOtherLabel.textContent = `${report.next_attempt.blueprint.other_domains}% General Topics`;

    // Graded Question Walkthroughs
    renderQuestionReviews(report.questions);
}

function renderQuestionReviews(gradedQuestions) {
    elements.reviewQuestionsList.innerHTML = "";
    
    gradedQuestions.forEach((q, idx) => {
        const card = document.createElement("article");
        card.className = `review-question-card ${q.is_correct ? 'correct-card' : 'incorrect-card'}`;
        card.setAttribute("data-correct", q.is_correct ? "true" : "false");
        card.setAttribute("data-marked", state.marked.has(q.id) ? "true" : "false");
        
        // Confidence anomaly tags for filters
        const isConfidentIncorrect = !q.is_correct && q.confidence === "High";
        const isUncertainCorrect = q.is_correct && (q.confidence === "Low" || q.confidence === "Medium");
        card.setAttribute("data-confident-incorrect", isConfidentIncorrect ? "true" : "false");
        card.setAttribute("data-uncertain-correct", isUncertainCorrect ? "true" : "false");

        // Format answers for comparison
        let userAnsStr = formatAnswerString(q.user_answer);
        let correctAnsStr = formatAnswerString(q.correct_answer);

        const scenarioHTML = q.scenario ? `<div class="scenario-card"><span class="card-label">SCENARIO:</span>${sanitize(q.scenario)}</div>` : "";

        card.innerHTML = `
            <div class="review-card-meta">
                <div class="left-meta">
                    <span class="badge-status ${q.is_correct ? 'status-pass' : 'status-fail'}">${q.is_correct ? 'CORRECT' : 'INCORRECT'}</span>
                    <span>Question ${idx + 1} of 50</span>
                    <span>|</span>
                    <span>${sanitize(q.objective)}</span>
                    <span>|</span>
                    <span>${sanitize(q.difficulty)}</span>
                </div>
                <div class="right-meta">
                    <span>Confidence: ${sanitize(q.confidence)} (${q.time_spent}s spent)</span>
                </div>
            </div>
            
            ${scenarioHTML}
            <h4>${sanitize(q.question)}</h4>
            
            ${renderChoicesInReview(q)}

            <div class="explanation-block">
                <h5>Detailed Explanation</h5>
                <p><strong>Why Correct:</strong> ${sanitize(q.explanations.correct)}</p>
                <p><strong>Why Other Options are Incorrect:</strong> ${sanitize(q.explanations.incorrect)}</p>
                <p><strong>Exam Concept:</strong> <em>${sanitize(q.explanations.concept)}</em></p>
            </div>
        `;
        elements.reviewQuestionsList.appendChild(card);
    });

    setupReviewFilters();
}

function formatAnswerString(answer) {
    if (answer === null || answer === undefined) return "";
    if (Array.isArray(answer)) {
        return answer.map(a => a === null ? "[Not answered]" : a).join(", ");
    }
    return answer.toString();
}

// ─── § 16 · Question Review Cards ───────────────────────────────────────────
// Question Filter Setup in Reviews list
function setupReviewFilters() {
    const filters = document.querySelectorAll(".filter-btn");
    filters.forEach(btn => {
        btn.addEventListener("click", () => {
            filters.forEach(f => f.classList.remove("active"));
            btn.classList.add("active");
            
            const filterType = btn.getAttribute("data-filter");
            const cards = document.querySelectorAll(".review-question-card");
            
            let visibleCount = 0;
            cards.forEach(card => {
                let show = false;
                if (filterType === "all") {
                    show = true;
                } else if (filterType === "incorrect") {
                    show = card.getAttribute("data-correct") === "false";
                } else if (filterType === "marked") {
                    show = card.getAttribute("data-marked") === "true";
                } else if (filterType === "confident-incorrect") {
                    show = card.getAttribute("data-confident-incorrect") === "true";
                } else if (filterType === "uncertain-correct") {
                    show = card.getAttribute("data-uncertain-correct") === "true";
                }
                
                card.style.display = show ? "block" : "none";
                if (show) visibleCount++;
            });
            
            btn.textContent = `${btn.textContent.split(" (")[0]} (${visibleCount})`;
        });
    });
}

// ─── § 17 · Past Attempt Loader ─────────────────────────────────────────────
// Past Attempt Report Fetch
async function viewPastReport(sessId) {
    logStatus(`Fetching history for session ${sessId}...`);
    try {
        const response = await fetch("/api/exam/submit", {
            method: "POST",
            body: JSON.stringify({ session_id: sessId })
        });
        const report = await response.json();
        
        if (report.score !== undefined) {
            state.session_id = sessId;
            state.lastReport = report;
            state.marked = new Set();
            // Re-populate marked status from graded question reviews list
            report.questions.forEach(q => {
                if (q.confidence === "Low") state.marked.add(q.id);
            });

            renderFinalReport(report);
            switchView("report");
            logStatus(`Report loaded for historical session: ${sessId}`);
        }
    } catch (e) {
        logStatus("History fetch error: Server connection failed.");
        console.error(e);
    }
}

// ─── § 18 · View Switcher ───────────────────────────────────────────────────
// View switcher
function switchView(viewId) {
    Object.keys(views).forEach(key => {
        views[key].classList.toggle("active", key === viewId);
    });
    
    // Toggle system footer visibility
    elements.systemStateFooter.style.display = viewId === "exam" ? "block" : "none";
    
    if (viewId === "dashboard") {
        loadExamHistory();
    }
}

function returnToDashboard() {
    state = {
        session_id: null,
        questions: [],
        currentIdx: 0,
        answers: {},
        timeSpent: {},
        marked: new Set(),
        seen: new Set(),
        duration: 0,
        timerId: null,
        lastActiveTime: null
    };
    clearSessionFromLocalStorage();
    switchView("dashboard");
}

// ─── § 19 · LocalStorage Session Sync ───────────────────────────────────────
// Local Storage Session Synchronization
function saveSessionToLocalStorage() {
    if (!state.session_id) return;
    
    const serialized = {
        session_id: state.session_id,
        questions: state.questions,
        currentIdx: state.currentIdx,
        answers: state.answers,
        timeSpent: state.timeSpent,
        marked: Array.from(state.marked),
        seen: Array.from(state.seen),
        duration: state.duration
    };
    localStorage.setItem("ai901_exam_session", JSON.stringify(serialized));
}

function restoreExamSession() {
    const raw = localStorage.getItem("ai901_exam_session");
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        if (data.session_id) {
            state = {
                session_id: data.session_id,
                questions: data.questions,
                currentIdx: data.currentIdx,
                answers: data.answers,
                timeSpent: data.timeSpent,
                marked: new Set(data.marked),
                seen: new Set(data.seen),
                duration: data.duration,
                timerId: null,
                lastActiveTime: Date.now()
            };

            logStatus("Resuming active session found in memory.");
            buildSidebarGrid();
            switchView("exam");
            loadQuestion(state.currentIdx);
            startTimer();
        }
    } catch (e) {
        console.error("Failed to restore session from localStorage:", e);
        clearSessionFromLocalStorage();
    }
}

function clearSessionFromLocalStorage() {
    localStorage.removeItem("ai901_exam_session");
}

// ─── § 20 · System State Footer ─────────────────────────────────────────────
// System state footer metrics printer
function updateSystemStateFooter() {
    let answered = 0;
    state.questions.forEach(q => {
        if (state.answers[q.id] !== undefined) answered++;
    });
    
    const remaining = state.questions.length - answered;
    const markedList = Array.from(state.marked).map(id => {
        // map id to 1-based index for presentation
        const idx = state.questions.findIndex(q => q.id === id);
        return idx !== -1 ? idx + 1 : id;
    });
    
    let obj1Seen = 0;
    let obj2Seen = 0;
    state.seen.forEach(id => {
        const q = state.questions.find(item => item.id === id);
        if (q) {
            if (q.objective === "Objective 1") obj1Seen++;
            else obj2Seen++;
        }
    });

    elements.systemStateFooter.textContent = `SYSTEM STATE [Question: ${state.currentIdx + 1}/50 | Answered: ${answered} | Remaining: ${remaining} | Marked for Review: [${markedList.join(", ")}] | Objective 1 Questions Seen: ${obj1Seen} | Objective 2 Questions Seen: ${obj2Seen}]`;
}

// ─── § 21 · CLI Command Parser ──────────────────────────────────────────────
// Terminal CLI Input Command parser
function executeCommand(input) {
    const tokens = input.split(" ");
    const cmd = tokens[0].toLowerCase();
    
    logStatus(`Executing CLI command: ${cmd}`);

    switch (cmd) {
        case "/next":
            navigateQuestion(1);
            logStatus("Navigated to next question.");
            break;
            
        case "/prev":
            navigateQuestion(-1);
            logStatus("Navigated to previous question.");
            break;
            
        case "/mark":
            elements.markReviewChk.checked = true;
            handleMarkForReviewChange();
            logStatus("Question marked for review.");
            break;
            
        case "/unmark":
            elements.markReviewChk.checked = false;
            handleMarkForReviewChange();
            logStatus("Question unmarked.");
            break;
            
        case "/review":
            elements.toggleDrawerBtn.click();
            logStatus("Toggled review grid sidebar.");
            break;
            
        case "/status":
            let answered = 0;
            state.questions.forEach(q => {
                if (state.answers[q.id] !== undefined) answered++;
            });
            const remaining = state.questions.length - answered;
            logStatus(`Status: Question ${state.currentIdx + 1}/50 | Answered: ${answered} | Remaining: ${remaining} | Marked: [${Array.from(state.marked).map(id => state.questions.findIndex(q => q.id === id) + 1).join(", ")}]`);
            break;
            
        case "/submit":
            openSubmitModal();
            logStatus("Submit modal displayed.");
            break;
            
        default:
            logStatus(`Error: Command '${cmd}' is unrecognized. Options: /next, /prev, /mark, /unmark, /review, /status, /submit`);
            break;
    }
}

function logStatus(msg) {
    if (elements.terminalStatusLog) {
        elements.terminalStatusLog.textContent = msg;
    }
}

// ─── § 22 · Review Card Answer Renderer ─────────────────────────────────────
// Phase 2: Render option choice layouts in review cards
function renderChoicesInReview(q) {
    let html = `<div class="review-choices-container">`;

    if (q.type === "single-choice" || q.type === "multi-choice") {
        html += `<ul class="review-options-list">`;
        const opts = Array.isArray(q.options) ? q.options : [];
        opts.forEach(opt => {
            const isSelected = Array.isArray(q.user_answer) ? q.user_answer.includes(opt) : q.user_answer === opt;
            const isCorrect = Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt) : q.correct_answer === opt;
            
            let statusClass = "";
            let badge = "";
            if (isSelected && isCorrect) {
                statusClass = "option-correct-selected";
                badge = `<span class="review-badge badge-correct">✓ Correct Selection</span>`;
            } else if (isSelected && !isCorrect) {
                statusClass = "option-incorrect-selected";
                badge = `<span class="review-badge badge-incorrect">✗ Your Selection (Incorrect)</span>`;
            } else if (!isSelected && isCorrect) {
                statusClass = "option-correct-missed";
                badge = `<span class="review-badge badge-correct-missed">✓ Correct (Not Selected)</span>`;
            } else {
                statusClass = "option-normal";
            }
            
            html += `
                <li class="review-option-item ${statusClass}">
                    <span class="option-text">${sanitize(opt)}</span>
                    ${badge}
                </li>
            `;
        });
        html += `</ul>`;
    } else if (q.type === "true-false-matrix") {
        const statements = Array.isArray(q.options) ? q.options : [];
        html += `
            <table class="review-matrix-table">
                <thead>
                    <tr>
                        <th>Statement</th>
                        <th>Your Answer</th>
                        <th>Correct Answer</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        statements.forEach((stmt, sIdx) => {
            const labelText = typeof stmt === 'object' ? stmt.text : stmt;
            const userAns = Array.isArray(q.user_answer) ? q.user_answer[sIdx] : null;
            const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[sIdx] : null;
            const isRowCorrect = userAns === corrAns;
            
            html += `
                <tr class="${isRowCorrect ? 'row-correct' : 'row-incorrect'}">
                    <td>${labelText}</td>
                    <td><span class="user-badge ${userAns === corrAns ? 'match' : 'mismatch'}">${userAns || 'None'}</span></td>
                    <td><strong>${corrAns}</strong></td>
                    <td>${isRowCorrect ? '✅' : '❌'}</td>
                </tr>
            `;
        });
        html += `
                </tbody>
            </table>
        `;
    } else if (q.type === "dropdown-hotspot") {
        html += `<div class="review-hotspot-block">`;
        const parts = Array.isArray(q.options) ? q.options : [];
        parts.forEach((part, pIdx) => {
            const userAns = Array.isArray(q.user_answer) ? q.user_answer[pIdx] : null;
            const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[pIdx] : null;
            const isPartCorrect = userAns === corrAns;
            
            html += `
                <div class="review-hotspot-row ${isPartCorrect ? 'row-correct' : 'row-incorrect'}">
                    <span class="part-prompt"><strong>Part ${pIdx + 1}:</strong> ${part.text} ...</span>
                    <span class="part-result">
                        Selected: <span class="review-badge ${isPartCorrect ? 'badge-correct' : 'badge-incorrect'}">${userAns || '[None]'}</span>
                        ${!isPartCorrect ? ` | Correct: <span class="review-badge badge-correct">${corrAns}</span>` : ''}
                    </span>
                </div>
            `;
        });
        html += `</div>`;
    } else if (q.type === "drag-drop") {
        html += `<div class="review-drag-drop-block">`;
        const targets = q.options.targets || [];
        targets.forEach((target, tIdx) => {
            const userAns = Array.isArray(q.user_answer) ? q.user_answer[tIdx] : null;
            const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[tIdx] : null;
            const isTargetCorrect = userAns === corrAns;
            
            html += `
                <div class="review-target-row ${isTargetCorrect ? 'row-correct' : 'row-incorrect'}">
                    <span class="target-label"><strong>Requirement:</strong> ${target.label}</span>
                    <span class="target-result">
                        Dropped: <span class="review-badge ${isTargetCorrect ? 'badge-correct' : 'badge-incorrect'}">${userAns || '[None]'}</span>
                        ${!isTargetCorrect ? ` | Correct: <span class="review-badge badge-correct">${corrAns}</span>` : ''}
                    </span>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

// ─── § 23 · Export / Study Guide ────────────────────────────────────────────
// Phase 2: Markdown Study Guide Exporter
function exportFocusStudyGuide() {
    if (!state.lastReport || !state.lastReport.questions) {
        logStatus("No focus report data available to export.");
        return;
    }

    const report = state.lastReport;
    
    // Export incorrect answers and marked (uncertain) correct answers
    const targetQs = report.questions.filter(q => {
        const isIncorrect = !q.is_correct;
        const isUncertainCorrect = q.is_correct && (q.confidence === "Low" || q.confidence === "Medium");
        return isIncorrect || isUncertainCorrect;
    });

    if (targetQs.length === 0) {
        alert("Perfect score with high confidence! No incorrect or uncertain questions to export.");
        return;
    }

    let md = `# Microsoft Azure AI-901 Certification Focus Study Guide\n`;
    md += `* **Session ID:** ${state.session_id || 'N/A'}\n`;
    md += `* **Exam Score:** ${report.score} / 1000 (${report.status})\n`;
    md += `* **Readiness Level:** ${report.score >= 800 ? 'High Readiness' : (report.score >= 700 ? 'Ready' : 'Requires Review')}\n`;
    md += `* **Exported Questions:** ${targetQs.length} (Wrong or Uncertain Correct)\n\n`;
    md += `*Use this focus guide to study topic gaps and prepare for your actual certification exam.*\n\n`;
    md += `## Table of Contents\n`;
    targetQs.forEach((q, idx) => {
        const statusLabel = q.is_correct ? "Uncertain Correct" : "Incorrect";
        md += `${idx + 1}. [Question ${q.id} (${statusLabel}) - Topic: ${q.topic}](#question-${q.id.toLowerCase()})\n`;
    });
    md += `\n---\n\n`;

    targetQs.forEach((q, idx) => {
        const statusLabel = q.is_correct ? "UNCERTAIN CORRECT" : "INCORRECT";
        md += `<a id="question-${q.id.toLowerCase()}"></a>\n`;
        md += `## QUESTION ${idx + 1} | ID: ${q.id} [${statusLabel}]\n\n`;
        md += `* **Objective Domain:** ${q.objective}\n`;
        md += `* **Sub-Topic Area:** ${q.topic}\n`;
        md += `* **Difficulty:** ${q.difficulty}\n`;
        md += `* **Confidence Status:** ${q.confidence} | **Time spent on active query:** ${q.time_spent}s (baseline avg: ${q.avg_time}s)\n\n`;

        if (q.scenario) {
            md += `### Scenario context\n> ${q.scenario}\n\n`;
        }

        md += `### Question Prompt\n**${q.question}**\n\n`;

        md += `### Choice Layout & Evaluation\n`;
        if (q.type === "single-choice" || q.type === "multi-choice") {
            const opts = Array.isArray(q.options) ? q.options : [];
            opts.forEach(opt => {
                const isSelected = Array.isArray(q.user_answer) ? q.user_answer.includes(opt) : q.user_answer === opt;
                const isCorrect = Array.isArray(q.correct_answer) ? q.correct_answer.includes(opt) : q.correct_answer === opt;
                
                let checkStr = "[ ]";
                if (isSelected && isCorrect) checkStr = "[x] (Selected - Correct ✅)";
                else if (isSelected && !isCorrect) checkStr = "[x] (Selected - Incorrect ❌)";
                else if (!isSelected && isCorrect) checkStr = "[ ] (Not Selected - Correct)";
                
                md += `* ${checkStr} ${opt}\n`;
            });
        } else if (q.type === "true-false-matrix") {
            const statements = Array.isArray(q.options) ? q.options : [];
            md += `| Statement | Your Answer Selection | Correct Target Answer | Row Evaluation |\n`;
            md += `| :--- | :---: | :---: | :---: |\n`;
            statements.forEach((stmt, sIdx) => {
                const text = typeof stmt === "object" ? stmt.text : stmt;
                const userAns = Array.isArray(q.user_answer) ? q.user_answer[sIdx] : "None";
                const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[sIdx] : "None";
                const rowStatus = userAns === corrAns ? "✅ Match" : "❌ Mismatch";
                md += `| ${text} | ${userAns || 'None'} | ${corrAns} | ${rowStatus} |\n`;
            });
        } else if (q.type === "dropdown-hotspot") {
            const parts = Array.isArray(q.options) ? q.options : [];
            parts.forEach((part, pIdx) => {
                const userAns = Array.isArray(q.user_answer) ? q.user_answer[pIdx] : "None";
                const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[pIdx] : "None";
                const statusStr = userAns === corrAns ? "✅ Match" : "❌ Mismatch";
                md += `* **Part ${pIdx + 1}:** ${part.text.trim()} ... **Selected:** ${userAns || 'None'} | **Correct:** ${corrAns} (${statusStr})\n`;
            });
        } else if (q.type === "drag-drop") {
            const targets = q.options.targets || [];
            targets.forEach((target, tIdx) => {
                const userAns = Array.isArray(q.user_answer) ? q.user_answer[tIdx] : "None";
                const corrAns = Array.isArray(q.correct_answer) ? q.correct_answer[tIdx] : "None";
                const statusStr = userAns === corrAns ? "✅ Match" : "❌ Mismatch";
                md += `* **Target Requirements:** ${target.label} -> **User drop:** ${userAns || 'None'} | **Correct Target:** ${corrAns} (${statusStr})\n`;
            });
        }
        md += `\n`;

        md += `### Detailed Architectural Explanations\n`;
        md += `* **Why Correct Selection is Valid:** ${q.explanations.correct}\n`;
        md += `* **Why Distractors are Incorrect:** ${q.explanations.incorrect}\n`;
        md += `* **Azure Curriculum Blueprint Focus:** *${q.explanations.concept}*\n\n`;
        md += `---\n\n`;
    });

    try {
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `AI-901_Focus_Study_Guide.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        logStatus("Focus study guide downloaded successfully.");
    } catch (e) {
        console.error("Export failure:", e);
        logStatus("Export failed: File creation error.");
    }
}
