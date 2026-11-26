-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
-- supabase_functions_admin и supabase_storage_admin здесь не задаём: в «лёгком» комплекте их нет
-- (их создают webhooks.sql и Storage полного Supabase). ALTER несуществующей роли обрывает первую
-- инициализацию базы на середине, и потом GoTrue падает с «must be owner of function uid».
