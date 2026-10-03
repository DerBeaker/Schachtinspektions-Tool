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
    sb_migrate();
}

// ---------------------------------------------------------------- Migrationen

const SB_SCHEMA_VERSION = 3;

function sb_columns(string $table): array
{
    $db = sb_db();
    if (sb_driver() === 'sqlite') {
        return array_map(fn($r) => $r['name'], $db->query("PRAGMA table_info($table)")->fetchAll());
    }
    return array_map(fn($r) => $r['Field'], $db->query("SHOW COLUMNS FROM $table")->fetchAll());
}

function sb_add_column(string $table, string $column, string $sqlite, string $mysql): void
{
    if (!in_array($column, sb_columns($table), true)) {
        sb_db()->exec("ALTER TABLE $table ADD COLUMN $column " . (sb_driver() === 'sqlite' ? $sqlite : $mysql));
    }
}

function sb_has_index(string $table, string $name): bool
{
    $db = sb_db();
    if (sb_driver() === 'sqlite') {
        $st = $db->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?");
        $st->execute([$name]);
        return (int) $st->fetchColumn() > 0;
    }
    $st = $db->prepare("SHOW INDEX FROM $table WHERE Key_name = ?");
    $st->execute([$name]);
    return (bool) $st->fetch();
}

/**
 * Version 2 (mehrere Firmen): Lizenzfelder und Firmendaten je Mandant, E-Mail-Anmeldung,
 * Betreiber-Kennzeichen, Einladungen und Passwort-Links.
 * Version 3 (Tarife): Tarif und Abo je Firma, Registrierungsdaten an Einmal-Links,
 * angenommene Verträge (AGB/AVV) und Aufträge (Buchung, Änderung, Kündigung).
 */
function sb_migrate(): void
{
    $db = sb_db();
    $lite = sb_driver() === 'sqlite';
    $opt = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $db->exec($lite
        ? 'CREATE TABLE IF NOT EXISTS sb_meta (k TEXT PRIMARY KEY, v TEXT)'
        : "CREATE TABLE IF NOT EXISTS sb_meta (k VARCHAR(40) PRIMARY KEY, v TEXT) $opt");
    $db->exec($lite
        ? 'CREATE TABLE IF NOT EXISTS sb_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
            tenant_id INTEGER NOT NULL, user_id INTEGER, email TEXT, name TEXT, role TEXT, created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL, used_at INTEGER, created_by INTEGER)'
        : "CREATE TABLE IF NOT EXISTS sb_tokens (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, token_hash CHAR(64) NOT NULL UNIQUE, kind VARCHAR(10) NOT NULL,
            tenant_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NULL, email VARCHAR(190) NULL, name VARCHAR(120) NULL, role VARCHAR(20) NULL,
            created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, used_at BIGINT NULL, created_by INT UNSIGNED NULL, INDEX (tenant_id)) $opt");
    sb_add_column('sb_tenants', 'active', 'INTEGER NOT NULL DEFAULT 1', 'TINYINT NOT NULL DEFAULT 1');
    sb_add_column('sb_tenants', 'max_users', 'INTEGER', 'INT NULL');
    sb_add_column('sb_tenants', 'valid_until', 'INTEGER', 'BIGINT NULL');
    sb_add_column('sb_tenants', 'note', 'TEXT', 'TEXT NULL');
    sb_add_column('sb_tenants', 'contact', 'TEXT', 'VARCHAR(190) NULL');
    sb_add_column('sb_tenants', 'firma', 'TEXT', 'MEDIUMTEXT NULL');
    sb_add_column('sb_tenants', 'firma_updated', 'INTEGER NOT NULL DEFAULT 0', 'BIGINT NOT NULL DEFAULT 0');
    sb_add_column('sb_users', 'email', 'TEXT', 'VARCHAR(190) NULL');
    sb_add_column('sb_users', 'operator', 'INTEGER NOT NULL DEFAULT 0', 'TINYINT NOT NULL DEFAULT 0');
    sb_add_column('sb_users', 'last_login', 'INTEGER', 'BIGINT NULL');
    // Version 3: Tarife, Verträge, Aufträge (bestehende Firmen wurden vom Betreiber angelegt -> „pro“)
    sb_add_column('sb_tenants', 'plan', "TEXT NOT NULL DEFAULT 'pro'", "VARCHAR(10) NOT NULL DEFAULT 'pro'");
    sb_add_column('sb_tenants', 'abo', 'TEXT', 'TEXT NULL');
    sb_add_column('sb_tokens', 'data', 'TEXT', 'TEXT NULL');
    $db->exec($lite
        ? 'CREATE TABLE IF NOT EXISTS sb_vertraege (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, firma TEXT, art TEXT NOT NULL,
            version TEXT NOT NULL, accepted_at INTEGER NOT NULL, user_id INTEGER, name TEXT, funktion TEXT, email TEXT)'
        : "CREATE TABLE IF NOT EXISTS sb_vertraege (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id INT UNSIGNED NOT NULL, firma VARCHAR(120) NULL,
            art VARCHAR(10) NOT NULL, version VARCHAR(20) NOT NULL, accepted_at BIGINT NOT NULL, user_id INT UNSIGNED NULL, name VARCHAR(120) NULL,
            funktion VARCHAR(80) NULL, email VARCHAR(190) NULL, INDEX (tenant_id)) $opt");
    $db->exec($lite
        ? 'CREATE TABLE IF NOT EXISTS sb_auftraege (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, firma TEXT, user_id INTEGER,
            art TEXT NOT NULL, created_at INTEGER NOT NULL, daten TEXT, erledigt_at INTEGER)'
        : "CREATE TABLE IF NOT EXISTS sb_auftraege (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id INT UNSIGNED NOT NULL, firma VARCHAR(120) NULL,
            user_id INT UNSIGNED NULL, art VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL, daten TEXT NULL, erledigt_at BIGINT NULL, INDEX (tenant_id)) $opt");
    if (!sb_has_index('sb_users', 'sb_users_email')) {
        $db->exec('CREATE UNIQUE INDEX sb_users_email ON sb_users (email)');
    }
    // bestehende Installation: der erste Administrator wird Betreiber
    if ((int) $db->query('SELECT COUNT(*) FROM sb_users WHERE operator = 1')->fetchColumn() === 0) {
        $db->exec("UPDATE sb_users SET operator = 1 WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM sb_users WHERE role = 'admin') x)");
    }
    $st = $db->prepare($lite ? 'INSERT OR REPLACE INTO sb_meta (k, v) VALUES (?, ?)' : 'REPLACE INTO sb_meta (k, v) VALUES (?, ?)');
    $st->execute(['schema', (string) SB_SCHEMA_VERSION]);
}

/** Vor jeder Anfrage: Schema bei Bedarf nachziehen (nach einem Update der Dateien). */
function sb_migrate_if_needed(): void
{
    try {
        $v = (int) sb_db()->query("SELECT v FROM sb_meta WHERE k = 'schema'")->fetchColumn();
    } catch (Throwable) {
        $v = 0;
    }
    if ($v < SB_SCHEMA_VERSION && sb_is_installed()) {
        sb_migrate();
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
