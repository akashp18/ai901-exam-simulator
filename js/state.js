
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