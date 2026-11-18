<?php
/**
 * Приём заявок с сайта: почта (SMTP Яндекса) + Telegram-бот + журнал на хостинге.
 *
 * Настройки и пароли лежат НЕ в репозитории, а в файле zayavka-config.php
 * на хостинге на уровень выше папки сайта (выкладка с флагом --delete его не тронет):
 *   ~/test.capital-mett.com/docs/        ← сайт (сюда выкладывает GitHub)
 *   ~/test.capital-mett.com/zayavka-config.php  ← настройки (образец: docs/zayavka-config.example.php)
 *   ~/test.capital-mett.com/zayavki/            ← журнал заявок и ошибок (создаётся сам)
 *
 * Проверка из консоли хостинга (SSH):
 *   php ~/test.capital-mett.com/docs/api/zayavka.php --test
 * отправит тестовую заявку и покажет, что дошло, а что нет и почему.
 */

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/lib/PHPMailer/Exception.php';
require __DIR__ . '/lib/PHPMailer/PHPMailer.php';
require __DIR__ . '/lib/PHPMailer/SMTP.php';

const MAX_LEN = 300;          // длина одного поля
const RATE_MAX = 5;           // не больше 5 заявок…
const RATE_WINDOW = 600;      // …за 10 минут с одного адреса

$isCli = PHP_SAPI === 'cli';
$home = dirname(__DIR__, 2);  // папка над public_html
$configFile = getenv('ZAYAVKA_CONFIG') ?: $home . '/zayavka-config.php';
$dataDir = $home . '/zayavki';
date_default_timezone_set('Europe/Moscow');

$cfg = is_file($configFile) ? (require $configFile) : [];
if (!is_array($cfg)) $cfg = [];
$cfg += [
    'mail_to' => '', 'mail_from_name' => 'Сайт Капитал Метт',
    'smtp_host' => 'smtp.yandex.ru', 'smtp_port' => 465, 'smtp_user' => '', 'smtp_pass' => '',
    'tg_token' => '', 'tg_chat' => '', 'tg_api' => 'https://api.telegram.org',
];

/* ---------- Подготовка заявки ---------- */

function clean(?string $s): string
{
    $s = (string) $s;
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    return mb_substr($s, 0, MAX_LEN);
}

function formatPhone(string $raw): ?string
{
    $d = preg_replace('/\D/', '', $raw) ?? '';
    if (strlen($d) === 11 && ($d[0] === '8' || $d[0] === '7')) $d = substr($d, 1);
    if (strlen($d) === 10) {
        return sprintf('+7 (%s) %s-%s-%s', substr($d, 0, 3), substr($d, 3, 3), substr($d, 6, 2), substr($d, 8, 2));
    }
    return strlen($d) >= 10 && strlen($d) <= 15 ? '+' . $d : null; // иностранный номер — как есть
}

/** Строки заявки: [подпись, значение] — пустые поля пропускаются. */
function leadLines(array $in): array
{
    $form = $in['form'] ?? 'call';
    $formName = ['call' => 'Обратный звонок', 'order' => 'Вывоз', 'estimate' => 'Выезд оценщика (демонтаж)', 'rent' => 'Аренда техники'][$form] ?? 'Заявка';
    $whatLabel = ['order' => 'Что вывозим', 'estimate' => 'Что демонтировать'][$form] ?? 'Что сдаёт';
    $addrLabel = $form === 'rent' ? 'Адрес подачи' : 'Адрес объекта';
    $rows = [
        ['Имя', $in['name'] ?? ''],
        ['Телефон', $in['phone'] ?? ''],
        [$whatLabel, $in['what'] ?? ''],
        ['Машина', $in['machine'] ?? ''],
        ['Дата', isset($in['date']) && preg_match('/^(\d{4})-(\d\d)-(\d\d)$/', $in['date'], $m) ? "$m[3].$m[2].$m[1]" : ($in['date'] ?? '')],
        [$addrLabel, $in['address'] ?? ''],
        ['Услуга', $in['service'] ?? ''],
        ['Форма', $formName],
        ['Страница', $in['page'] ?? ''],
        ['Время', date('d.m.Y H:i') . ' МСК'],
    ];
    return array_values(array_filter($rows, fn ($r) => $r[1] !== ''));
}

