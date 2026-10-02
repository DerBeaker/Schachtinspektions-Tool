<?php
// Datenbankschema (MySQL/MariaDB und SQLite).

declare(strict_types=1);

function sb_schema_sql(string $driver): array
{
    if ($driver === 'sqlite') {
        return [
            'CREATE TABLE IF NOT EXISTS sb_tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS sb_users (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL REFERENCES sb_tenants(id),
                username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'inspector\',
                active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS sb_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
                created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS sb_login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS sb_revs (id INTEGER PRIMARY KEY AUTOINCREMENT)',
            'CREATE TABLE IF NOT EXISTS sb_records (tenant_id INTEGER NOT NULL, type TEXT NOT NULL, id TEXT NOT NULL, project_id TEXT,
                rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, updated_by INTEGER,
                PRIMARY KEY (tenant_id, type, id))',
            'CREATE INDEX IF NOT EXISTS sb_records_rev ON sb_records (tenant_id, rev)',
            'CREATE TABLE IF NOT EXISTS sb_photos (tenant_id INTEGER NOT NULL, id TEXT NOT NULL, inspection_id TEXT, project_id TEXT,
                size INTEGER NOT NULL, width INTEGER, height INTEGER, rev INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by INTEGER, PRIMARY KEY (tenant_id, id))',
            'CREATE INDEX IF NOT EXISTS sb_photos_rev ON sb_photos (tenant_id, rev)',
        ];
    }
    $opt = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS sb_tenants (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, created_at BIGINT NOT NULL) $opt",
        "CREATE TABLE IF NOT EXISTS sb_users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id INT UNSIGNED NOT NULL,
            username VARCHAR(80) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, pass_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'inspector', active TINYINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL,
            CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES sb_tenants(id)) $opt",
        "CREATE TABLE IF NOT EXISTS sb_sessions (token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
            created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
            CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES sb_users(id) ON DELETE CASCADE) $opt",
        "CREATE TABLE IF NOT EXISTS sb_login_attempts (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL,
            ip VARCHAR(64) NOT NULL, at BIGINT NOT NULL, INDEX (username, at)) $opt",
        "CREATE TABLE IF NOT EXISTS sb_revs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY) $opt",
        "CREATE TABLE IF NOT EXISTS sb_records (tenant_id INT UNSIGNED NOT NULL, type VARCHAR(20) NOT NULL, id VARCHAR(64) NOT NULL,
            project_id VARCHAR(64) NULL, rev BIGINT UNSIGNED NOT NULL, updated_at BIGINT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0,
            data LONGTEXT NOT NULL, updated_by INT UNSIGNED NULL, PRIMARY KEY (tenant_id, type, id), INDEX sb_records_rev (tenant_id, rev)) $opt",
        "CREATE TABLE IF NOT EXISTS sb_photos (tenant_id INT UNSIGNED NOT NULL, id VARCHAR(64) NOT NULL, inspection_id VARCHAR(64) NULL,
            project_id VARCHAR(64) NULL, size INT UNSIGNED NOT NULL, width INT UNSIGNED NULL, height INT UNSIGNED NULL, rev BIGINT UNSIGNED NOT NULL, created_at BIGINT NOT NULL,
            created_by INT UNSIGNED NULL, PRIMARY KEY (tenant_id, id), INDEX sb_photos_rev (tenant_id, rev)) $opt",
    ];
}

function sb_install_schema(): void
{
    foreach (sb_schema_sql(sb_driver()) as $sql) {
        sb_db()->exec($sql);
    }
}

function sb_is_installed(): bool
{
    try {
        return (int) sb_db()->query('SELECT COUNT(*) FROM sb_users')->fetchColumn() > 0;
    } catch (Throwable) {
        return false;
    }
}
