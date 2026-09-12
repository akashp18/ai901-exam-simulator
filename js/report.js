
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