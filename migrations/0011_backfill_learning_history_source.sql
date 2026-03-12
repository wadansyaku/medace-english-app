UPDATE learning_histories
SET interaction_source = 'STUDY'
WHERE interaction_source IS NULL;
