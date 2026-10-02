<?php
// KI-Assistent: Analyse des Schachtfotos (Draufsicht) mit Claude über das offizielle Anthropic-PHP-SDK.
// Liefert ausschließlich VORSCHLÄGE – die Kodierung verantwortet der Inspekteur.

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Anthropic\Client;

function sb_ai_schema(array $codes): array
{
    $finding = [
        'type' => 'object',
        'properties' => [
            'code' => ['type' => 'string', 'enum' => $codes, 'description' => 'Hauptkode (3 Buchstaben)'],
            'c1' => ['type' => 'string', 'description' => 'Charakterisierung 1 (Buchstabe) oder leer'],
            'c2' => ['type' => 'string', 'description' => 'Charakterisierung 2 (Buchstabe) oder leer'],
            'q1' => ['type' => 'number', 'description' => 'Quantifizierung 1 in der Einheit des Kodes, 0 wenn nicht schätzbar'],
            'clockFrom' => ['type' => 'integer', 'description' => 'Lage am Umfang 1–12 (0 = unbekannt)'],
            'clockTo' => ['type' => 'integer', 'description' => 'Ende eines Bereichs 1–12, 0 bei punktueller Lage'],
            'bereich' => ['type' => 'string', 'enum' => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '']],
            'depthFromTop' => ['type' => 'number', 'description' => 'grobe Tiefe ab OK Deckel in m, -1 wenn nicht abschätzbar'],
            'confidence' => ['type' => 'number', 'description' => '0 bis 1'],
            'reason' => ['type' => 'string', 'description' => 'kurze Begründung, was im Bild zu sehen ist'],
            'comment' => ['type' => 'string', 'description' => 'Anmerkungstext für das Protokoll (kurz) oder leer'],
        ],
        'required' => ['code', 'c1', 'c2', 'q1', 'clockFrom', 'clockTo', 'bereich', 'depthFromTop', 'confidence', 'reason', 'comment'],
        'additionalProperties' => false,
    ];
    $connection = [
        'type' => 'object',
        'properties' => [
            'clock' => ['type' => 'integer', 'description' => 'Lage der Rohröffnung 1–12'],
            'direction' => ['type' => 'string', 'enum' => ['in', 'out', 'unknown']],
            'dnEstimate' => ['type' => 'integer', 'description' => 'geschätzte Nennweite in mm, 0 wenn unbekannt'],
            'confidence' => ['type' => 'number'],
        ],
        'required' => ['clock', 'direction', 'dnEstimate', 'confidence'],
        'additionalProperties' => false,
    ];
    return [
        'type' => 'object',
        'properties' => [
            'summary' => ['type' => 'string', 'description' => 'Ein bis zwei Sätze Gesamteinschätzung auf Deutsch'],
            'quality' => ['type' => 'string', 'description' => 'Bildqualität/Einschränkungen (Licht, Schärfe, Wasser) auf Deutsch'],
            'connections' => ['type' => 'array', 'items' => $connection],
            'findings' => ['type' => 'array', 'items' => $finding],
        ],
        'required' => ['summary', 'quality', 'connections', 'findings'],
        'additionalProperties' => false,
    ];
}

function sb_ai_prompt(array $context, array $catalog): string
{
    $clock = $context['uhr'] ?? [];
    $orientation = sprintf(
        'Im Bild liegt der Schachtmittelpunkt bei x=%.0f %%, y=%.0f %% der Bildbreite/-höhe. Die 12-Uhr-Richtung (tiefster Auslauf) zeigt um %.0f° im Uhrzeigersinn gedreht gegenüber „nach oben im Bild“.',
        100 * (float) ($clock['cx'] ?? 0.5), 100 * (float) ($clock['cy'] ?? 0.5), (float) ($clock['rot'] ?? 0)
    );
    $known = json_encode($context['anschluesse'] ?? [], JSON_UNESCAPED_UNICODE);
    $cat = json_encode($catalog, JSON_UNESCAPED_UNICODE);
    $depth = isset($context['tiefe']) && $context['tiefe'] !== null ? number_format((float) $context['tiefe'], 2, ',', '') . ' m' : 'unbekannt';
    $schacht = preg_replace('/[^\w .\/-]/u', '', (string) ($context['schacht'] ?? '?'));
    $dn = (int) ($context['dn'] ?? 0) ?: 'unbekannt';
    return <<<TXT
Du unterstützt einen zertifizierten Kanalinspekteur bei der optischen Inspektion eines Abwasserschachts nach DIN EN 13508-2 / ISYBAU (BFR Abwasser).

Das Foto wurde senkrecht von oben durch die geöffnete Schachtabdeckung aufgenommen (Draufsicht).
Konvention für die Lage am Umfang: Zifferblatt in der Draufsicht, der tiefste abgehende Kanal (Auslauf) liegt bei 12 Uhr, Zählung im Uhrzeigersinn.
$orientation
Schacht: {$schacht} · Tiefe {$depth} · Schacht-DN {$dn} mm · bereits erfasste Anschlüsse: $known
Schachtbereiche: A Abdeckung/Rahmen, B Auflageringe, C Schachtaufbau (Wand), D Konus, E Übergangsplatte, F untere Schachtzone, G Podest, H Auftritt, I Gerinne, J Sohle.

Zulässige Kodes mit Charakterisierungen (Format Kürzel=Bedeutung):
$cat

Aufgabe:
1. Erkenne die sichtbaren Rohröffnungen (Zu- und Abläufe) mit ihrer Lage am Umfang und, falls möglich, grober Nennweite.
2. Erkenne deutlich sichtbare Zustände (z. B. Risse, Oberflächenschäden, Infiltration, Ablagerungen, schadhafte Steighilfen, Wurzeln, Inkrustationen) und kodiere sie mit Hauptkode und passenden Charakterisierungen aus der Liste.
3. Sei zurückhaltend: Melde nur, was im Bild wirklich zu erkennen ist, und gib eine ehrliche Sicherheit (confidence) an. Lieber ein Befund weniger als ein erfundener.
4. Tiefen lassen sich aus einem Einzelfoto nur grob abschätzen – gib -1 an, wenn du unsicher bist.
5. Antworte auf Deutsch. Mängelfreie Bereiche nicht als Befund melden.
TXT;
}

