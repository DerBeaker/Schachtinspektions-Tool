<?php
// Konfiguration des Schachtblick-Servers.
// Diese Datei als "config.php" kopieren und anpassen. config.php niemals veröffentlichen!

return [
    // Datenbank – bei IONOS: Hosting > Datenbanken > MySQL/MariaDB anlegen und die Zugangsdaten eintragen.
    'db_dsn'  => 'mysql:host=db5000000000.hosting-data.io;dbname=dbs0000000;charset=utf8mb4',
    'db_user' => 'dbu0000000',
    'db_pass' => 'GEHEIM',
    // Alternative für Tests/kleine Installationen ohne MySQL:
    // 'db_dsn' => 'sqlite:' . __DIR__ . '/data/schachtblick.sqlite',

    // Ablage der Fotos. Am besten außerhalb des öffentlichen Webordners, sonst ./data (per .htaccess geschützt).
    'photo_dir' => __DIR__ . '/data/photos',
    'max_photo_mb' => 15,

    // Sitzungsdauer in Tagen
    'session_days' => 30,

    // Adresse der App für Links in E-Mails (Einladungen, „Passwort vergessen“).
    // Leer = automatisch (Ordner über api/), z. B. 'https://app.mmse-software.com/'
    'app_url' => '',
    // E-Mails (Einladungen, „Passwort vergessen“). Empfohlen bei IONOS: Versand per SMTP über ein
    // vorhandenes Postfach der eigenen Domain (im IONOS-Kundenbereich unter „E-Mail“ anlegen).
    // Ohne 'smtp' wird PHP mail() verwendet – das klappt bei IONOS nur mit einem gültigen Absender.
    // 'smtp' => [
    //     'host' => 'smtp.ionos.de',
    //     'port' => 465,                         // 465 = SSL, 587 = STARTTLS
    //     'user' => 'noreply@mmse-software.com', // Postfach-Adresse
    //     'pass' => 'POSTFACH-PASSWORT',
    // ],
    // Absender (Standard: das SMTP-Postfach). Muss ein Postfach der eigenen Domain sein.
    'mail_from' => 'noreply@mmse-software.com',
    // false = keine E-Mails senden (Links werden dann nur in der App angezeigt)
    'mail' => true,
    // Benachrichtigungen über Registrierungen, Buchungen und Kündigungen (leer = E-Mail des Betreiber-Kontos)
    'betreiber_email' => '',

    // Nur nötig, wenn App und API auf unterschiedlichen Domains liegen, z. B. ['https://app.example.de']
    'cors_origins' => [],

    // Optional: KI-Assistent (Bildanalyse mit Claude). Leer lassen = deaktiviert.
    // Voraussetzung: im Ordner api/ einmalig "composer install" ausführen (siehe README).
    'anthropic_api_key' => '',
    'ai_model' => 'claude-opus-5-5',
    'ai_effort' => 'high',
];
