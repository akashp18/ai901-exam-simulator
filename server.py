import http.server
import socketserver
import json
import sqlite3
import uuid
import urllib.parse
import os
import mimetypes
import random
from datetime import datetime

PORT = 8000
DB_FILE = "ai901_simulator.db"

class ExamAPIHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Silence standard output logs to keep console clean
        return

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # API Routes
        if path == "/api/history":
            self.handle_get_history()
            return

        # Static Files Routing
        if path == "/":
            path = "/index.html"

        # Resolve local file path — enforce path traversal protection
        # All served files must reside within the project directory
        base_dir = os.path.realpath(".")
        local_path = os.path.realpath("." + path)
        if not local_path.startswith(base_dir + os.sep) and local_path != base_dir:
            self.send_error(403, "Forbidden")
            return
        if os.path.exists(local_path) and os.path.isfile(local_path):
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(local_path)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.end_headers()
            with open(local_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, "File Not Found")

    def do_OPTIONS(self):
        """Handle CORS preflight requests sent by browsers before cross-origin POST calls."""
        self.send_response(204)  # No Content
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Read JSON POST body (cap at 1MB to prevent memory exhaustion attacks)
        MAX_BODY_SIZE = 1 * 1024 * 1024  # 1 MB
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_BODY_SIZE:
            self.send_json_response({"error": "Request body too large"}, status=413)
            return
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        
        req_body = {}
        if post_data:
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception as e:
                self.send_json_response({"error": "Invalid JSON"}, status=400)
                return

        if path == "/api/exam/start":
            self.handle_exam_start(req_body)
        elif path == "/api/exam/answer":
            self.handle_exam_answer(req_body)
        elif path == "/api/exam/submit":
            self.handle_exam_submit(req_body)
        else:
            self.send_error(404, "API Endpoint Not Found")

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        # CORS headers — allow requests from any origin (localhost dev servers, Vite, etc.)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def handle_get_history(self):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT session_id, timestamp, score, status, correct_count, incorrect_count FROM history ORDER BY id DESC")
            rows = cursor.fetchall()
            conn.close()

            history = []
            for r in rows:
                history.append({
                    "session_id": r[0],
                    "timestamp": r[1],
                    "score": r[2],
                    "status": r[3],
                    "correct_count": r[4],
                    "incorrect_count": r[5]
                })

            self.send_json_response({"history": history})
        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)

    def handle_exam_start(self, body):
        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Target dynamic distribution setup:
            # Objective 1: 21 questions total
            #   - Easy: 4, Medium: 11, Hard: 6
            # Objective 2: 29 questions total
            #   - Easy: 6, Medium: 14, Hard: 9
            # Total Easy: 10, Medium: 25, Hard: 15 = 50 Questions

            buckets = [
                {"obj": "Objective 1", "diff": "easy", "limit": 4},
                {"obj": "Objective 1", "diff": "medium", "limit": 11},
                {"obj": "Objective 1", "diff": "hard", "limit": 6},
                {"obj": "Objective 2", "diff": "easy", "limit": 6},
                {"obj": "Objective 2", "diff": "medium", "limit": 14},
                {"obj": "Objective 2", "diff": "hard", "limit": 9}
            ]

            selected_ids = []

            # Adaptive Spaced Selection SQL logic
            # Prioritizes:
            #   - Rank 0: Questions NEVER seen (not present in submitted sessions)
            #   - Rank 1: Questions seen but ANSWERED INCORRECTLY in the latest attempt
            #   - Rank 2: Questions seen and ANSWERED CORRECTLY in the latest attempt
            # Randomizes within each rank
            for b in buckets:
                query = """
                WITH last_responses AS (
                    SELECT 
                        r.question_id,
                        r.is_correct,
                        s.end_time,
                        ROW_NUMBER() OVER(PARTITION BY r.question_id ORDER BY s.end_time DESC) as rn
                    FROM responses r
                    JOIN exam_sessions s ON r.session_id = s.session_id
                    WHERE s.status = 'submitted'
                ),
                question_status AS (
                    SELECT 
                        q.id,
                        CASE 
                            WHEN lr.question_id IS NULL THEN 0 -- Unseen
                            WHEN lr.is_correct = 1 THEN 2 -- Correct
                            ELSE 1 -- Incorrect
                        END as history_rank
                    FROM questions q
                    LEFT JOIN last_responses lr ON q.id = lr.question_id AND lr.rn = 1
                    WHERE q.objective = ? AND q.difficulty = ?
                )
                SELECT id FROM question_status
                ORDER BY history_rank ASC, random()
                LIMIT ?
                """
                cursor.execute(query, (b["obj"], b["diff"], b["limit"]))
                rows = cursor.fetchall()
                selected_ids.extend([row[0] for row in rows])

            # Shuffle the combined list of 50 question IDs
            random.shuffle(selected_ids)

            # Register new exam session
            session_id = str(uuid.uuid4())
            start_time = datetime.now().isoformat()
            
            cursor.execute("""
            INSERT INTO exam_sessions (session_id, start_time, score, status, question_order)
            VALUES (?, ?, 0, 'active', ?)
            """, (session_id, start_time, json.dumps(selected_ids)))

            # Fetch the selected questions metadata (OMITTING answers and explanations)
            placeholders = ",".join(["?"] * len(selected_ids))
            cursor.execute(f"""
            SELECT id, objective, difficulty, topic, type, scenario, question, options, avg_time, confused_services
            FROM questions
            WHERE id IN ({placeholders})
            """, selected_ids)
            
            q_rows = cursor.fetchall()
            
            # Map database rows back to original order of IDs
            q_map = {}
            for row in q_rows:
                q_id = row[0]
                q_map[q_id] = {
                    "id": q_id,
                    "objective": row[1],
                    "difficulty": row[2],
                    "topic": row[3],
                    "type": row[4],
                    "scenario": row[5],
                    "question": row[6],
                    "options": json.loads(row[7]) if row[7] else [],
                    "avg_time": row[8],
                    "confused_services": json.loads(row[9]) if row[9] else []
                }
            
            ordered_questions = []
            for q_id in selected_ids:
                if q_id in q_map:
                    ordered_questions.append(q_map[q_id])

            conn.commit()
            conn.close()

            self.send_json_response({
                "session_id": session_id,
                "questions": ordered_questions
            })

        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)

    def handle_exam_answer(self, body):
        session_id = body.get("session_id")
        question_id = body.get("question_id")
        selected_answer = body.get("selected_answer") # structure matches question type
        time_spent = body.get("time_spent", 0)
        marked_for_review = body.get("marked_for_review", 0)

        if not session_id or not question_id:
            self.send_json_response({"error": "Missing parameters"}, status=400)
            return

        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Insert or replace user response
            cursor.execute("""
            INSERT OR REPLACE INTO responses (session_id, question_id, selected_answer, time_spent, marked_for_review)
            VALUES (?, ?, ?, ?, ?)
            """, (session_id, question_id, json.dumps(selected_answer), time_spent, marked_for_review))

            conn.commit()
            conn.close()

            self.send_json_response({"status": "saved", "message": "Answer recorded successfully."})
        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)

    def handle_exam_submit(self, body):
        session_id = body.get("session_id")
        if not session_id:
            self.send_json_response({"error": "Missing session_id"}, status=400)
            return

        try:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()

            # Check if session exists
            cursor.execute("SELECT question_order, status FROM exam_sessions WHERE session_id = ?", (session_id,))
            session_row = cursor.fetchone()
            if not session_row:
                self.send_json_response({"error": "Session not found"}, status=404)
                conn.close()
                return

            session_status = session_row[1]
            is_resubmit = (session_status == 'submitted')
            question_order = json.loads(session_row[0])
            
            # Fetch all questions in this session
            placeholders = ",".join(["?"] * len(question_order))
            cursor.execute(f"""
            SELECT id, objective, difficulty, topic, type, scenario, question, options, correct_answer, explanations, avg_time, confused_services
            FROM questions
            WHERE id IN ({placeholders})
            """, question_order)
            q_rows = cursor.fetchall()
            
            questions_db = {}
            for r in q_rows:
                questions_db[r[0]] = {
                    "id": r[0],
                    "objective": r[1],
                    "difficulty": r[2],
                    "topic": r[3],
                    "type": r[4],
                    "scenario": r[5],
                    "question": r[6],
                    "options": json.loads(r[7]) if r[7] else [],
                    "correct_answer": json.loads(r[8]),
                    "explanations": json.loads(r[9]) if r[9] else {},
                    "avg_time": r[10],
                    "confused_services": json.loads(r[11]) if r[11] else []
                }

            # Fetch user responses
            cursor.execute("SELECT question_id, selected_answer, time_spent, marked_for_review FROM responses WHERE session_id = ?", (session_id,))
            resp_rows = cursor.fetchall()
            responses = {}
            for r in resp_rows:
                responses[r[0]] = {
                    "selected_answer": json.loads(r[1]) if r[1] else None,
                    "time_spent": r[2],
                    "marked_for_review": r[3]
                }

            # Scoring calculation parameters
            total_earned_points = 0.0
            total_max_points = 0.0

            difficulty_weights = {
                "easy": 1.0,
                "medium": 1.5,
                "hard": 2.0
            }

            question_reviews = []
            correct_count = 0
            incorrect_count = 0

            # Confidence tracking classification tallies
            # High, Medium, Low Confidence groups
            confidence_analysis = {
                "correct_but_uncertain": [],
                "incorrect_but_confident": []
            }
            
            objective_stats = {
                "Objective 1": {"correct": 0, "total": 0, "points_earned": 0.0, "max_points": 0.0},
                "Objective 2": {"correct": 0, "total": 0, "points_earned": 0.0, "max_points": 0.0}
            }

            difficulty_stats = {
                "easy": {"correct": 0, "total": 0},
                "medium": {"correct": 0, "total": 0},
                "hard": {"correct": 0, "total": 0}
            }

            topic_stats = {}
            service_confusion_counts = {}

            for q_id in question_order:
                q = questions_db.get(q_id)
                if not q:
                    continue

                resp = responses.get(q_id, {"selected_answer": None, "time_spent": 0, "marked_for_review": 0})
                user_ans = resp["selected_answer"]
                time_spent = resp["time_spent"]
                marked = resp["marked_for_review"]

                # Weight based on difficulty
                weight = difficulty_weights.get(q["difficulty"], 1.0)
                total_max_points += weight
                objective_stats[q["objective"]]["max_points"] += weight
                
                # Check accuracy & partial credit logic
                is_correct = False
                fraction_correct = 0.0 # 0.0 to 1.0

                corr_ans = q["correct_answer"]

                if user_ans is not None:
                    if q["type"] == "single-choice":
                        if user_ans == corr_ans:
                            fraction_correct = 1.0
                            is_correct = True
                    elif q["type"] == "multi-choice":
                        # Both are arrays
                        if isinstance(user_ans, list) and isinstance(corr_ans, list) and len(corr_ans) > 0:
                            # Count matching selected answers
                            matches = sum(1 for item in user_ans if item in corr_ans)
                            # Subtract penalties for wrong selections to avoid cheating by selecting all
                            wrong_selections = sum(1 for item in user_ans if item not in corr_ans)
                            net_matches = max(0, matches - wrong_selections)
                            
                            fraction_correct = net_matches / len(corr_ans)
                            if fraction_correct == 1.0:
                                is_correct = True
                    elif q["type"] == "true-false-matrix":
                        # user_ans and corr_ans are list of strings matching matrix indices
                        if isinstance(user_ans, list) and isinstance(corr_ans, list) and len(corr_ans) > 0:
                            matches = sum(1 for idx, ans in enumerate(user_ans) if idx < len(corr_ans) and ans == corr_ans[idx])
                            fraction_correct = matches / len(corr_ans)
                            if fraction_correct == 1.0:
                                is_correct = True
                    elif q["type"] in ["dropdown-hotspot", "drag-drop"]:
                        # user_ans and corr_ans are list of matches
                        if isinstance(user_ans, list) and isinstance(corr_ans, list) and len(corr_ans) > 0:
                            matches = sum(1 for idx, ans in enumerate(user_ans) if idx < len(corr_ans) and ans == corr_ans[idx])
                            fraction_correct = matches / len(corr_ans)
                            if fraction_correct == 1.0:
                                is_correct = True

                points_earned = fraction_correct * weight
                total_earned_points += points_earned
                objective_stats[q["objective"]]["points_earned"] += points_earned

                # Stats aggregate
                topic = q["topic"]
                if topic not in topic_stats:
                    topic_stats[topic] = {"correct_points": 0.0, "max_points": 0.0, "total": 0, "correct_count": 0}
                topic_stats[topic]["correct_points"] += points_earned
                topic_stats[topic]["max_points"] += weight
                topic_stats[topic]["total"] += 1

                objective_stats[q["objective"]]["total"] += 1
                difficulty_stats[q["difficulty"]]["total"] += 1

                if is_correct:
                    correct_count += 1
                    objective_stats[q["objective"]]["correct"] += 1
                    difficulty_stats[q["difficulty"]]["correct"] += 1
                    topic_stats[topic]["correct_count"] += 1
                else:
                    incorrect_count += 1

                # Update correctness in responses table
                cursor.execute("""
                    UPDATE responses 
                    SET is_correct = ? 
                    WHERE session_id = ? AND question_id = ?
                """, (1 if is_correct else 0, session_id, q_id))

                # Confusion analysis logging
                if not is_correct and q["confused_services"]:
                    for pair_item in q["confused_services"]:
                        service_confusion_counts[pair_item] = service_confusion_counts.get(pair_item, 0) + 1

                # Confidence taxonomy classifier
                # High, Medium, Low Confidence
                # Flags: marked for review (implies Low), time spent vs baseline avgTime, answer changes
                confidence_level = "High"
                if marked == 1:
                    confidence_level = "Low"
                elif time_spent > (q["avg_time"] * 2.2):
                    confidence_level = "Low"
                elif time_spent > (q["avg_time"] * 1.4):
                    confidence_level = "Medium"
                
                # Confidence anomaly checks
                if is_correct and confidence_level in ["Low", "Medium"]:
                    confidence_analysis["correct_but_uncertain"].append({
                        "id": q["id"],
                        "topic": q["topic"],
                        "confidence": confidence_level,
                        "time_spent": time_spent,
                        "avg_time": q["avg_time"]
                    })
                elif not is_correct and confidence_level == "High":
                    confidence_analysis["incorrect_but_confident"].append({
                        "id": q["id"],
                        "topic": q["topic"],
                        "confidence": confidence_level,
                        "time_spent": time_spent,
                        "avg_time": q["avg_time"]
                    })

                question_reviews.append({
                    "id": q["id"],
                    "objective": q["objective"],
                    "difficulty": q["difficulty"],
                    "topic": q["topic"],
                    "type": q["type"],
                    "scenario": q["scenario"],
                    "question": q["question"],
                    "options": q["options"],
                    "user_answer": user_ans,
                    "correct_answer": corr_ans,
                    "is_correct": is_correct,
                    "fraction_correct": fraction_correct,
                    "confidence": confidence_level,
                    "time_spent": time_spent,
                    "explanations": q["explanations"]
                })

            # Score mapping to scale 100-1000
            score = 100
            if total_max_points > 0:
                score = round(100 + (total_earned_points / total_max_points) * 900)
            
            # Clamp boundaries
            score = max(100, min(1000, score))
            pass_status = "PASS" if score >= 700 else "FAIL"

            # Exam Readiness & Passing Probability estimations
            readiness_percentage = round((score / 1000) * 100)
            
            passing_probability = 5
            if score >= 900:
                passing_probability = 98
            elif score >= 800:
                passing_probability = 90
            elif score >= 700:
                passing_probability = 75
            elif score >= 600:
                passing_probability = 40
            elif score >= 500:
                passing_probability = 15

            # Objective breakdown summaries
            obj_breakdown = {}
            for obj_key, stats in objective_stats.items():
                accuracy = 0
                if stats["max_points"] > 0:
                    accuracy = round((stats["points_earned"] / stats["max_points"]) * 100)
                obj_breakdown[obj_key] = {
                    "accuracy": accuracy,
                    "correct": stats["correct"],
                    "total": stats["total"]
                }

            # Difficulty breakdown summaries
            diff_breakdown = {}
            for diff_key, stats in difficulty_stats.items():
                accuracy = 0
                if stats["total"] > 0:
                    accuracy = round((stats["correct"] / stats["total"]) * 100)
                diff_breakdown[diff_key] = {
                    "accuracy": accuracy,
                    "correct": stats["correct"],
                    "total": stats["total"]
                }

            # Advanced Performance analysis: Weak concepts, severe gaps, confusion lists
            weak_concepts = []
            exam_readiness_matrix = []
            study_priorities = []

            for topic_name, stats in topic_stats.items():
                accuracy = 0
                if stats["max_points"] > 0:
                    accuracy = round((stats["correct_points"] / stats["max_points"]) * 100)
                
                # Determine risk levels
                risk = "Low"
                if accuracy < 60:
                    risk = "High"
                    severity = "Critical"
                    est_time = "10-20 hours"
                    priority = 1
                elif accuracy < 75:
                    risk = "Medium"
                    severity = "Moderate"
                    est_time = "5-10 hours"
                    priority = 2
                else:
                    severity = "Minor"
                    est_time = "2-4 hours"
                    priority = 3

                # Map categories — use the question's own objective field (already tracked)
                domain = q["objective"] if q else "Objective 2"

                # Calculate domain confidence proxy
                high_conf_count = sum(1 for qr in question_reviews if qr["topic"] == topic_name and qr["confidence"] == "High")
                confidence_pct = round((high_conf_count / stats["total"]) * 100) if stats["total"] > 0 else 100

                exam_readiness_matrix.append({
                    "domain": domain,
                    "topic": topic_name,
                    "readiness": accuracy,
                    "confidence": confidence_pct,
                    "risk_level": risk
                })

                if accuracy < 75:
                    weak_concepts.append({
                        "topic": topic_name,
                        "accuracy": accuracy,
                        "severity": severity,
                        "est_study_time": est_time,
                        "priority": priority
                    })
            
            # Sort weak concepts by priority
            weak_concepts.sort(key=lambda x: x["priority"])

            # Map confusion categories back to standard names
            confusion_mapping = {
                "classification": "Classification vs Regression",
                "regression": "Classification vs Regression",
                "clustering": "Anomaly Detection vs Clustering",
                "anomaly-detection": "Anomaly Detection vs Clustering",
                "ocr": "Azure AI Vision OCR vs Document Intelligence",
                "doc-intel": "Azure AI Vision OCR vs Document Intelligence",
                "ner": "PII Detection vs NER vs CLU",
                "pii": "PII Detection vs NER vs CLU",
                "clu": "PII Detection vs NER vs CLU",
                "speech": "Azure AI Language vs Speech Services",
                "language": "Azure AI Language vs Speech Services",
                "rag": "RAG vs Fine-Tuning Models",
                "fine-tuning": "RAG vs Fine-Tuning Models",
                "chatbot": "Stateless Chatbots vs Agents",
                "agent": "Stateless Chatbots vs Agents"
            }

            active_confusions = []
            seen_confusion_pairs = set()
            for key, count in service_confusion_counts.items():
                pair_name = confusion_mapping.get(key)
                if pair_name and pair_name not in seen_confusion_pairs:
                    seen_confusion_pairs.add(pair_name)
                    active_confusions.append({
                        "pair": pair_name,
                        "incorrect_triggers": count,
                        "description": f"You showed confusion in questions relating to {pair_name}."
                    })

            # Personalized Study Plan Generator
            # 3-Day structured roadmap
            study_plan = {
                "day1": [],
                "day2": [],
                "day3": []
            }
            
            flat_weak_topics = [w["topic"] for w in weak_concepts]
            if len(flat_weak_topics) == 0:
                study_plan["day1"] = ["Review advanced prompt engineering concepts", "Examine multi-modal model capabilities"]
                study_plan["day2"] = ["Audit Azure OpenAI content filtering parameters", "Read layout analysis schemas in Document Intelligence"]
                study_plan["day3"] = ["Practice vector and hybrid search configurations in Azure AI Search", "Take a final certification simulation mock exam"]
            else:
                # Divide weak topics among the three days
                for i, topic_name in enumerate(flat_weak_topics):
                    day_key = f"day{(i % 3) + 1}"
                    study_plan[day_key].append(f"Master concepts in: {topic_name}")
                
                # Add exam take to day 3
                study_plan["day3"].append("Schedule and retake the AI-901 Practice Simulator Exam")

            # Microsoft Learn Recommendations mapping
            learn_recommendations = []
            learn_directory = {
                "Responsible AI": {
                    "module": "Embrace Responsible AI Principles",
                    "url": "https://learn.microsoft.com/training/paths/embrace-responsible-ai-principles/",
                    "improvement": "+10% in Objective 1"
                },
                "Generative AI": {
                    "module": "Fundamentals of Generative AI",
                    "url": "https://learn.microsoft.com/training/paths/fundamentals-generative-ai/",
                    "improvement": "+12% in Objective 1"
                },
                "Azure OpenAI": {
                    "module": "Get started with Azure OpenAI Service",
                    "url": "https://learn.microsoft.com/training/paths/get-started-azure-openai-service/",
                    "improvement": "+15% in Objective 2"
                },
                "Vision": {
                    "module": "Explore computer vision in Azure",
                    "url": "https://learn.microsoft.com/training/paths/explore-computer-vision-microsoft-azure/",
                    "improvement": "+10% in Objective 2"
                },
                "Language": {
                    "module": "Explore natural language processing in Azure",
                    "url": "https://learn.microsoft.com/training/paths/explore-natural-language-processing/",
                    "improvement": "+10% in Objective 2"
                },
                "Document Intelligence": {
                    "module": "Explore document intelligence in Azure",
                    "url": "https://learn.microsoft.com/training/paths/explore-document-intelligence-azure/",
                    "improvement": "+8% in Objective 2"
                },
                "RAG": {
                    "module": "Implement Retrieval-Augmented Generation (RAG) models",
                    "url": "https://learn.microsoft.com/training/paths/implement-rag-models/",
                    "improvement": "+15% in Objective 2"
                },
                "Question Answering": {
                    "module": "Build a question answering solution with Azure AI Language",
                    "url": "https://learn.microsoft.com/training/modules/build-qna-solution-qna-maker/",
                    "improvement": "+8% in Objective 2"
                },
                "QnA": {
                    "module": "Build a question answering solution with Azure AI Language",
                    "url": "https://learn.microsoft.com/training/modules/build-qna-solution-qna-maker/",
                    "improvement": "+8% in Objective 2"
                }
            }

            for key, rec in learn_directory.items():
                # If they have weak concepts containing this key, recommend it
                has_weakness = any(key.lower() in w["topic"].lower() for w in weak_concepts)
                if has_weakness or len(weak_concepts) == 0:
                    learn_recommendations.append({
                        "module": rec["module"],
                        "url": rec["url"],
                        "why_matters": f"Directly maps to concepts causing lower scores. Mastering this topic yields an estimated {rec['improvement']}.",
                        "improvement": rec["improvement"]
                    })

            # Limit to top 3 recommendations
            learn_recommendations = learn_recommendations[:3]

            # Retest date & next exam blueprint
            retest_days = 3 if score >= 800 else (7 if score >= 700 else 14)
            retest_date = f"In {retest_days} days."
            
            blueprint_weak_pct = 60
            blueprint_other_pct = 40

            # Update session status
            end_time = datetime.now().isoformat()
            cursor.execute("""
            UPDATE exam_sessions
            SET score = ?, end_time = ?, status = 'submitted'
            WHERE session_id = ?
            """, (score, end_time, session_id))

            # Only insert history record on first submission (guard against duplicate rows)
            if not is_resubmit:
                cursor.execute("""
                INSERT INTO history (session_id, timestamp, score, status, correct_count, incorrect_count, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    end_time,
                    score,
                    pass_status,
                    correct_count,
                    incorrect_count,
                    json.dumps({
                        "readiness": readiness_percentage,
                        "prob": passing_probability
                    })
                ))

            conn.commit()
            conn.close()

            # Return the compiled report
            self.send_json_response({
                "score": score,
                "status": pass_status,
                "readiness_percentage": readiness_percentage,
                "passing_probability": passing_probability,
                "objective_breakdown": obj_breakdown,
                "difficulty_breakdown": diff_breakdown,
                "confidence_analysis": confidence_analysis,
                "weak_concepts": weak_concepts,
                "service_confusion": active_confusions,
                "exam_readiness_matrix": exam_readiness_matrix,
                "study_plan": study_plan,
                "learn_recommendations": learn_recommendations,
                "next_attempt": {
                    "recommended_retest_date": retest_date,
                    "study_hours_required": "5-10 hours" if score >= 800 else ("10-20 hours" if score >= 700 else "20+ hours"),
                    "blueprint": {
                        "weak_domains": blueprint_weak_pct,
                        "other_domains": blueprint_other_pct
                    }
                },
                "questions": question_reviews
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json_response({"error": str(e)}, status=500)

if __name__ == "__main__":
    # Ensure database is initialized before starting server
    import database
    if not os.path.exists(DB_FILE):
        print("Database file not found. Initializing database...")
        database.init_db()
    else:
        print("Database exists. Ensuring schema is present...")
        database.init_db(force_reseed=False)

    # Start Server
    handler = ExamAPIHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Microsoft AI-901 Certification Simulation Server running on http://localhost:{PORT}")
        httpd.serve_forever()
