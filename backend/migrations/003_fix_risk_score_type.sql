-- Fix risk_score column type from INT to NUMERIC to handle float values
ALTER TABLE ioc_queries 
  ALTER COLUMN risk_score TYPE NUMERIC(5,2);
