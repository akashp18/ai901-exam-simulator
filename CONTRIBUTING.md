# Contributing to AI-901 Exam Simulator

First off — thank you! Every question contribution, bug fix, and improvement directly helps people pass the AI-901 exam. 🎯

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Add a Question](#how-to-add-a-question)
3. [Question Type Schemas](#question-type-schemas)
4. [Validation](#validation)
5. [Reporting Incorrect Questions](#reporting-incorrect-questions)
6. [Code Contributions](#code-contributions)

---

## Code of Conduct

Be respectful and constructive. Incorrect question reports and content disagreements should cite an official Microsoft Learn source.

---

## How to Add a Question

1. **Open `database.py`**
2. Find the `QUESTIONS` list
3. Add your question dictionary following the appropriate schema below
4. Give it a unique `id` — continue the sequence (e.g., `Q211` if the last is `Q210`)
5. Run the validator:
   ```bash
   python3 verify_db.py
   ```
6. Restart the server to reseed the database:
   ```bash
   python3 server.py
   ```
7. Submit a pull request with a brief description of what topic your question covers

---

## Question Type Schemas

### 1. Single Choice (most common)

```python
{
    "id": "Q211",
    "objective": "Objective 2",          # "Objective 1" | "Objective 2"
    "difficulty": "medium",              # "easy" | "medium" | "hard"
    "topic": "Azure AI Vision",          # matches an existing topic string
    "type": "single-choice",
    "scenario": "A retail company wants to detect whether customers in security footage are wearing a face mask.",
    "question": "Which Azure AI Vision feature should the developer use?",
    "options": [
        "Optical Character Recognition",
        "Face Detection with attribute analysis",
        "Image Classification with Custom Vision",
        "Object Detection"
    ],
    "correct_answer": "Face Detection with attribute analysis",
    "explanations": {
        "correct": "Azure AI Face service provides attribute detection including face coverings (masks), making it the right choice for this compliance scenario.",
        "incorrect": {
            "Optical Character Recognition": "OCR extracts text from images — not relevant to person detection.",
            "Image Classification with Custom Vision": "Image Classification labels the whole image; it cannot detect individual people or attributes.",
            "Object Detection": "Object Detection locates bounding boxes around objects but does not analyse person-level attributes like mask status."
        },
        "concept": "Azure AI Face provides attribute analysis including accessories, head pose, and face coverings."
    },
    "avg_time": 55,
    "confused_services": ["vision", "face"]
}
```

### 2. Multi-Select (choose 2 or more)

```python
{
    "id": "Q212",
    "objective": "Objective 1",
    "difficulty": "medium",
    "topic": "Responsible AI",
    "type": "multi-choice",
    "scenario": "A bank is deploying a loan approval model.",
    "question": "Which TWO Responsible AI principles does requiring model explainability and an appeals process address? (Select TWO)",
    "options": [
        "Transparency",
        "Accountability",
        "Reliability",
        "Inclusiveness"
    ],
    "correct_answer": ["Transparency", "Accountability"],   # NOTE: array, not string
    "explanations": {
        "correct": "Explainability maps to Transparency (understanding model decisions). An appeals process maps to Accountability (human oversight).",
        "incorrect": {
            "Reliability": "Reliability is about consistent, safe model performance — not explanation or appeal mechanisms.",
            "Inclusiveness": "Inclusiveness is about designing AI to benefit all people — not about explaining decisions."
        },
        "concept": "Transparency and Accountability are complementary RAI principles for systems affecting high-stakes decisions."
    },
    "avg_time": 70,
    "confused_services": []
}
```

### 3. True / False Matrix

```python
{
    "id": "Q213",
    "objective": "Objective 2",
    "difficulty": "hard",
    "topic": "Azure Machine Learning",
    "type": "true-false-matrix",
    "scenario": "An ML engineer is evaluating training approaches in Azure Machine Learning.",
    "question": "Select True or False for each statement.",
    "options": [
        {"text": "AutoML can automatically select the best algorithm for a regression task"},
        {"text": "The Azure ML Designer requires you to write Python code to build pipelines"},
        {"text": "Managed online endpoints support real-time inference"}
    ],
    "correct_answer": ["True", "False", "True"],   # NOTE: array matching options order
    "explanations": {
        "correct": "AutoML automates algorithm selection. Designer is a no-code drag-and-drop tool. Managed online endpoints provide real-time scoring.",
        "incorrect": {},
        "concept": "Azure ML offers multiple authoring surfaces: AutoML, Designer (no-code), and SDK/CLI for code-first workflows."
    },
    "avg_time": 90,
    "confused_services": []
}
```

### 4. Dropdown Hotspot (fill-in-the-blank)

```python
{
    "id": "Q214",
    "objective": "Objective 2",
    "difficulty": "medium",
    "topic": "Azure AI Language",
    "type": "dropdown-hotspot",
    "scenario": "A developer is building a customer support bot.",
    "question": "Select the correct Azure AI Language feature for each use case.",
    "options": [
        {
            "text": "Detecting the customer's emotional tone in a chat message uses",
            "choices": ["Sentiment Analysis", "Named Entity Recognition", "Language Detection", "Key Phrase Extraction"],
            "correct": "Sentiment Analysis"
        },
        {
            "text": "Extracting the customer's order number from free text uses",
            "choices": ["Key Phrase Extraction", "Named Entity Recognition", "Sentiment Analysis", "Custom Classification"],
            "correct": "Named Entity Recognition"
        }
    ],
    "correct_answer": ["Sentiment Analysis", "Named Entity Recognition"],  # array matching options order
    "explanations": {
        "correct": "Sentiment Analysis classifies emotional polarity. NER extracts structured entities like order IDs from unstructured text.",
        "incorrect": {},
        "concept": "Azure AI Language provides multiple pre-built NLP features accessible through a single unified API."
    },
    "avg_time": 80,
    "confused_services": ["ner", "pii", "clu"]
}
```

### 5. Drag & Drop (match items to slots)

```python
{
    "id": "Q215",
    "objective": "Objective 2",
    "difficulty": "hard",
    "topic": "Azure Machine Learning",
    "type": "drag-drop",
    "scenario": "Match each Azure ML concept to its correct description.",
    "question": "Drag each item to its matching description.",
    "options": {
        "items": [
            "Pipeline",
            "Datastore",
            "Compute Cluster",
            "Environment"
        ],
        "targets": [
            {
                "label": "Defines reusable ML workflow steps as a graph",
                "correct": "Pipeline"
            },
            {
                "label": "Abstracts connection to storage services like Azure Blob",
                "correct": "Datastore"
            },
            {
                "label": "Manages Docker images and dependencies for training runs",
                "correct": "Environment"
            }
        ]
    },
    "correct_answer": ["Pipeline", "Datastore", "Environment"],  # array matching targets order
    "explanations": {
        "correct": "Pipelines orchestrate multi-step workflows. Datastores abstract storage. Environments manage dependencies for reproducibility.",
        "incorrect": {},
        "concept": "Azure ML core concepts — understanding their roles is essential for Objective 2 scenario questions."
    },
    "avg_time": 120,
    "confused_services": []
}
```

---

## Validation

Before submitting, always run:

```bash
python3 verify_db.py
```

This checks:
- Total pool size
- Per-bucket distribution (enough questions for each difficulty/objective draw)
- Valid JSON in `options`, `correct_answer`, `explanations`, and `confused_services` fields

A clean run outputs `=== Validation Status: PASSED ===`.

---

## Reporting Incorrect Questions

If you find a question with a wrong answer or misleading explanation:

1. Open a [GitHub Issue](../../issues/new?template=bug_report.md)
2. Include:
   - The **Question ID** (visible in the review card after submitting the exam)
   - Why the answer is incorrect
   - A **Microsoft Learn URL** or official documentation link as your source

Please don't open PRs to fix content without a supporting reference. The question bank must stay anchored to official Microsoft documentation.

---

## Code Contributions

### Architecture

| File | Role |
|:---|:---|
| `server.py` | Pure Python stdlib HTTP server + all API routes |
| `database.py` | SQLite schema + 210 questions seeded on startup |
| `app.js` | All client-side state and DOM logic (~1,500 lines) |
| `styles.css` | All styling using CSS custom properties |
| `index.html` | Single-page app shell |
| `verify_db.py` | Database health-check script |

### Running Locally

```bash
python3 server.py
# Open http://localhost:8000
```

No build step, no virtual environment. All Python stdlib.

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- For question additions, include the source URL in the PR description
- For UI changes, include a before/after screenshot
- Make sure `python3 verify_db.py` passes

---

*Thank you for helping make AI-901 prep better for everyone!* 🚀
