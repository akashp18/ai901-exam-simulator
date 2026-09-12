import json

def calculate_grade(questions_db, responses, question_order, cursor, session_id):
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


    return {
        "score": score,
        "pass_status": pass_status,
        "readiness_percentage": readiness_percentage,
        "passing_probability": passing_probability,
        "obj_breakdown": obj_breakdown,
        "diff_breakdown": diff_breakdown,
        "confidence_analysis": confidence_analysis,
        "weak_concepts": weak_concepts,
        "active_confusions": active_confusions,
        "exam_readiness_matrix": exam_readiness_matrix,
        "study_plan": study_plan,
        "learn_recommendations": learn_recommendations,
        "retest_date": retest_date,
        "blueprint_weak_pct": blueprint_weak_pct,
        "blueprint_other_pct": blueprint_other_pct,
        "question_reviews": question_reviews,
        "correct_count": correct_count,
        "incorrect_count": incorrect_count
        }