/* ---------- Каналы доставки ---------- */

function sendMail(array $cfg, array $lines, array $in, bool $test = false): string
{
    if ($cfg['mail_to'] === '') return 'не настроено (mail_to)';
    $m = new PHPMailer(true);
    $m->CharSet = PHPMailer::CHARSET_UTF8;
    $m->Encoding = PHPMailer::ENCODING_BASE64;
    $m->Timeout = 10;
    $m->getSMTPInstance()->Timelimit = 15; // по умолчанию 300 с: зависший сервер держал бы посетителя 5 минут
    if ($cfg['smtp_user'] !== '') {
        $m->isSMTP();
        $m->Host = $cfg['smtp_host'];
        $m->Port = (int) $cfg['smtp_port'];
        // 465 — шифрование сразу (SSL), 587/25 — STARTTLS
        $m->SMTPSecure = in_array((int) $cfg['smtp_port'], [25, 587, 2525], true) ? PHPMailer::ENCRYPTION_STARTTLS : PHPMailer::ENCRYPTION_SMTPS;
        $m->SMTPAuth = true;
        $m->Username = $cfg['smtp_user'];
        $m->Password = $cfg['smtp_pass'];
        $m->setFrom($cfg['smtp_user'], $cfg['mail_from_name']); // Яндекс требует, чтобы отправитель совпадал с логином
    } else {
        $host = preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'capital-mett.com');
        $m->setFrom('noreply@' . $host, $cfg['mail_from_name']); // запасной путь: mail() хостинга, чаще попадает в спам
    }
    foreach (preg_split('/\s*,\s*/', $cfg['mail_to']) as $to) if ($to !== '') $m->addAddress($to);
    $m->Subject = ($test ? '[ТЕСТ] ' : '') . 'Заявка с сайта: ' . trim(($in['name'] ?? '') . ' ' . ($in['phone'] ?? ''));
    $html = '<table cellpadding="6" style="font:15px/1.4 Arial,sans-serif;border-collapse:collapse">';
    $text = '';
    foreach ($lines as [$k, $v]) {
        $vh = htmlspecialchars($v, ENT_QUOTES);
        if ($k === 'Телефон') $vh = '<a href="tel:' . preg_replace('/[^\d+]/', '', $v) . '">' . $vh . '</a>';
        $html .= '<tr><td style="color:#666">' . htmlspecialchars($k) . '</td><td><b>' . $vh . '</b></td></tr>';
        $text .= "$k: $v\n";
    }
    $m->isHTML(true);
    $m->Body = $html . '</table>';
    $m->AltBody = $text;
    $m->send();
    return 'ok';
}

function telegram(array $cfg, string $method, array $params): array
{
    $url = rtrim($cfg['tg_api'], '/') . '/bot' . $cfg['tg_token'] . '/' . $method;
    $body = json_encode($params, JSON_UNESCAPED_UNICODE);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 8,
        ]);
        $res = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n",
            'content' => $body, 'timeout' => 8, 'ignore_errors' => true]]);
        $res = @file_get_contents($url, false, $ctx);
        $err = $res === false ? 'нет соединения' : '';
    }
    if ($res === false || $res === '') return ['ok' => false, 'description' => 'нет связи с ' . parse_url($url, PHP_URL_HOST) . ($err ? " ($err)" : '')];
    $json = json_decode((string) $res, true);
    return is_array($json) ? $json : ['ok' => false, 'description' => 'непонятный ответ: ' . mb_substr((string) $res, 0, 200)];
}

function sendTelegram(array $cfg, array $lines, bool $test = false): string
{
    if ($cfg['tg_token'] === '' || $cfg['tg_chat'] === '') return 'не настроено (tg_token / tg_chat)';
    $msg = ($test ? "🧪 <b>ТЕСТ</b>\n" : '') . "🔔 <b>Новая заявка с сайта</b>\n\n";
    foreach ($lines as [$k, $v]) {
        $v = htmlspecialchars($v, ENT_NOQUOTES);
        $msg .= ($k === 'Телефон' || $k === 'Имя') ? "$k: <b>$v</b>\n" : "$k: $v\n";
    }
    $errors = [];
    foreach (preg_split('/\s*,\s*/', (string) $cfg['tg_chat']) as $chat) {
        if ($chat === '') continue;
        $r = telegram($cfg, 'sendMessage', ['chat_id' => $chat, 'text' => $msg, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true]);
        if (empty($r['ok'])) $errors[] = "чат $chat: " . ($r['description'] ?? 'ошибка');
    }
    return $errors ? implode('; ', $errors) : 'ok';
}

