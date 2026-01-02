-- Create documents table with vector support for n8n
-- This table stores document content with vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI/Groq embeddings are 1536 dimensions
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for anon role
CREATE POLICY "Allow all operations" ON documents
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Create policy to allow all operations for service_role
CREATE POLICY "Allow service_role all" ON documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant table permissions
GRANT ALL ON TABLE documents TO anon;
GRANT ALL ON TABLE documents TO service_role;
GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO service_role;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;

-- Create the match_documents function for LangChain/n8n Supabase Vector Store
-- IMPORTANT: This function signature matches what LangChain expects:
-- Parameters: (query_embedding, match_count, filter)
-- DO NOT change the parameter order or types without updating n8n configuration
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count int,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > 0.0
    AND (filter IS NULL OR filter = '{}'::jsonb OR documents.metadata @> filter)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION match_documents(vector, int, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION match_documents(vector, int, jsonb) TO service_role;

