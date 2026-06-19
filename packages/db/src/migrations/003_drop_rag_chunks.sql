-- 003_drop_rag_chunks.sql
-- Pivoted away from Chroma/Ollama RAG — semantic search isn't a shipping feature.
-- Drops the table for any database that applied 001 before it was edited.
DROP INDEX IF EXISTS idx_rag_date_type;
DROP TABLE IF EXISTS rag_chunks;
