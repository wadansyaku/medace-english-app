-- Synthetic long-term history for disposable local D1 only, never deployed.
-- Password: local-only-staff-login (shared public test fixture credential).
WITH labels(label) AS (VALUES('320'),('390'),('landscape'),('tablet'),('desktop'))
INSERT INTO users(id,email,password_hash,display_name,role,grade,english_level,subscription_plan,created_at,updated_at)
SELECT 'long-term-ui-'||label,label||'@long-term-smoke.example.invalid',
 'pbkdf2$100000$c3RhZmYtdGVzdC1vbmx5IQ==$Tf+mvgpMZn2hZKDby4PXHVyy5Z/JRQn0ZnV/yLAI/2A=',
 'Synthetic long-term learner','STUDENT','JHS2','A2','TOC_FREE',1,1 FROM labels;
INSERT INTO learning_histories(user_id,word_id,book_id,status,last_studied_at,next_review_date,
 interval_days,ease_factor,correct_count,attempt_count,total_response_time_ms,interaction_source)
SELECT u.id,w.id,w.book_id,'graduated',1,0,21,2.5,4,4,1000,'STUDY'
FROM users u CROSS JOIN words w WHERE u.id LIKE 'long-term-ui-%' AND w.book_id='naru-shisto-original-v1';