function logLine(string $dir, string $file, array $data): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return false;
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    return @file_put_contents($dir . '/' . $file, json_encode($data, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX) !== false;
}

/* ---------- Проверка из консоли: php zayavka.php --test ---------- */

if ($isCli) {
    if (!in_array('--test', $argv, true)) { echo "Запуск: php zayavka.php --test\n"; exit(0); }
    echo "Настройки: $configFile " . (is_file($configFile) ? "— найден\n" : "— НЕ НАЙДЕН\n");
    $in = ['name' => 'Тест', 'phone' => '+7 (900) 000-00-00', 'what' => 'проверка формы', 'form' => 'call', 'page' => 'консоль хостинга'];
    $lines = leadLines($in);
    try { $mail = sendMail($cfg, $lines, $in, true); } catch (Throwable $e) { $mail = 'ошибка: ' . $e->getMessage(); }
    echo "Почта ({$cfg['mail_to']}): $mail\n";
    if ($cfg['tg_token'] !== '') {
        $me = telegram($cfg, 'getMe', []);
        echo 'Связь с Telegram (' . parse_url($cfg['tg_api'], PHP_URL_HOST) . '): '
            . (!empty($me['ok']) ? 'есть, бот @' . $me['result']['username'] : 'НЕТ — ' . ($me['description'] ?? '')) . "\n";
    }
    echo 'Telegram: ' . sendTelegram($cfg, $lines, true) . "\n";
    echo 'Журнал: ' . (logLine($dataDir, 'test.log', ['time' => date('c'), 'test' => true]) ? "пишется в $dataDir\n" : "НЕ пишется в $dataDir — проверьте права\n");
    exit(0);
}

/* ---------- Приём заявки с сайта ---------- */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$reply = function (int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; };

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') $reply(405, ['ok' => false, 'error' => 'method']);

// Ловушка для ботов: скрытое поле, человек его не видит и не заполняет. Боту отвечаем «ок» и ничего не шлём.
if (clean($_POST['website'] ?? '') !== '') $reply(200, ['ok' => true]);

$in = [];
foreach (['name', 'phone', 'what', 'address', 'machine', 'date', 'service', 'form', 'page'] as $f) $in[$f] = clean($_POST[$f] ?? '');
$phone = formatPhone($in['phone']);
if ($phone === null) $reply(400, ['ok' => false, 'error' => 'phone']);
if (empty($_POST['agree'])) $reply(400, ['ok' => false, 'error' => 'agree']);
$in['phone'] = $phone;

// Не больше RATE_MAX заявок за RATE_WINDOW секунд с одного IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$rateFile = sys_get_temp_dir() . '/cm-zayavka-' . sha1($ip . __DIR__);
$now = time();
$hits = array_filter(array_map('intval', explode(',', (string) @file_get_contents($rateFile))), fn ($t) => $t > $now - RATE_WINDOW);
if (count($hits) >= RATE_MAX) $reply(429, ['ok' => false, 'error' => 'rate']);
$hits[] = $now;
@file_put_contents($rateFile, implode(',', $hits), LOCK_EX);

$lines = leadLines($in);

// Сначала журнал на хостинге (в России): заявка не потеряется, даже если почта и Telegram упадут
$saved = logLine($dataDir, 'zayavki-' . date('Y-m') . '.log', ['time' => date('c')] + array_filter($in) + ['ip' => $ip]);

try { $mail = sendMail($cfg, $lines, $in); } catch (Throwable $e) { $mail = 'ошибка: ' . $e->getMessage(); }
$tg = sendTelegram($cfg, $lines);

if ($mail !== 'ok' || $tg !== 'ok' || !$saved) {
    logLine($dataDir, 'errors.log', ['time' => date('c'), 'phone' => $phone, 'mail' => $mail, 'telegram' => $tg, 'journal' => $saved]);
}
if ($mail === 'ok' || $tg === 'ok') $reply(200, ['ok' => true]);
$reply(500, ['ok' => false, 'error' => 'delivery']);
