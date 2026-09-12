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
    const updateDOM = () => {
        Object.keys(views).forEach(key => {
            views[key].classList.toggle("active", key === viewId);
        });
        
        // Toggle system footer visibility
        elements.systemStateFooter.style.display = viewId === "exam" ? "block" : "none";
        
        if (viewId === "dashboard") {
            loadExamHistory();
        }
    };

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            updateDOM();
        });
    } else {
        updateDOM();
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

// Helper for drag and drop
function addItemBackToBank(dragItemsBox, itemText, draggables) {
    const newItem = document.createElement('div');
    newItem.className = 'drag-item';
    newItem.draggable = true;
    newItem.textContent = itemText;
    newItem.dataset.itemText = itemText;
    newItem.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-drag-item', itemText);
        e.dataTransfer.setData('text/plain', itemText);
        e.dataTransfer.setData('application/x-source-zone', '');
    });
    dragItemsBox.appendChild(newItem);
}