function sb_ai_analyze(array $in): array
{
    $cfg = sb_config();
    $image = (string) ($in['image'] ?? '');
    $mediaType = in_array($in['mediaType'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true) ? $in['mediaType'] : 'image/jpeg';
    if ($image === '' || strlen($image) > 10_000_000 || base64_decode($image, true) === false) {
        sb_fail(400, 'Bild fehlt oder ist ungültig.');
    }
    $catalog = is_array($in['catalog'] ?? null) ? array_slice($in['catalog'], 0, 80) : [];
    $codes = [];
    foreach ($catalog as $c) {
        if (is_array($c) && preg_match('/^[A-Z]{3}$/', (string) ($c['code'] ?? ''))) {
            $codes[] = $c['code'];
        }
    }
    if (!$codes) {
        sb_fail(400, 'Kodekatalog fehlt.');
    }
    $context = is_array($in['context'] ?? null) ? $in['context'] : [];

    $client = new Client(apiKey: $cfg['anthropic_api_key'], baseUrl: ($cfg['ai_base_url'] ?? null) ?: null);
    try {
        $message = $client->beta->messages->create(
            model: $cfg['ai_model'] ?? 'claude-opus-5-5',
            maxTokens: 16000,
            messages: [[
                'role' => 'user',
                'content' => [
                    ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $mediaType, 'data' => $image]],
                    ['type' => 'text', 'text' => sb_ai_prompt($context, $catalog)],
                ],
            ]],
            outputConfig: [
                'effort' => $cfg['ai_effort'] ?? 'high',
                'format' => ['type' => 'json_schema', 'schema' => sb_ai_schema(array_values(array_unique($codes)))],
            ],
            // Bei einer Ablehnung durch die Sicherheitsfilter automatisch auf das empfohlene Ersatzmodell ausweichen
            fallbacks: 'default',
            betas: ['server-side-fallback-2026-07-01'],
        );
    } catch (\Anthropic\Core\Exceptions\APIStatusException $e) {
        error_log('[schachtblick] KI-Fehler: ' . $e->getMessage());
        sb_fail(502, 'KI-Dienst nicht erreichbar oder Anfrage abgelehnt.');
    }

    if ($message->stopReason === 'refusal') {
        sb_fail(422, 'Die KI hat die Analyse dieses Bildes abgelehnt.');
    }
    $text = '';
    foreach ($message->content as $block) {
        if ($block->type === 'text') {
            $text .= $block->text;
        }
    }
    $data = json_decode($text, true);
    if (!is_array($data)) {
        sb_fail(502, 'Antwort der KI konnte nicht gelesen werden.');
    }

    $clampClock = fn($v) => ($v = (int) $v) >= 1 && $v <= 12 ? $v : null;
    $findings = [];
    foreach ($data['findings'] ?? [] as $f) {
        if (!in_array($f['code'] ?? '', $codes, true)) {
            continue;
        }
        $findings[] = [
            'code' => $f['code'],
            'c1' => preg_match('/^[A-Z]$/', (string) ($f['c1'] ?? '')) ? $f['c1'] : '',
            'c2' => preg_match('/^[A-Z]$/', (string) ($f['c2'] ?? '')) ? $f['c2'] : '',
            'q1' => isset($f['q1']) && (float) $f['q1'] > 0 ? round((float) $f['q1'], 1) : null,
            'clockFrom' => $clampClock($f['clockFrom'] ?? 0),
            'clockTo' => $clampClock($f['clockTo'] ?? 0),
            'bereich' => preg_match('/^[A-J]$/', (string) ($f['bereich'] ?? '')) ? $f['bereich'] : '',
            'depthFromTop' => isset($f['depthFromTop']) && (float) $f['depthFromTop'] >= 0 ? round((float) $f['depthFromTop'], 2) : null,
            'confidence' => max(0, min(1, (float) ($f['confidence'] ?? 0))),
            'reason' => mb_substr((string) ($f['reason'] ?? ''), 0, 300),
            'comment' => mb_substr((string) ($f['comment'] ?? ''), 0, 200),
        ];
    }
    $connections = [];
    foreach ($data['connections'] ?? [] as $c) {
        $clock = $clampClock($c['clock'] ?? 0);
        if (!$clock) {
            continue;
        }
        $connections[] = [
            'clock' => $clock,
            'direction' => in_array($c['direction'] ?? '', ['in', 'out'], true) ? $c['direction'] : 'unknown',
            'dnEstimate' => ($dn = (int) ($c['dnEstimate'] ?? 0)) > 0 ? $dn : null,
            'confidence' => max(0, min(1, (float) ($c['confidence'] ?? 0))),
        ];
    }
    return [
        'summary' => mb_substr((string) ($data['summary'] ?? ''), 0, 600),
        'quality' => mb_substr((string) ($data['quality'] ?? ''), 0, 300),
        'findings' => $findings,
        'connections' => $connections,
        'model' => $message->model,
    ];
}
