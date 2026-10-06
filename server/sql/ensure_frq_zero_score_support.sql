-- Forward-only repair: the historical zero-score upgrade was manual and may
-- have been baselined without execution. Repair both direct edits and RPC saves.
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Only replace single-column score checks; preserve unrelated constraints.
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'score'
    WHERE c.conrelid = 'public.frq_reviews'::regclass
      AND c.contype = 'c'
      AND c.conkey = ARRAY[a.attnum]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.frq_reviews DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.frq_reviews
  ADD CONSTRAINT frq_reviews_score_check CHECK (score BETWEEN 0 AND 4);

CREATE OR REPLACE FUNCTION public.save_frq_review(
  resume_id_input UUID,
  score_input SMALLINT,
  notes_input TEXT,
  graded_by_input INT,
  cycle_id_input UUID,
  round_id_input UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF score_input IS NULL OR score_input < 0 OR score_input > 4 THEN
    RAISE EXCEPTION 'FRQ score must be between 0 and 4';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.frq_reviews
    WHERE resume_id = resume_id_input
      AND graded_by = graded_by_input
      AND cycle_id = cycle_id_input
  ) THEN
    RAISE EXCEPTION 'You have already graded this candidate''s application responses'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.frq_reviews (resume_id, score, notes, graded_by, cycle_id, round_id)
  VALUES (resume_id_input, score_input, notes_input, graded_by_input, cycle_id_input, round_id_input);

  UPDATE public.resumes
  SET frq_review_count = frq_review_count + 1
  WHERE id = resume_id_input;
END;
$$;
