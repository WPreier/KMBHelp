-- Copy this file, replace the password, run it as a PostgreSQL superuser, then delete the copy.
-- The role owns the database so migrations and the one misread-ticket trigger exception work.
-- It is not a superuser and cannot create other databases or roles.

CREATE ROLE kmbhelp WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'replace-me';
CREATE DATABASE kmbhelp OWNER kmbhelp;
REVOKE ALL ON DATABASE kmbhelp FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE kmbhelp TO kmbhelp;
