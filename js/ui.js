
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
        elements.qScenarioText.innerHTML = marked.parse(q.scenario);
        elements.qScenarioCard.style.display = "block";
    } else {
        elements.qScenarioCard.style.display = "none";
    }

    // Set prompt text
    elements.qPromptText.innerHTML = marked.parse(q.question);

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

            // Heuristic check: does it look like code?
            let isCode = false;
            if (q.options && q.options.length > 0) {
                isCode = q.options.some(part =>
                    part.text.includes('\\n') ||
                    part.text.includes('import ') ||
                    part.text.includes('{') ||
                    part.text.match(/\\b(def|class|function|const|let|var|return|if|else)\\b/)
                );
            }
            if (isCode) {
                p.classList.add("hotspot-code-block");
            }

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

    // Apply syntax highlighting to any code blocks
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }
}

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

// Navigation flow controls
function navigateQuestion(direction) {
    saveCurrentAnswer();
    const targetIdx = state.currentIdx + direction;
    if (targetIdx >= 0 && targetIdx < state.questions.length) {
        loadQuestion(targetIdx);
    }
}