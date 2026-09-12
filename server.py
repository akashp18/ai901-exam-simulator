import http.server
import socketserver
import json
import grader
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
        elif path == "/api/stats":
            self.handle_get_stats()
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
            conn.execute("PRAGMA foreign_keys = ON")
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

    def handle_get_stats(self):
        try:
            conn = sqlite3.connect(DB_FILE)
            conn.execute("PRAGMA foreign_keys = ON")
            cursor = conn.cursor()
            
            # Count total questions
            cursor.execute("SELECT COUNT(*) FROM questions")
            total = cursor.fetchone()[0]
            
            # Count per category
            stats = {
                "total": total,
                "draw": 50,
                "categories": {}
            }
            
            cursor.execute("SELECT objective, difficulty, COUNT(*) FROM questions GROUP BY objective, difficulty")
            rows = cursor.fetchall()
            for obj, diff, count in rows:
                key = f"{obj}_{diff}"
                stats["categories"][key] = count
                
            conn.close()
            self.send_json_response(stats)
        except Exception as e:
            self.send_json_response({"error": str(e)}, status=500)

    def handle_exam_start(self, body):
        try:
            conn = sqlite3.connect(DB_FILE)
            conn.execute("PRAGMA foreign_keys = ON")
            cursor = conn.cursor()

            with open("data/blueprint.json", "r") as f:
                buckets = json.load(f)

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
            query = "SELECT id, objective, difficulty, topic, type, scenario, question, options, avg_time, confused_services FROM questions WHERE id IN (" + placeholders + ")"
            cursor.execute(query, selected_ids)
            
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
            conn.execute("PRAGMA foreign_keys = ON")
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
            conn.execute("PRAGMA foreign_keys = ON")
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
            query = "SELECT id, objective, difficulty, topic, type, scenario, question, options, correct_answer, explanations, avg_time, confused_services FROM questions WHERE id IN (" + placeholders + ")"
            cursor.execute(query, question_order)
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

            results = grader.calculate_grade(questions_db, responses, question_order, cursor, session_id)
            score = results['score']
            pass_status = results['pass_status']
            readiness_percentage = results['readiness_percentage']
            passing_probability = results['passing_probability']
            obj_breakdown = results['obj_breakdown']
            diff_breakdown = results['diff_breakdown']
            confidence_analysis = results['confidence_analysis']
            weak_concepts = results['weak_concepts']
            active_confusions = results['active_confusions']
            exam_readiness_matrix = results['exam_readiness_matrix']
            study_plan = results['study_plan']
            learn_recommendations = results['learn_recommendations']
            retest_date = results['retest_date']
            blueprint_weak_pct = results['blueprint_weak_pct']
            blueprint_other_pct = results['blueprint_other_pct']
            question_reviews = results['question_reviews']
            correct_count = results['correct_count']
            incorrect_count = results['incorrect_count']

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
