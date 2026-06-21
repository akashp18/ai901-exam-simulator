import sqlite3
import json
import sys

DB_FILE = "ai901_simulator.db"

def run_checks():
    print("=== Running Database Validation Checks ===")
    
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
    except Exception as e:
        print(f"FAIL: Could not open database file. Error: {e}")
        sys.exit(1)
        
    # Check total questions
    cursor.execute("SELECT COUNT(*) FROM questions")
    total_q = cursor.fetchone()[0]
    print(f"Total questions found in pool: {total_q}")
    if total_q < 200:
        print(f"WARNING: Pool size is {total_q}. Plan required at least 200. (Actual target: 350+)")
    
    # Check details of buckets
    cursor.execute("""
    SELECT objective, difficulty, COUNT(*) 
    FROM questions 
    GROUP BY objective, difficulty
    """)
    rows = cursor.fetchall()
    
    buckets = {}
    for r in rows:
        obj, diff, count = r[0], r[1], r[2]
        if obj not in buckets:
            buckets[obj] = {}
        buckets[obj][diff] = count
        
    print("\nQuestion Distribution in Database Pool:")
    
    targets = [
        {"obj": "Objective 1", "diff": "easy", "draw_limit": 4},
        {"obj": "Objective 1", "diff": "medium", "draw_limit": 11},
        {"obj": "Objective 1", "diff": "hard", "draw_limit": 6},
        {"obj": "Objective 2", "diff": "easy", "draw_limit": 6},
        {"obj": "Objective 2", "diff": "medium", "draw_limit": 14},
        {"obj": "Objective 2", "diff": "hard", "draw_limit": 9}
    ]
    
    has_issues = False
    for t in targets:
        obj = t["obj"]
        diff = t["diff"]
        draw = t["draw_limit"]
        
        available = buckets.get(obj, {}).get(diff, 0)
        print(f" - {obj} ({diff}): {available} questions in pool (Required for drawing: {draw})")
        
        if available < draw:
            print(f"  --> ERROR: Insufficient questions in pool for {obj} ({diff})! Need {draw}, have {available}.")
            has_issues = True
            
    # Check JSON formatting checks
    cursor.execute("SELECT id, options, correct_answer, explanations, confused_services FROM questions")
    q_records = cursor.fetchall()
    
    json_errors = 0
    for q_id, opt, ans, exp, conf in q_records:
        try:
            json.loads(opt)
            json.loads(ans)
            json.loads(exp)
            json.loads(conf)
        except Exception as err:
            print(f"  --> JSON ERROR on Question {q_id}: {err}")
            json_errors += 1
            has_issues = True
            
    if json_errors == 0:
        print("\nJSON parsing check: PASSED (All records contain valid JSON arrays/objects)")
    else:
        print(f"\nJSON parsing check: FAILED with {json_errors} errors")

    conn.close()
    
    if has_issues:
        print("\n=== Validation Status: FAILED ===")
        sys.exit(1)
    else:
        print("\n=== Validation Status: PASSED ===")
        sys.exit(0)

if __name__ == "__main__":
    run_checks()
